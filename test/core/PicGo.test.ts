import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../src/core/PicGo'
import type { IPicGo } from '../../src/types'
import { IBusEvent } from '../../src/utils/enum'
import { eventBus } from '../../src/utils/eventBus'
import getClipboardImage from '../../src/utils/getClipboardImage'

vi.mock('../../src/utils/getClipboardImage', () => ({ default: vi.fn() }))

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => (resolve = done))
  return { promise, resolve }
}

describe('PicGo upload configuration isolation', () => {
  let baseDir: string
  let picgo: PicGo
  let listeners: Set<(...args: any[]) => void>
  let beforeUpload: (ctx: IPicGo) => Promise<void>

  beforeEach(async () => {
    listeners = new Set(eventBus.listeners(IBusEvent.CONFIG_CHANGE))
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-config-test-'))
    const configA = { _id: 'a', _configName: 'Default', destination: 'a' }
    const configB = { _id: 'b', _configName: 'Default', destination: 'b' }
    await fs.writeJson(path.join(baseDir, 'config.json'), {
      silent: true,
      debug: true,
      picBed: {
        current: 'test-a',
        uploader: 'test-a',
        transformer: 'test',
        'test-a': configA,
        'test-b': configB,
        secondUploader: 'test-b',
        secondUploaderConfig: configB,
      },
      uploader: {
        'test-a': {
          defaultId: 'a',
          configList: [configA, { _id: 'a2', _configName: 'Other', destination: 'a2' }],
        },
        'test-b': { defaultId: 'b', configList: [configB] },
      },
      picgoPlugins: {},
    })
    picgo = await PicGo.create(path.join(baseDir, 'config.json'))
    beforeUpload = async () => {}
    picgo.helper.transformer.register('test', {
      handle: async ctx => {
        await beforeUpload(ctx)
        ctx.output = ctx.input.map(fileName => ({ fileName }))
      },
    })
    for (const type of ['test-a', 'test-b']) {
      picgo.helper.uploader.register(type, {
        handle: async ctx => {
          const config = ctx.getConfig<{ destination: string }>(`picBed.${type}`)
          // Plugins that captured the original PicGo instance must see the same selection.
          expect(picgo.getConfig('picBed.uploader')).toBe(type)
          expect(picgo.getConfig(`picBed.${type}`)).toEqual(config)
          for (const item of ctx.output) item.imgUrl = `https://example.invalid/${config.destination}/${item.fileName}`
        },
      })
    }
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.mocked(getClipboardImage).mockReset()
    for (const listener of eventBus.listeners(IBusEvent.CONFIG_CHANGE)) {
      if (!listeners.has(listener)) eventBus.removeListener(IBusEvent.CONFIG_CHANGE, listener)
    }
    await fs.remove(baseDir)
  })

  it.each([
    { picBed: 'test-b', destination: 'b' },
    { picBed: 'test-a', configName: 'Other', destination: 'a2' },
  ])('isolates a paused override from a default upload: $destination', async options => {
    const started = deferred()
    const release = deferred()
    const savedConfig = await fs.readFile(picgo.configPath, 'utf8')
    const save = vi.spyOn(picgo, 'saveConfig')
    const changes = vi.fn()
    eventBus.on(IBusEvent.CONFIG_CHANGE, changes)
    beforeUpload = async ctx => {
      if (ctx.input[0] === 'first.png') {
        started.resolve()
        await release.promise
      }
    }

    const first = picgo.uploadReturnCtx(['first.png'], options)
    try {
      await started.promise
      const second = await picgo.uploadReturnCtx(['second.png'])
      expect(second.ctx?.output[0].imgUrl).toBe('https://example.invalid/a/second.png')
      expect(picgo.getConfig('picBed.uploader')).toBe('test-a')
      expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(savedConfig)
    } finally {
      release.resolve()
      await first
    }
    const result = await first
    expect(result.ctx?.output[0].imgUrl).toBe(`https://example.invalid/${options.destination}/first.png`)
    expect(result.ctx?.getConfig('picBed.uploader')).toBe(options.picBed)
    expect(result.ctx?.getConfig(`picBed.${options.picBed}.destination`)).toBe(options.destination)
    expect(save).not.toHaveBeenCalled()
    expect(changes).not.toHaveBeenCalled()
    expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(savedConfig)
  })

  it.each(['upload', 'uploadReturnCtx'] as const)(
    '%s keeps its snapshot when defaults change during an upload',
    async method => {
      const started = deferred()
      const release = deferred()
      beforeUpload = async () => {
        started.resolve()
        await release.promise
      }
      const pending = picgo[method](['first.png'])
      try {
        await started.promise
        picgo.changeCurrentUploader('test-b', { _id: 'b2', destination: 'b2' })
      } finally {
        release.resolve()
      }
      const result = await pending
      const output = Array.isArray(result) ? result : (result as any).ctx.output
      expect(output[0].imgUrl).toBe('https://example.invalid/a/first.png')
      expect(picgo.getConfig('picBed.uploader')).toBe('test-b')
      expect((await fs.readJson(picgo.configPath)).picBed.uploader).toBe('test-b')
    },
  )

  it.each(['seperate', 'shared'])('isolates secondary uploads in %s mode', async mode => {
    picgo.saveConfig({ 'settings.enableSecondUploader': true, 'settings.secondPicBedMode': mode })
    const started = deferred()
    const release = deferred()
    const secondary = picgo.helper.uploader.get('test-b')!
    const handle = secondary.handle
    vi.spyOn(secondary, 'handle').mockImplementation(async ctx => {
      if (ctx.output[0].fileName === 'first.png') {
        started.resolve()
        await release.promise
      }
      return handle(ctx)
    })
    const savedConfig = await fs.readFile(picgo.configPath, 'utf8')
    const save = vi.spyOn(picgo, 'saveConfig')
    const pending = picgo.uploadReturnCtx(['first.png'])
    try {
      await started.promise
      const concurrent = await picgo.uploadReturnCtx(['second.png'])
      expect(concurrent.ctx?.output[0].imgUrl).toBe('https://example.invalid/a/second.png')
      expect(concurrent.backupCtx?.output[0].imgUrl).toBe('https://example.invalid/b/second.png')
      expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(savedConfig)
    } finally {
      release.resolve()
      await pending
    }
    const result = await pending
    expect(result.ctx?.getConfig('picBed.uploader')).toBe('test-a')
    expect(result.backupCtx?.getConfig('picBed.uploader')).toBe('test-b')
    expect(result.ctx?.output[0].imgUrl).toBe('https://example.invalid/a/first.png')
    expect(result.backupCtx?.output[0].imgUrl).toBe('https://example.invalid/b/first.png')
    expect(save).not.toHaveBeenCalled()
    expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(savedConfig)
  })

  it('captures secondary settings before the primary upload starts', async () => {
    picgo.saveConfig({ 'settings.enableSecondUploader': true })
    const started = deferred()
    const release = deferred()
    beforeUpload = async () => {
      started.resolve()
      await release.promise
    }
    const pending = picgo.uploadReturnCtx(['first.png'])
    try {
      await started.promise
      picgo.saveConfig({ 'picBed.secondUploaderConfig': { _id: 'b2', destination: 'b2' } })
    } finally {
      release.resolve()
    }
    expect((await pending).backupCtx?.output[0].imgUrl).toBe('https://example.invalid/b/first.png')
    expect(picgo.getConfig('picBed.secondUploaderConfig.destination')).toBe('b2')
  })

  it('uses updated source config for subsequent secondary uploads', async () => {
    picgo.saveConfig({ 'settings.enableSecondUploader': true })
    expect(picgo.configManager.updateUploaderConfig('test-b', 'b', { destination: 'updated' })).toBe(true)

    const result = await picgo.uploadReturnCtx(['first.png'])

    expect(result.ctx?.output[0].imgUrl).toBe('https://example.invalid/a/first.png')
    expect(result.backupCtx?.output[0].imgUrl).toBe('https://example.invalid/updated/first.png')
  })

  it('stops secondary uploads after their source config is deleted', async () => {
    picgo.saveConfig({ 'settings.enableSecondUploader': true })
    const secondary = vi.spyOn(picgo.helper.uploader.get('test-b')!, 'handle')
    expect(picgo.configManager.deleteUploaderConfig('test-b', 'b')).toBe(true)

    const result = await picgo.uploadReturnCtx(['first.png'])

    expect(result.ctx?.output[0].imgUrl).toBe('https://example.invalid/a/first.png')
    expect(result.backupCtx).toBeUndefined()
    expect(secondary).not.toHaveBeenCalled()
    const saved = await fs.readJson(picgo.configPath)
    expect(saved.picBed.secondUploader).toBe('')
    expect(saved.picBed.secondUploaderConfig).toEqual({})
    expect(saved.settings.enableSecondUploader).toBe(false)
  })

  it.each(['upload', 'uploadReturnCtx'] as const)('%s snapshots config before awaiting the clipboard', async method => {
    const started = deferred()
    const release = deferred()
    vi.mocked(getClipboardImage).mockImplementation(async ctx => {
      started.resolve()
      await release.promise
      expect(ctx.getConfig('picBed.uploader')).toBe('test-a')
      return { imgPath: 'clipboard.png', shouldKeepAfterUploading: true }
    })
    const pending = picgo[method]()
    try {
      await started.promise
      picgo.changeCurrentUploader('test-b', { _id: 'b', destination: 'b' })
    } finally {
      release.resolve()
    }
    const result = await pending
    const output = Array.isArray(result) ? result : (result as any).ctx.output
    expect(output[0].imgUrl).toBe('https://example.invalid/a/clipboard.png')
  })

  it('preserves explicit plugin saves and isolates mutations of returned config objects', async () => {
    beforeUpload = async ctx => {
      const config = ctx.getConfig<any>()
      config.picBed.uploader = 'test-b'
      config.picBed['test-a'].destination = 'wrong'
      ctx.saveConfig({ 'test-plugin.cache': { value: 'saved' } })
      expect(ctx.getConfig('test-plugin.cache.value')).toBe('saved')
      ctx.setConfig({ 'test-plugin.temporary': true })
      expect(ctx.getConfig('test-plugin.temporary')).toBe(true)
      ctx.unsetConfig('test-plugin', 'temporary')
      expect(ctx.getConfig('test-plugin.temporary')).toBeUndefined()
    }
    const result = await picgo.uploadReturnCtx(['first.png'])
    expect(result.ctx?.output[0].imgUrl).toBe('https://example.invalid/a/first.png')
    expect(picgo.getConfig('test-plugin.cache.value')).toBe('saved')
    expect((await fs.readJson(picgo.configPath))['test-plugin']).toEqual({ cache: { value: 'saved' } })
    result.ctx?.removeConfig('test-plugin', 'cache')
    expect(result.ctx?.getConfig('test-plugin.cache')).toBeUndefined()
    expect(picgo.getConfig('test-plugin.cache')).toBeUndefined()
  })

  it('does not persist selections when primary or secondary uploaders fail', async () => {
    const savedConfig = await fs.readFile(picgo.configPath, 'utf8')
    vi.spyOn(picgo.helper.uploader.get('test-b')!, 'handle').mockRejectedValue(new Error('Synthetic failure'))
    await expect(picgo.uploadReturnCtx(['first.png'], { picBed: 'test-b' })).rejects.toThrow('Synthetic failure')
    expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(savedConfig)
    picgo.saveConfig({ 'settings.enableSecondUploader': true })
    const configWithBackup = await fs.readFile(picgo.configPath, 'utf8')
    const result = await picgo.uploadReturnCtx(['second.png'])
    expect(result.ctx?.output[0].imgUrl).toBe('https://example.invalid/a/second.png')
    expect(result.backupCtx).toBeUndefined()
    expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(configWithBackup)
  })

  it('rejects an unknown named configuration without changing defaults', async () => {
    const savedConfig = await fs.readFile(picgo.configPath, 'utf8')
    await expect(picgo.uploadReturnCtx(['first.png'], { picBed: 'test-a', configName: 'Missing' })).rejects.toThrow(
      'Uploader configuration not found',
    )
    expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(savedConfig)
  })
})
