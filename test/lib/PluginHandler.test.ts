import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { spawn } from 'cross-spawn'
import { describe, expect, it, vi } from 'vitest'

import { PluginHandler } from '../../src/lib/PluginHandler'
import type { IPicGo } from '../../src/types'

vi.mock('cross-spawn', () => ({ spawn: vi.fn() }))

describe('plugin operations embedded in the TUI', () => {
  const setup = () => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
    vi.mocked(spawn).mockReturnValue(child as any)
    const ctx = Object.assign(new EventEmitter(), {
      baseDir: '/tmp/piclist-plugins-test',
      getConfig: vi.fn(),
      log: { success: vi.fn(), error: vi.fn() },
      pluginLoader: { unregisterPlugin: vi.fn() },
      i18n: { translate: (key: string) => key },
    }) as unknown as IPicGo
    return { ctx, child, handler: new PluginHandler(ctx) }
  }

  it('suppresses npm stream forwarding in silent mode', async () => {
    const { handler, child, ctx } = setup()
    const stdoutPipe = vi.spyOn(child.stdout, 'pipe')
    const stderrPipe = vi.spyOn(child.stderr, 'pipe')
    const result = handler.uninstall(['picgo-plugin-example'], { silent: true })
    child.stdout.write('npm output')
    child.emit('close', 0)
    await expect(result).resolves.toMatchObject({ success: true })
    expect(stdoutPipe).not.toHaveBeenCalled()
    expect(stderrPipe).not.toHaveBeenCalled()
    expect(ctx.pluginLoader.unregisterPlugin).toHaveBeenCalledWith('picgo-plugin-example')
  })

  it('settles the operation when npm fails to spawn', async () => {
    const { handler, child } = setup()
    const result = handler.uninstall(['picgo-plugin-example'], { silent: true })
    child.emit('error', new Error('npm unavailable'))
    await expect(result).resolves.toMatchObject({ success: false })
  })
})
