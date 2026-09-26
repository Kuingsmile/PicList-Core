import os from 'node:os'
import path from 'node:path'

import { checkbox, select } from '@inquirer/prompts'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../../src/core/PicGo'
import use from '../../../src/plugins/commander/use'
import { IBusEvent } from '../../../src/utils/enum'
import { eventBus } from '../../../src/utils/eventBus'

vi.mock('@inquirer/prompts', async importOriginal => {
  const prompts = await importOriginal<typeof import('@inquirer/prompts')>()
  return { ...prompts, select: vi.fn(), checkbox: vi.fn(prompts.checkbox) }
})

describe('use command', () => {
  let baseDir: string
  let ctx: PicGo
  let listeners: Set<(...args: any[]) => void>
  const tempPrefix = path.join(os.tmpdir(), 'piclist-use-cli-')
  const primary = { _id: 'a', _configName: 'Default', _createdAt: 1, _updatedAt: 1, destination: 'primary' }
  const defaultConfig = { ...primary, _id: 'b', destination: 'default-b' }
  const workConfig = { ...primary, _id: 'b-work', _configName: 'Work account', destination: 'work-b' }
  const run = (...args: string[]) => ctx.cmd.program.parseAsync(['use', ...args], { from: 'user' })

  beforeEach(async () => {
    vi.mocked(select).mockReset()
    vi.mocked(checkbox).mockClear()
    listeners = new Set(eventBus.listeners(IBusEvent.CONFIG_CHANGE))
    baseDir = await fs.mkdtemp(tempPrefix)
    await fs.writeJson(path.join(baseDir, 'config.json'), {
      silent: true,
      settings: { language: 'en', keep: true },
      picBed: {
        current: 'test-a',
        uploader: 'test-a',
        transformer: 'custom-transformer',
        'test-a': primary,
        'test-b': defaultConfig,
      },
      uploader: {
        'test-a': {
          defaultId: primary._id,
          configList: [primary, { ...workConfig, _id: 'a-work', destination: 'work-a' }],
        },
        'test-b': { defaultId: defaultConfig._id, configList: [defaultConfig, workConfig] },
        'test-empty': { defaultId: '', configList: [] },
      },
      picgoPlugins: {},
    })
    ctx = await PicGo.create(path.join(baseDir, 'config.json'))
    for (const uploader of ['test-a', 'test-b', 'test-empty', 'test-legacy']) {
      ctx.helper.uploader.register(uploader, { handle: async () => {} })
    }
    ctx.saveConfig({ picgoPlugins: { 'picgo-plugin-one': true, 'picgo-plugin-two': false } })
    vi.spyOn(ctx.pluginLoader, 'getFullList').mockReturnValue(['picgo-plugin-one', 'picgo-plugin-two'])
    vi.spyOn(ctx.log, 'success').mockImplementation(() => {})
    vi.spyOn(ctx.log, 'error').mockImplementation(() => {})
    vi.spyOn(ctx.log, 'warn').mockImplementation(() => {})
    use.handle(ctx)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const listener of eventBus.listeners(IBusEvent.CONFIG_CHANGE)) {
      if (!listeners.has(listener)) eventBus.removeListener(IBusEvent.CONFIG_CHANGE, listener)
    }
    if (!path.resolve(baseDir).startsWith(path.resolve(tempPrefix))) throw new Error('Unexpected test directory')
    await fs.remove(baseDir)
  })

  it('activates a named profile without prompts and preserves other settings', async () => {
    const before = await fs.readJson(ctx.configPath)
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt')

    await run('uploader', 'test-b', 'Work account')

    expect(prompt).not.toHaveBeenCalled()
    const saved = await fs.readJson(ctx.configPath)
    expect(saved.picBed).toEqual({ ...before.picBed, current: 'test-b', uploader: 'test-b', 'test-b': workConfig })
    expect(saved.uploader).toEqual({
      ...before.uploader,
      'test-b': { defaultId: workConfig._id, configList: [defaultConfig, workConfig] },
    })
    expect(saved.picgoPlugins).toEqual(before.picgoPlugins)
    expect(saved.settings).toEqual(before.settings)
    expect(ctx.configManager.getCurrentUploaderConfig('test-b')).toEqual(workConfig)
    expect(ctx.getConfig('picBed.test-b')).toEqual(workConfig)
    expect(ctx.log.success).toHaveBeenCalledOnce()
  })

  it('prompts for both the uploader and its default profile', async () => {
    const prompt = vi
      .spyOn(ctx.cmd.inquirer, 'prompt')
      .mockResolvedValueOnce({ uploader: 'test-b' })
      .mockResolvedValueOnce({ configId: workConfig._id })

    await run('uploader')

    expect(prompt).toHaveBeenCalledTimes(2)
    expect(prompt.mock.calls[0][0][0]).toMatchObject({ name: 'uploader', default: 'test-a' })
    expect(prompt.mock.calls[1][0][0]).toMatchObject({
      name: 'configId',
      choices: [
        { name: 'Default (default)', value: defaultConfig._id },
        { name: 'Work account', value: workConfig._id },
      ],
      default: defaultConfig._id,
    })
    const saved = await fs.readJson(ctx.configPath)
    expect(saved.picBed).toMatchObject({ current: 'test-b', uploader: 'test-b', 'test-b': workConfig })
    expect(saved.uploader['test-b'].defaultId).toBe(workConfig._id)
    expect(saved.picBed.transformer).toBe('custom-transformer')
  })

  it('prompts only for the profile when an uploader is supplied and preselects its current default', async () => {
    ctx.configManager.setDefaultConfig('test-b', workConfig._id)
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt').mockImplementation(async questions => ({
      configId: questions[0].default,
    }))

    await run('uploader', 'test-b')

    expect(prompt).toHaveBeenCalledTimes(1)
    expect(prompt.mock.calls[0][0][0]).toMatchObject({ name: 'configId', default: workConfig._id })
    const saved = await fs.readJson(ctx.configPath)
    expect(saved.picBed).toMatchObject({ current: 'test-b', uploader: 'test-b', 'test-b': workConfig })
    expect(saved.uploader['test-b'].defaultId).toBe(workConfig._id)
  })

  it('includes profile selection when configuring all modules', async () => {
    const prompt = vi
      .spyOn(ctx.cmd.inquirer, 'prompt')
      .mockResolvedValueOnce({ uploader: 'test-b' })
      .mockResolvedValueOnce({ configId: workConfig._id })
      .mockResolvedValueOnce({ transformer: 'path', plugins: ['picgo-plugin-two'] })

    await run()

    expect(prompt.mock.calls.map(([questions]) => questions.map(question => question.name))).toEqual([
      ['uploader'],
      ['configId'],
      ['transformer', 'plugins'],
    ])
    const saved = await fs.readJson(ctx.configPath)
    expect(saved.picBed).toMatchObject({
      current: 'test-b',
      uploader: 'test-b',
      transformer: 'path',
      'test-b': workConfig,
    })
    expect(saved.uploader['test-b'].defaultId).toBe(workConfig._id)
    expect(saved.picgoPlugins).toEqual({ 'picgo-plugin-one': false, 'picgo-plugin-two': true })
  })

  it.each([
    { description: 'all modules', args: [] },
    { description: 'plugins only', args: ['plugins'] },
  ])('handles $description without installed plugins through the real prompt adapter', async ({ args }) => {
    vi.mocked(ctx.pluginLoader.getFullList).mockReturnValue([])
    ctx.saveConfig({ picgoPlugins: {} })
    const before = await fs.readJson(ctx.configPath)
    vi.mocked(select)
      .mockResolvedValueOnce('test-b')
      .mockResolvedValueOnce(workConfig._id)
      .mockResolvedValueOnce('path')

    await run(...args)

    expect(ctx.log.error).not.toHaveBeenCalled()
    expect(ctx.log.success).toHaveBeenCalledOnce()
    expect(checkbox).not.toHaveBeenCalled()
    const saved = await fs.readJson(ctx.configPath)
    expect(saved.picgoPlugins).toEqual({})
    if (args.length === 0) {
      expect(select).toHaveBeenCalledTimes(3)
      expect(vi.mocked(select).mock.calls.map(([question]) => question.message)).toEqual([
        'Use an uploader',
        'Choose a default config for test-b',
        'Use a transformer',
      ])
      expect(saved.picBed).toMatchObject({
        current: 'test-b',
        uploader: 'test-b',
        transformer: 'path',
        'test-b': workConfig,
      })
      expect(saved.uploader['test-b'].defaultId).toBe(workConfig._id)
    } else {
      expect(select).not.toHaveBeenCalled()
      expect(saved).toEqual(before)
    }
  })

  it('keeps installed plugin selection available through the real prompt adapter', async () => {
    vi.mocked(select)
      .mockResolvedValueOnce('test-b')
      .mockResolvedValueOnce(workConfig._id)
      .mockResolvedValueOnce('path')
    vi.mocked(checkbox).mockResolvedValueOnce(['picgo-plugin-two'])

    await run()

    expect(ctx.log.error).not.toHaveBeenCalled()
    expect(checkbox).toHaveBeenCalledOnce()
    const saved = await fs.readJson(ctx.configPath)
    expect(saved.picgoPlugins).toEqual({ 'picgo-plugin-one': false, 'picgo-plugin-two': true })
    expect(saved.picBed['test-b']).toEqual(workConfig)
    expect(saved.uploader['test-b'].defaultId).toBe(workConfig._id)
  })

  it.each([true, false])('still selects an uploader with no saved profiles (interactive: %s)', async interactive => {
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt').mockResolvedValueOnce({ uploader: 'test-empty' })

    await run(...(interactive ? ['uploader'] : ['uploader', 'test-empty']))

    expect(prompt).toHaveBeenCalledTimes(interactive ? 1 : 0)
    const saved = await fs.readJson(ctx.configPath)
    expect(saved.picBed).toMatchObject({
      current: 'test-empty',
      uploader: 'test-empty',
      transformer: 'custom-transformer',
    })
    expect(saved.uploader['test-empty']).toEqual({ defaultId: '', configList: [] })
    expect(ctx.log.success).toHaveBeenCalledOnce()
  })

  it.each([true, false])('supports legacy uploader configurations (interactive: %s)', async interactive => {
    ctx.saveConfig({ 'picBed.test-legacy': { destination: 'legacy' } })
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt').mockImplementation(async questions => ({
      configId: questions[0].default,
    }))

    await run('uploader', 'test-legacy', ...(interactive ? [] : ['Default']))

    expect(prompt).toHaveBeenCalledTimes(interactive ? 1 : 0)
    const saved = await fs.readJson(ctx.configPath)
    const profile = saved.picBed['test-legacy']
    expect(profile).toMatchObject({ _id: expect.any(String), _configName: 'Default', destination: 'legacy' })
    expect(saved.uploader['test-legacy']).toEqual({ defaultId: profile._id, configList: [profile] })
    expect(saved.picBed).toMatchObject({ current: 'test-legacy', uploader: 'test-legacy' })
  })

  it.each([
    ['missing-uploader', 'Work account', 'No uploader named missing-uploader'],
    ['test-b', 'Missing', 'Config "Missing" not found for test-b'],
    ['test-empty', 'Default', 'Config "Default" not found for test-empty'],
  ])('leaves defaults unchanged for an invalid selection: %s / %s', async (uploader, configName, error) => {
    const before = await fs.readFile(ctx.configPath, 'utf8')
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt')

    await run('uploader', uploader, configName)

    expect(prompt).not.toHaveBeenCalled()
    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(before)
    expect(ctx.log.error).toHaveBeenCalledWith(error)
    expect(ctx.log.success).not.toHaveBeenCalled()
  })

  it('leaves all module settings unchanged if profile selection is cancelled', async () => {
    const before = await fs.readFile(ctx.configPath, 'utf8')
    vi.spyOn(ctx.cmd.inquirer, 'prompt')
      .mockResolvedValueOnce({ uploader: 'test-b' })
      .mockRejectedValueOnce(new Error('Prompt cancelled'))

    await run()

    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(before)
    expect(ctx.log.success).not.toHaveBeenCalled()
    expect(ctx.log.error).toHaveBeenCalledWith('Failed to save configuration.')
  })

  it('leaves all module settings unchanged if later selection is cancelled', async () => {
    const before = await fs.readFile(ctx.configPath, 'utf8')
    vi.spyOn(ctx.cmd.inquirer, 'prompt')
      .mockResolvedValueOnce({ uploader: 'test-b' })
      .mockResolvedValueOnce({ configId: workConfig._id })
      .mockRejectedValueOnce(new Error('Prompt cancelled'))

    await run()

    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(before)
    expect(ctx.log.success).not.toHaveBeenCalled()
    expect(ctx.log.error).toHaveBeenCalledWith('Failed to save configuration.')
  })

  it('does not switch uploaders when the selected profile cannot be made the default', async () => {
    const before = await fs.readFile(ctx.configPath, 'utf8')
    vi.spyOn(ctx.configManager, 'setDefaultConfig').mockReturnValue(false)

    await run('uploader', 'test-b', 'Work account')

    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(before)
    expect(ctx.log.error).toHaveBeenCalledWith('Failed to set "Work account" as default for test-b')
    expect(ctx.log.success).not.toHaveBeenCalled()
  })

  it.each([
    { module: 'transformer', answer: { transformer: 'path' } },
    { module: 'plugins', answer: { plugins: [] } },
  ])('preserves uploader settings when selecting $module', async ({ module, answer }) => {
    const before = await fs.readJson(ctx.configPath)
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt').mockResolvedValueOnce(answer)

    await run(module)

    expect(prompt).toHaveBeenCalledTimes(1)
    const saved = await fs.readJson(ctx.configPath)
    expect(saved.uploader).toEqual(before.uploader)
    expect(saved.picBed).toEqual({ ...before.picBed, ...(module === 'transformer' ? { transformer: 'path' } : {}) })
    expect(saved.picgoPlugins).toEqual(
      module === 'plugins' ? { 'picgo-plugin-one': false, 'picgo-plugin-two': false } : before.picgoPlugins,
    )
  })

  it.each(['missing-module', 'toString'])('rejects unknown modules: %s', async module => {
    const before = await fs.readFile(ctx.configPath, 'utf8')
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt')

    await run(module)

    expect(prompt).not.toHaveBeenCalled()
    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(before)
    expect(ctx.log.warn).toHaveBeenCalledWith(`No module named ${module}`)
    expect(ctx.log.success).not.toHaveBeenCalled()
  })

  it('rejects uploader arguments for other modules', async () => {
    const before = await fs.readFile(ctx.configPath, 'utf8')
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt')

    await run('plugins', 'test-b', 'Work account')

    expect(prompt).not.toHaveBeenCalled()
    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(before)
    expect(ctx.log.error).toHaveBeenCalledWith('Uploader and config names are only supported by "use uploader"')
    expect(ctx.log.success).not.toHaveBeenCalled()
  })
})
