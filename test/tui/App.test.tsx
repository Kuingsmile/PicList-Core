import { EventEmitter } from 'node:events'

import { cleanup, render } from 'ink-testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../src/tui/App'
import { TuiError, TuiSession } from '../../src/tui/session'
import type { IPicGo } from '../../src/types'

afterEach(cleanup)

function setup(configured = true) {
  const ctx = Object.assign(new EventEmitter(), {
    configPath: '/tmp/piclist-test/config.json',
    getConfig: vi.fn(key =>
      key === 'picBed.smms' && configured ? { _configName: 'Default', token: 'test-token' } : undefined,
    ),
    cmd: { inquirer: { prompt: vi.fn() } },
    log: {},
  }) as unknown as IPicGo
  const session = new TuiSession()
  session.attach(ctx)
  return { ctx, session }
}

const ready = () => new Promise(resolve => setTimeout(resolve, 40))

describe('Ink application navigation', () => {
  it('guides a first-time user to destination setup', async () => {
    const { ctx, session } = setup(false)
    const ui = render(<App ctx={ctx} session={session} />)
    await ready()
    expect(ui.lastFrame()).toContain('Setup needed')
    expect(ui.lastFrame()).toContain('› Set up a destination')
    expect(ui.lastFrame()).toContain('Give your images a home.')
    expect(ui.lastFrame()).not.toContain('test-token')
    await session.dispose()
  })

  it('switches sections using Tab, Shift+Tab and number shortcuts', async () => {
    const { ctx, session } = setup()
    const ui = render(<App ctx={ctx} session={session} />)
    await ready()
    ui.stdin.write('\t')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Saved configurations'))
    ui.stdin.write('\u001B[Z')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Files & URLs'))
    ui.stdin.write('4')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Form language'))
    await session.dispose()
  })

  it('filters all actions without treating search text as navigation shortcuts', async () => {
    const { ctx, session } = setup()
    const ui = render(<App ctx={ctx} session={session} />)
    await ready()
    ui.stdin.write('/')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Find an action'))
    ui.stdin.write('proxy')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('1 MATCHING ACTIONS'))
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Upload proxy URL'))
    expect(session.getSnapshot().prompt?.question.type).toBe('password')
    ui.stdin.write('\u001B')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Form language'))
    await session.dispose()
  })

  it('handles an empty search and closes it without exiting', async () => {
    const { ctx, session } = setup()
    const ui = render(<App ctx={ctx} session={session} />)
    await ready()
    ui.stdin.write('/')
    await ready()
    ui.stdin.write('qqq-no-such-action')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('No matches'))
    ui.stdin.write('\r')
    expect(session.getSnapshot().busy).toBe(false)
    ui.stdin.write('\u001B')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Files & URLs'))
    await session.dispose()
  })

  it.each([
    [100, 30],
    [80, 24],
    [52, 22],
  ])('fits the workspace into a %s × %s terminal', async (columns, rows) => {
    const { ctx, session } = setup()
    const ui = render(<App ctx={ctx} session={session} />)
    await ready()
    Object.defineProperty(ui.stdout, 'columns', { value: columns, configurable: true })
    Object.defineProperty(ui.stdout, 'rows', { value: rows, configurable: true })
    ui.stdout.emit('resize')
    await ready()
    const lines = ui.lastFrame()!.split('\n')
    expect(lines.length).toBeLessThanOrEqual(rows)
    expect(Math.max(...lines.map(line => [...line].length))).toBeLessThanOrEqual(columns)
    expect(ui.lastFrame()).toContain('Set up a destination')
    expect(ui.lastFrame()).toContain('quit')
    ui.stdin.write('/')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('MATCHING ACTIONS'))
    expect(ui.lastFrame()!.split('\n').length).toBeLessThanOrEqual(rows)
    await session.dispose()
  })
  it('opens an upload form, keeps q as text input, and returns to the menu on Escape', async () => {
    const { ctx, session } = setup()
    const ui = render(<App ctx={ctx} session={session} />)
    await ready()
    expect(ui.lastFrame()).toContain('◆ PICLIST')
    expect(ui.lastFrame()).toContain('Files & URLs')
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('File paths or URLs'))
    ui.stdin.write('q')
    await ready()
    expect(session.getSnapshot().busy).toBe(true)
    ui.stdin.write('\u001B')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Cancelled'))
    expect(session.getSnapshot().busy).toBe(false)
    expect(ui.lastFrame()).toContain('Set up a destination')
    await session.dispose()
  })

  it('shows results, returns to the menu, and reopens them with r', async () => {
    const { ctx, session } = setup()
    const ui = render(<App ctx={ctx} session={session} />)
    await ready()
    await session.run('Upload', async () => ['https://example.com/image.png'])
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('https://example.com/image.png'))
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Set up a destination'))
    ui.stdin.write('r')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('https://example.com/image.png'))
    await session.dispose()
  })

  it('keeps upload results available after a settings change', async () => {
    const { ctx, session } = setup()
    const ui = render(<App ctx={ctx} session={session} />)
    await ready()
    await session.run('Upload', async () => ['https://example.com/image.png'])
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Selected result'))
    ui.stdin.write('\r')
    await ready()
    await session.run('Settings', async () => {})
    await ready()
    expect(ui.lastFrame()).not.toContain('Selected result')
    ui.stdin.write('r')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('https://example.com/image.png'))
    expect(session.getSnapshot().resultTitle).toBe('Upload')
    await session.dispose()
  })

  it('shows a readable error and returns to the workspace', async () => {
    const { ctx, session } = setup()
    const ui = render(<App ctx={ctx} session={session} />)
    await ready()
    await session.run('Upload', async () => {
      throw new TuiError('Choose a saved destination before uploading your images.')
    })
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Choose a saved destination'))
    ui.stdin.write('\r')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Files & URLs'))
    await session.dispose()
  })

  it.each([
    [100, 30],
    [80, 24],
    [52, 22],
  ])('keeps long results usable at %s × %s', async (columns, rows) => {
    const { ctx, session } = setup()
    const ui = render(<App ctx={ctx} session={session} />)
    await ready()
    Object.defineProperty(ui.stdout, 'columns', { value: columns, configurable: true })
    Object.defineProperty(ui.stdout, 'rows', { value: rows, configurable: true })
    ui.stdout.emit('resize')
    await session.run('Upload files or URLs', async () => [
      `https://example.com/${'very-long-image-path/'.repeat(35)}photo.png`,
      'https://example.com/second.png',
      'https://example.com/third.png',
    ])
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('PgUp/PgDn'))
    expect(ui.lastFrame()!.split('\n').length).toBeLessThanOrEqual(rows)
    ui.stdin.write('\u001B[6~')
    await ready()
    expect(ui.lastFrame()).toContain('Selected result · 1 of 3')
    ui.stdin.write('\u001B[B')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('https://example.com/second.png'))
    expect(ui.lastFrame()!.split('\n').length).toBeLessThanOrEqual(rows)
    await session.dispose()
  })
})
