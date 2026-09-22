import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { createPromptAdapter, isSecretQuestion, PromptCancelledError, TuiSession } from '../../src/tui/session'
import type { IPicGo } from '../../src/types'
import { IBuildInEvent } from '../../src/utils/enum'

describe('Ink prompt adapter', () => {
  it('resolves defaults, conditions and asynchronous filters using preceding answers', async () => {
    const ask = vi.fn().mockResolvedValueOnce(' first ').mockResolvedValueOnce('second')
    const adapter = createPromptAdapter(ask)
    const answers = await adapter.prompt([
      { name: 'one', type: 'input', filter: async value => value.trim() },
      { name: 'skip', type: 'input', when: async answers => answers.one !== 'first' },
      { name: 'two', type: 'input', default: (answers: any) => answers.one, when: answers => answers.one === 'first' },
    ])
    expect(answers).toEqual({ one: 'first', two: 'second' })
    expect(ask).toHaveBeenCalledTimes(2)
    expect(ask.mock.calls[1][0].default).toBe('first')
  })

  it.each(['password', 'secretAccessKey', 'token', 'apiKey', 'privateKey', 'access_key'])(
    'identifies %s for validation-message redaction even for legacy input questions',
    name => {
      expect(isSecretQuestion({ name, type: 'input' })).toBe(true)
    },
  )

  it('stops a question sequence on cancellation', async () => {
    const ask = vi.fn().mockRejectedValue(new PromptCancelledError())
    await expect(
      createPromptAdapter(ask).prompt([
        { name: 'one', type: 'input' },
        { name: 'two', type: 'input' },
      ]),
    ).rejects.toBeInstanceOf(PromptCancelledError)
    expect(ask).toHaveBeenCalledTimes(1)
  })
})

describe('TUI session lifecycle', () => {
  it('serializes operations, cancels a pending form, and restores host adapters and listeners', async () => {
    const originalPrompt = { prompt: vi.fn() }
    const originalLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() }
    const ctx = Object.assign(new EventEmitter(), {
      cmd: { inquirer: originalPrompt },
      log: originalLogger,
    }) as unknown as IPicGo
    const session = new TuiSession()
    session.attach(ctx)
    const save = vi.fn()
    const task = session.run('Form', async () => {
      await ctx.cmd.inquirer.prompt([{ name: 'test', type: 'input' }])
      save()
    })
    const concurrent = vi.fn()
    await session.run('Other', concurrent)
    expect(concurrent).not.toHaveBeenCalled()
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 42)
    expect(session.getSnapshot().progress).toBe(42)
    session.cancel()
    await task
    expect(save).not.toHaveBeenCalled()
    expect(session.getSnapshot()).toMatchObject({
      busy: false,
      error: false,
      status: expect.stringContaining('Cancelled'),
    })
    await session.dispose()
    expect(ctx.cmd.inquirer).toBe(originalPrompt)
    expect(ctx.log).toBe(originalLogger)
    expect(ctx.listenerCount(IBuildInEvent.UPLOAD_PROGRESS)).toBe(0)
  })

  it('reports swallowed provider failures without persisting or displaying provider payloads', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() }
    const ctx = Object.assign(new EventEmitter(), {
      cmd: { inquirer: { prompt: vi.fn() } },
      log: logger,
    }) as unknown as IPicGo
    const session = new TuiSession()
    session.attach(ctx)
    await session.run('Upload', async () => {
      ctx.log.error(Object.assign(new Error('Provider failed'), { token: 'test-sensitive-value' }))
    })
    expect(session.getSnapshot().error).toBe(true)
    expect(JSON.stringify(session.getSnapshot())).not.toContain('test-sensitive-value')
    expect(logger.error).not.toHaveBeenCalled()
    await session.dispose()
  })
})
