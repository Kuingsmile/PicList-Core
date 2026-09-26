import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../../src/core/PicGo'
import configManager from '../../../src/plugins/commander/configManager'
import setting from '../../../src/plugins/commander/setting'
import { IBusEvent } from '../../../src/utils/enum'
import { eventBus } from '../../../src/utils/eventBus'

describe('uploader CLI settings', () => {
  let baseDir: string
  let ctx: PicGo
  let listeners: Set<(...args: any[]) => void>
  const tempPrefix = path.join(os.tmpdir(), 'piclist-setting-cli-')
  const run = (...args: string[]) => ctx.cmd.program.parseAsync(args, { from: 'user' })
  const acceptDefaults = () =>
    vi
      .spyOn(ctx.cmd.inquirer, 'prompt')
      .mockImplementation(async questions =>
        Object.fromEntries(questions.map(question => [question.name, question.default])),
      )

  beforeEach(async () => {
    listeners = new Set(eventBus.listeners(IBusEvent.CONFIG_CHANGE))
    baseDir = await fs.mkdtemp(tempPrefix)
    await fs.writeJson(path.join(baseDir, 'config.json'), {
      silent: true,
      settings: { language: 'en' },
      picBed: { current: 'local', uploader: 'local' },
      picgoPlugins: {},
    })
    ctx = await PicGo.create(path.join(baseDir, 'config.json'))
    vi.spyOn(ctx.log, 'success').mockImplementation(() => {})
    vi.spyOn(ctx.log, 'error').mockImplementation(() => {})
    setting.handle(ctx)
    configManager.handle(ctx)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const listener of eventBus.listeners(IBusEvent.CONFIG_CHANGE)) {
      if (!listeners.has(listener)) eventBus.removeListener(IBusEvent.CONFIG_CHANGE, listener)
    }
    if (!path.resolve(baseDir).startsWith(path.resolve(tempPrefix))) throw new Error('Unexpected test directory')
    await fs.remove(baseDir)
  })

  it.each([
    {
      command: 'set',
      uploader: 'local',
      active: { path: 'destination-A', customUrl: 'https://a.example.invalid', webPath: 'images-a' },
      selected: { path: 'destination-B', customUrl: '', webPath: '' },
    },
    {
      command: 'config',
      uploader: 'github',
      active: {
        repo: 'account-a/images',
        branch: 'main',
        token: 'fixture-token-a',
        path: 'images-a',
        webPath: 'public-a',
        customUrl: 'https://a.example.invalid',
      },
      selected: {
        repo: 'account-b/images',
        branch: 'photos',
        token: 'fixture-token-b',
        path: 'images-b',
        webPath: '',
        customUrl: '',
      },
    },
  ])(
    'keeps the $uploader profile when accepting defaults via $command',
    async ({ command, uploader, active, selected }) => {
      const primary = ctx.configManager.addUploaderConfig(uploader, 'A', active)
      const secondary = ctx.configManager.addUploaderConfig(uploader, 'B', selected)
      const prompt = acceptDefaults()

      await run(command, 'uploader', uploader, 'B')

      expect(prompt).toHaveBeenCalledTimes(1)
      expect(Object.fromEntries(prompt.mock.calls[0][0].map(question => [question.name, question.default]))).toEqual(
        selected,
      )
      const saved = await fs.readJson(ctx.configPath)
      expect(saved.uploader[uploader]).toEqual({
        defaultId: primary._id,
        configList: [primary, { ...secondary, _updatedAt: expect.any(Number) }],
      })
      expect(saved.picBed[uploader]).toEqual(primary)
      expect(saved.picBed).toMatchObject({ current: uploader, uploader })
      expect(ctx.log.error).not.toHaveBeenCalled()
    },
  )

  it('preserves false, zero, and empty defaults and falls back for fields missing from the profile', async () => {
    ctx.helper.uploader.register('test-uploader', {
      handle: async () => {},
      config: ctx => {
        const active = ctx.getConfig<Record<string, any>>('picBed.test-uploader')
        return [
          { name: 'enabled', type: 'confirm', required: false, default: active.enabled },
          { name: 'retries', type: 'input', required: false, default: active.retries },
          { name: 'label', type: 'input', required: false, default: active.label },
          { name: 'region', type: 'input', required: false, default: 'automatic' },
        ]
      },
    })
    const primary = ctx.configManager.addUploaderConfig('test-uploader', 'A', {
      enabled: true,
      retries: 5,
      label: 'active',
    })
    const secondary = ctx.configManager.addUploaderConfig('test-uploader', 'B', {
      enabled: false,
      retries: 0,
      label: '',
    })
    acceptDefaults()

    await run('set', 'uploader', 'test-uploader', 'B')

    expect(ctx.configManager.getConfigByName('test-uploader', 'B')).toEqual({
      ...secondary,
      region: 'automatic',
      _updatedAt: expect.any(Number),
    })
    expect(ctx.getConfig('picBed.test-uploader')).toEqual(primary)
  })

  it('merges submitted changes with settings omitted from the answers and the form', async () => {
    const primary = ctx.configManager.addUploaderConfig('local', 'A', { path: 'destination-A' })
    const secondary = ctx.configManager.addUploaderConfig('local', 'B', {
      path: 'destination-B',
      customUrl: 'https://b.example.invalid',
      webPath: 'images-b',
      extra: { keep: true },
    })
    vi.spyOn(ctx.cmd.inquirer, 'prompt').mockResolvedValueOnce({ path: 'destination-edited', customUrl: '' })

    await run('set', 'uploader', 'local', 'B')

    expect(ctx.configManager.getConfigByName('local', 'B')).toEqual({
      ...secondary,
      path: 'destination-edited',
      customUrl: '',
      _updatedAt: expect.any(Number),
    })
    expect(ctx.getConfig('picBed.local')).toEqual(primary)
  })

  it.each([
    { selection: 'direct', args: ['set', 'uploader', 'local'] },
    { selection: 'interactive', args: ['set', 'uploader'] },
  ])(
    'edits the named Default profile when its name is omitted with $selection uploader selection',
    async ({ args }) => {
      const primary = ctx.configManager.addUploaderConfig('local', 'A', { path: 'destination-A' })
      const secondary = ctx.configManager.addUploaderConfig('local', 'Default', {
        path: 'destination-default',
        customUrl: '',
        webPath: '',
      })
      const prompt = acceptDefaults()
      if (args.length === 2) prompt.mockResolvedValueOnce({ uploader: 'local' })

      await run(...args)

      expect(ctx.configManager.getConfigByName('local', 'Default')).toEqual({
        ...secondary,
        _updatedAt: expect.any(Number),
      })
      expect(ctx.getConfig('picBed.local')).toEqual(primary)
    },
  )

  it('still creates and activates a new named profile', async () => {
    const primary = ctx.configManager.addUploaderConfig('local', 'A', { path: 'destination-A' })
    const answer = { path: 'destination-new', customUrl: '', webPath: '' }
    vi.spyOn(ctx.cmd.inquirer, 'prompt').mockResolvedValueOnce(answer)

    await run('set', 'uploader', 'local', 'New')

    const saved = await fs.readJson(ctx.configPath)
    expect(saved.picBed.local).toMatchObject({ ...answer, _configName: 'New' })
    expect(saved.uploader.local).toEqual({
      defaultId: saved.picBed.local._id,
      configList: [primary, saved.picBed.local],
    })
  })

  it('leaves saved profiles untouched when editing is cancelled', async () => {
    ctx.configManager.addUploaderConfig('local', 'A', { path: 'destination-A' })
    ctx.configManager.addUploaderConfig('local', 'B', { path: 'destination-B' })
    const saved = await fs.readFile(ctx.configPath, 'utf8')
    vi.spyOn(ctx.cmd.inquirer, 'prompt').mockRejectedValueOnce(new Error('Prompt cancelled'))

    await run('set', 'uploader', 'local', 'B')

    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(saved)
    expect(ctx.log.success).not.toHaveBeenCalled()
  })
})
