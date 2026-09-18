import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../../src/core/PicGo'
import { EN } from '../../../src/i18n/en'
import { IBusEvent } from '../../../src/utils/enum'
import { eventBus } from '../../../src/utils/eventBus'

describe('init command', () => {
  let directory: string
  let ctx: PicGo
  let listeners: Set<(...args: any[]) => void>
  const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
  const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  const exitCode = process.exitCode
  const run = () => ctx.cmd.program.parseAsync(['init'], { from: 'user' })
  const answers = (...values: any[]) => {
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt')
    values.forEach(value => prompt.mockResolvedValueOnce(value))
    return prompt
  }

  beforeEach(async () => {
    listeners = new Set(eventBus.listeners(IBusEvent.CONFIG_CHANGE))
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true })
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })
    vi.stubEnv('PICGO_VERSION', '0.0.0-test')
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-init-'))
    ctx = await PicGo.create(path.join(directory, 'custom', 'config.json'))
    ctx.saveConfig({ silent: true, 'picBed.transformer': 'custom-transformer', 'settings.keep': true })
    ctx.i18n.setLanguage('en')
    ctx.helper.uploader.register('test-uploader', {
      handle: async () => {},
      config: () => [
        { name: 'destination', type: 'input', required: true },
        { name: 'token', type: 'input', required: true, default: 'fixture-secret' },
      ],
    })
    ctx.registerCommands()
    vi.spyOn(ctx.log, 'success').mockImplementation(() => {})
    vi.spyOn(ctx.log, 'info').mockImplementation(() => {})
    vi.spyOn(ctx.log, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    if (stdinTTY) Object.defineProperty(process.stdin, 'isTTY', stdinTTY)
    else Reflect.deleteProperty(process.stdin, 'isTTY')
    if (stdoutTTY) Object.defineProperty(process.stdout, 'isTTY', stdoutTTY)
    else Reflect.deleteProperty(process.stdout, 'isTTY')
    process.exitCode = exitCode
    for (const listener of eventBus.listeners(IBusEvent.CONFIG_CHANGE)) {
      if (!listeners.has(listener)) eventBus.removeListener(IBusEvent.CONFIG_CHANGE, listener)
    }
    await fs.remove(directory)
  })

  it('creates and activates a named configuration in the selected file', async () => {
    const prompt = answers(
      { uploader: 'test-uploader' },
      { configName: 'My destination' },
      { destination: 'target', token: 'fixture-token' },
    )

    await run()

    const saved = await fs.readJson(ctx.configPath)
    const selected = saved.picBed['test-uploader']
    expect(selected).toMatchObject({ _configName: 'My destination', destination: 'target', token: 'fixture-token' })
    expect(saved.uploader['test-uploader']).toEqual({ defaultId: selected._id, configList: [selected] })
    expect(saved.picBed).toMatchObject({
      current: 'test-uploader',
      uploader: 'test-uploader',
      transformer: 'custom-transformer',
    })
    expect(saved.settings.keep).toBe(true)
    expect(prompt.mock.calls[0][0][0].choices).toContainEqual({
      name: 'test-uploader (test-uploader)',
      value: 'test-uploader',
    })
    expect(prompt.mock.calls[2][0][1]).toMatchObject({ type: 'password', default: undefined })
    expect(ctx.log.success).toHaveBeenCalledWith(EN.CLI_INIT_SUCCESS)
  })

  it('fills the fresh default uploader without asking to overwrite its empty placeholder', async () => {
    const prompt = answers({ uploader: 'smms' }, { configName: 'Default' }, { token: 'fixture-token' })

    await run()

    expect(prompt).toHaveBeenCalledTimes(3)
    expect(prompt.mock.calls[2][0][0].type).toBe('password')
    expect(ctx.configManager.getAllUploaderConfigs('smms')).toHaveLength(1)
    expect(ctx.configManager.getCurrentUploaderConfig('smms')).toMatchObject({ token: 'fixture-token' })
  })

  it('updates and activates a non-default named configuration after confirmation', async () => {
    const first = ctx.configManager.addUploaderConfig('test-uploader', 'Default', { destination: 'first' })
    const other = ctx.configManager.addUploaderConfig('test-uploader', 'Other', { destination: 'second', extra: true })
    const prompt = answers(
      { uploader: 'test-uploader' },
      { configName: 'Other' },
      { overwrite: true },
      { destination: 'updated', token: 'fixture-token' },
    )

    await run()

    expect(prompt.mock.calls[3][0][0].default).toBe('second')
    expect(ctx.configManager.getCurrentUploaderConfig('test-uploader')).toMatchObject({
      _id: other._id,
      _configName: 'Other',
      destination: 'updated',
      extra: true,
    })
    expect(ctx.configManager.getConfigByName('test-uploader', 'Default')).toEqual(first)
    expect(ctx.configManager.getAllUploaderConfigs('test-uploader')).toHaveLength(2)
  })

  it('does not migrate or overwrite a legacy configuration when confirmation is declined', async () => {
    ctx.saveConfig({ 'picBed.test-uploader': { destination: 'existing', token: 'fixture-token' } })
    const before = await fs.readFile(ctx.configPath, 'utf8')
    const prompt = answers({ uploader: 'test-uploader' }, { configName: 'Default' }, { overwrite: false })

    await run()

    expect(prompt).toHaveBeenCalledTimes(3)
    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(before)
    expect(ctx.log.success).not.toHaveBeenCalled()
  })

  it('migrates and updates a legacy configuration after confirmation', async () => {
    ctx.saveConfig({ 'picBed.test-uploader': { destination: 'legacy', token: 'fixture-token' } })
    answers(
      { uploader: 'test-uploader' },
      { configName: 'Default' },
      { overwrite: true },
      { destination: 'updated', token: 'new-fixture-token' },
    )

    await run()

    expect(ctx.configManager.getAllUploaderConfigs('test-uploader')).toHaveLength(1)
    expect(ctx.configManager.getCurrentUploaderConfig('test-uploader')).toMatchObject({ destination: 'updated' })
  })

  it('leaves configuration unchanged when a prompt is cancelled', async () => {
    const before = await fs.readFile(ctx.configPath, 'utf8')
    const prompt = answers({ uploader: 'test-uploader' }, { configName: 'Default' })
    prompt.mockRejectedValueOnce(Object.assign(new Error('Cancelled'), { name: 'ExitPromptError' }))

    await run()

    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(before)
    expect(process.exitCode).toBe(130)
    expect(ctx.log.info).toHaveBeenCalledWith(EN.CLI_INIT_CANCELLED)
    expect(ctx.log.success).not.toHaveBeenCalled()
  })

  it('rejects missing required values without saving any form values', async () => {
    const before = await fs.readFile(ctx.configPath, 'utf8')
    const prompt = answers(
      { uploader: 'test-uploader' },
      { configName: 'Default' },
      { destination: 'target', token: ' ' },
    )

    await expect(run()).rejects.toThrow(EN.CLI_INIT_FAILED)

    expect(await prompt.mock.calls[2][0][1].validate?.('')).toBe(EN.CLI_INIT_REQUIRED)
    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(before)
    expect(ctx.log.success).not.toHaveBeenCalled()
  })

  it('does not expose credential values from validators or plugin errors', async () => {
    const validate = vi.fn(() => {
      throw new Error('fixture-secret')
    })
    ctx.helper.uploader.register('invalid', {
      handle: async () => {},
      config: () => [{ name: 'apiKey', type: 'input', required: true, validate }],
    })
    const before = await fs.readFile(ctx.configPath, 'utf8')
    const prompt = answers({ uploader: 'invalid' }, { configName: 'Default' }, { apiKey: 'fixture-secret' })

    await expect(run()).rejects.toThrow(EN.CLI_INIT_FAILED)

    expect(await prompt.mock.calls[2][0][0].validate?.('fixture-secret')).toBe(EN.CLI_INIT_INVALID)
    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(before)
    expect(ctx.log.error).not.toHaveBeenCalled()
    expect(ctx.log.success).not.toHaveBeenCalled()
  })

  it('supports uploaders without configuration fields', async () => {
    ctx.helper.uploader.register('no-config', { handle: async () => {} })
    answers({ uploader: 'no-config' }, { configName: 'Default' }, {})

    await run()

    expect(ctx.getConfig('picBed.uploader')).toBe('no-config')
    expect(ctx.configManager.getCurrentUploaderConfig('no-config')).toMatchObject({ _configName: 'Default' })
  })

  it.each(['stdin', 'stdout'] as const)('requires an interactive %s before prompting', async stream => {
    Object.defineProperty(process[stream], 'isTTY', { configurable: true, value: false })
    const before = await fs.readFile(ctx.configPath, 'utf8')
    const prompt = answers()

    await expect(run()).rejects.toThrow(EN.CLI_INIT_TERMINAL)

    expect(prompt).not.toHaveBeenCalled()
    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(before)
  })
})
