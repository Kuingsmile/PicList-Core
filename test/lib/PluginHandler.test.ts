import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'

import { spawn } from 'cross-spawn'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setCurrentPluginName } from '../../src/lib/LifecyclePlugins'
import { PluginHandler } from '../../src/lib/PluginHandler'
import { PluginLoader } from '../../src/lib/PluginLoader'
import type { IPicGo } from '../../src/types'

vi.mock('cross-spawn', () => ({ spawn: vi.fn() }))

describe('plugin installation', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-plugin-install-'))
  })

  afterEach(async () => {
    setCurrentPluginName()
    vi.clearAllMocks()
    await fs.remove(baseDir)
  })

  it.each([
    ['picgo-plugin-example@1.0.0', 'picgo-plugin-example'],
    ['example@1.0.0', 'picgo-plugin-example'],
    ['@example/picgo-plugin-example@1.0.0', '@example/picgo-plugin-example'],
    ['picgo-plugin-example@latest', 'picgo-plugin-example'],
    ['picgo-plugin-example', 'picgo-plugin-example'],
    ['local', 'picgo-plugin-example'],
  ])('loads the installed package for %s before reporting success', async (input, pkgName) => {
    const pluginDir = path.join(baseDir, 'node_modules', pkgName)
    const manifest = { name: pkgName, version: '1.0.0', main: 'index.cjs' }
    await fs.outputJson(path.join(pluginDir, 'package.json'), manifest)
    await fs.outputFile(
      path.join(pluginDir, 'index.cjs'),
      'module.exports = () => ({ register(ctx) { ctx.emit("testPluginRegistered") } })',
    )
    if (input === 'local') {
      input = path.join(baseDir, 'local-plugin-source')
      await fs.outputJson(path.join(input, 'package.json'), manifest)
    }
    const fullName = input.startsWith('example@') ? `picgo-plugin-${input}` : input.split(path.sep).join('/')
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
    vi.mocked(spawn).mockReturnValue(child as any)
    const ctx = Object.assign(new EventEmitter(), {
      baseDir,
      getConfig: vi.fn(),
      saveConfig: vi.fn(),
      log: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
      i18n: { t: (key: string) => key, translate: (key: string) => key },
    }) as unknown as IPicGo
    ctx.pluginLoader = new PluginLoader(ctx)
    const events: string[] = []
    ctx.on('testPluginRegistered', () => events.push('registered'))
    ctx.on('installSuccess', () => events.push('success'))

    const result = new PluginHandler(ctx).install([input], { silent: true })
    expect(spawn).toHaveBeenCalledWith('npm', ['install', fullName, '--color=always', '--save'], expect.any(Object))
    child.emit('close', 0)

    await expect(result).resolves.toEqual({ success: true, body: [pkgName] })
    expect(events).toEqual(['registered', 'success'])
    expect(ctx.pluginLoader.hasPlugin(pkgName)).toBe(true)
    expect(ctx.pluginLoader.getList()).toEqual([pkgName])
    expect(ctx.saveConfig).toHaveBeenCalledWith({ [`picgoPlugins[${pkgName}]`]: true })
    expect(ctx.log.error).not.toHaveBeenCalled()
  })
})

describe('plugin operations embedded in the TUI', () => {
  const setup = () => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
    vi.mocked(spawn).mockReturnValue(child as any)
    const ctx = Object.assign(new EventEmitter(), {
      baseDir: '/tmp/piclist-plugins-test',
      getConfig: vi.fn(),
      log: { success: vi.fn(), error: vi.fn() },
      pluginLoader: { unregisterPlugin: vi.fn() },
      i18n: { t: (key: string) => key, translate: (key: string) => key },
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
