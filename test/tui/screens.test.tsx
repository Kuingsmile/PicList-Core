import { cleanup, render } from 'ink-testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyText, resultLink } from '../../src/tui/clipboard'
import { ResultPanel } from '../../src/tui/screens'

vi.mock('../../src/tui/clipboard', async importOriginal => ({
  ...(await importOriginal<typeof import('../../src/tui/clipboard')>()),
  copyText: vi.fn().mockResolvedValue(undefined),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const ready = () => new Promise(resolve => setTimeout(resolve, 40))

describe('result copy actions', () => {
  it('copies the selected URL and Markdown without the backup label', async () => {
    const results = ['https://example.com/one.png', 'Backup: https://backup.example/two (2).png?x=1&y=2']
    const ui = render(<ResultPanel results={results} title='Upload' wide width={94} height={20} onBack={vi.fn()} />)
    await ready()
    ui.stdin.write('c')
    await vi.waitFor(() => expect(copyText).toHaveBeenLastCalledWith(results[0]))
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Copied URL.'))
    ui.stdin.write('\u001B[B')
    await ready()
    ui.stdin.write('m')
    await vi.waitFor(() =>
      expect(copyText).toHaveBeenLastCalledWith('![](<https://backup.example/two%20(2).png?x=1&y=2>)'),
    )
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Copied Markdown.'))
    expect(ui.lastFrame()).toContain('Selected result · 2 of 2')
  })

  it('reports clipboard failure without losing the result or exposing errors', async () => {
    vi.mocked(copyText).mockRejectedValueOnce(new Error('private clipboard payload'))
    const result = 'https://example.com/image.png'
    const ui = render(
      <ResultPanel results={[result]} title='Upload' wide={false} width={46} height={14} onBack={vi.fn()} />,
    )
    await ready()
    ui.stdin.write('c')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Clipboard unavailable.'))
    expect(ui.frames.join('')).not.toContain('private clipboard payload')
    expect(ui.lastFrame()).toContain(result)
    ui.stdin.write('c')
    await vi.waitFor(() => expect(ui.lastFrame()).toContain('Copied URL.'))
  })

  it('copies informational results as text without offering Markdown', async () => {
    const result = 'Restart PicList to reload plugin code.'
    const ui = render(<ResultPanel results={[result]} title='Plugins' wide width={94} height={20} onBack={vi.fn()} />)
    await ready()
    expect(ui.lastFrame()).toContain('copy text')
    expect(ui.lastFrame()).not.toContain('copy Markdown')
    ui.stdin.write('m')
    await ready()
    expect(copyText).not.toHaveBeenCalled()
    ui.stdin.write('c')
    await vi.waitFor(() => expect(copyText).toHaveBeenCalledWith(result))
  })

  it('preserves raw paths and safely formats Markdown destinations', () => {
    expect(resultLink('Backup: C:\\Pictures\\a b.png')).toBe('C:\\Pictures\\a b.png')
    expect(resultLink('C:\\Pictures\\a b.png', true)).toBe('![](<C:/Pictures/a%20b.png>)')
    expect(resultLink('https://example.com/a<>.png', true)).toBe('![](<https://example.com/a%3C%3E.png>)')
  })
})
