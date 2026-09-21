import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import * as fsExtra from 'fs-extra/esm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../src/core/PicGo'
import type { IPicGo } from '../../src/types'
import { IBuildInEvent, IBusEvent } from '../../src/utils/enum'
import { eventBus } from '../../src/utils/eventBus'
import getClipboardImage from '../../src/utils/getClipboardImage'

vi.mock('../../src/utils/getClipboardImage', () => ({ default: vi.fn() }))
vi.mock('fs-extra/esm', async importOriginal => {
  const actual = await importOriginal<typeof import('fs-extra/esm')>()
  return { ...actual, remove: vi.fn(actual.remove) }
})

/** Creates a manually released promise used to coordinate overlapping upload tests. */
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => (resolve = done))
  return { promise, resolve }
}

describe('PicGo runtime configuration', () => {
  let baseDir: string
  let picgo: PicGo

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-runtime-config-test-'))
    picgo = new PicGo(path.join(baseDir, 'config.json'))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await fs.remove(baseDir)
  })

  it('retains runtime flags across keyed and whole-config reads without saving them', async () => {
    const savedConfig = await fs.readFile(picgo.configPath, 'utf8')

    picgo.setConfig({ silent: true, debug: true })

    expect(picgo.getConfig('silent')).toBe(true)
    expect(picgo.getConfig('debug')).toBe(true)
    expect(picgo.getConfig()).toMatchObject({ silent: true, debug: true })
    expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(savedConfig)
    expect(new PicGo(picgo.configPath).getConfig('silent')).toBeUndefined()
  })

  it('retains CLI silent and debug flags when a command reads them', async () => {
    const savedConfig = await fs.readFile(picgo.configPath, 'utf8')
    vi.stubEnv('PICGO_VERSION', '0.0.0-test')
    picgo.cmd.init()
    const action = vi.fn(() => {
      expect(picgo.getConfig('silent')).toBe(true)
      expect(picgo.getConfig('debug')).toBe(true)
    })
    picgo.cmd.program.action(action)

    await picgo.cmd.program.parseAsync(['--silent', '--debug'], { from: 'user' })

    expect(action).toHaveBeenCalledOnce()
    expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(savedConfig)
  })

  it('makes runtime values available to configuration change listeners', () => {
    const observed: unknown[] = []
    const listener = ({ configName }: { configName: string }) => observed.push(picgo.getConfig(configName))
    eventBus.on(IBusEvent.CONFIG_CHANGE, listener)
    try {
      picgo.setConfig({ silent: true, debug: false })
      expect(observed).toEqual([true, false])
      expect(picgo.getConfig()).toMatchObject({ silent: true, debug: false })
    } finally {
      eventBus.removeListener(IBusEvent.CONFIG_CHANGE, listener)
    }
  })

  it('keeps runtime overrides while refreshing unrelated settings from disk', async () => {
    picgo.setConfig({ silent: true, 'picBed.proxy': 'http://runtime.invalid' })
    const saved = await fs.readJson(picgo.configPath)
    await fs.writeJson(picgo.configPath, {
      ...saved,
      silent: false,
      picBed: { ...saved.picBed, uploader: 'github', proxy: 'http://saved.invalid' },
    })

    expect(picgo.getConfig('silent')).toBe(true)
    expect(picgo.getConfig('picBed.proxy')).toBe('http://runtime.invalid')
    expect(picgo.getConfig('picBed.uploader')).toBe('github')
  })

  it('preserves object replacement, array replacement, and nested runtime edits', () => {
    picgo.saveConfig({ 'test-plugin': { obsolete: true }, items: ['old', 'extra'] })
    const config = { 'test-plugin': { enabled: true }, items: ['new'] }
    picgo.setConfig(config)
    config['test-plugin'].enabled = false
    config.items.push('mutated')
    picgo.setConfig({ 'test-plugin.nested.value': 1, 'items[0]': 'updated' })

    expect(picgo.getConfig('test-plugin')).toEqual({ enabled: true, nested: { value: 1 } })
    expect(picgo.getConfig('items')).toEqual(['updated'])
    picgo.setConfig({ 'test-plugin': { replaced: true } })
    expect(picgo.getConfig('test-plugin')).toEqual({ replaced: true })
  })

  it('preserves runtime unsets without removing saved values', async () => {
    picgo.saveConfig({ 'test-plugin': { saved: true, keep: true } })
    picgo.setConfig({ 'test-plugin.temporary': true })
    picgo.unsetConfig('test-plugin', 'saved')
    picgo.unsetConfig('test-plugin', 'temporary')

    expect(picgo.getConfig('test-plugin')).toEqual({ keep: true })
    expect((await fs.readJson(picgo.configPath))['test-plugin']).toEqual({ saved: true, keep: true })
    picgo.setConfig({ 'test-plugin.saved': false })
    expect(picgo.getConfig('test-plugin.saved')).toBe(false)
  })

  it('saves only explicit settings and releases their runtime overrides', async () => {
    picgo.setConfig({ silent: true, debug: true, 'test-plugin.value': 'runtime' })
    picgo.saveConfig({ debug: false, 'test-plugin': { value: 'saved' } })

    expect(picgo.getConfig()).toMatchObject({ silent: true, debug: false, 'test-plugin': { value: 'saved' } })
    const saved = await fs.readJson(picgo.configPath)
    expect(saved.silent).toBeUndefined()
    expect(saved.debug).toBe(false)
    expect(saved['test-plugin']).toEqual({ value: 'saved' })
    await fs.writeJson(picgo.configPath, { ...saved, debug: true, 'test-plugin': { value: 'external' } })
    expect(picgo.getConfig('debug')).toBe(true)
    expect(picgo.getConfig('test-plugin.value')).toBe('external')
  })

  it('removes runtime and saved properties while retaining sibling overrides', async () => {
    picgo.saveConfig({ 'test-plugin': { saved: true } })
    picgo.setConfig({ 'test-plugin.saved': false, 'test-plugin.temporary': true })
    picgo.removeConfig('test-plugin', 'saved')

    expect(picgo.getConfig('test-plugin')).toEqual({ temporary: true })
    const saved = await fs.readJson(picgo.configPath)
    expect(saved['test-plugin']).toEqual({})
    await fs.writeJson(picgo.configPath, { ...saved, 'test-plugin': { saved: 'external' } })
    expect(picgo.getConfig('test-plugin')).toEqual({ saved: 'external', temporary: true })
  })
})

describe('PicGo upload configuration isolation', () => {
  let baseDir: string
  let picgo: PicGo
  let listeners: Set<(...args: any[]) => void>
  let beforeUpload: (ctx: IPicGo) => Promise<void>

  beforeEach(async () => {
    listeners = new Set(eventBus.listeners(IBusEvent.CONFIG_CHANGE))
    vi.mocked(fsExtra.remove).mockClear()
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

  it.each(['upload', 'uploadReturnCtx'] as const)(
    '%s inherits runtime flags and isolates plugin overrides',
    async method => {
      picgo.saveConfig({ silent: false, debug: false })
      picgo.setConfig({ silent: true, debug: true })
      beforeUpload = async ctx => {
        expect(ctx.getConfig('silent')).toBe(true)
        expect(ctx.getConfig('debug')).toBe(true)
        ctx.setConfig({ 'test-plugin.temporary': true })
        expect(ctx.getConfig('test-plugin.temporary')).toBe(true)
      }

      await picgo[method](['first.png'])

      expect(picgo.getConfig('test-plugin.temporary')).toBeUndefined()
      expect(picgo.getConfig()).toMatchObject({ silent: true, debug: true })
      expect(await fs.readJson(picgo.configPath)).toMatchObject({ silent: false, debug: false })
    },
  )

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

  it('migrates a saved legacy mode before independently processing the secondary upload', async () => {
    const saved = await fs.readJson(picgo.configPath)
    await fs.writeJson(picgo.configPath, {
      ...saved,
      settings: { enableSecondUploader: true, secondPicBedMode: 'seperate' },
    })
    const transform = vi.spyOn(picgo.helper.transformer.get('test')!, 'handle')

    const result = await picgo.uploadReturnCtx(['first.png'])

    expect(transform).toHaveBeenCalledTimes(2)
    expect(result.ctx?.output[0].imgUrl).toBe('https://example.invalid/a/first.png')
    expect(result.backupCtx?.output[0].imgUrl).toBe('https://example.invalid/b/first.png')
    expect(result.ctx?.getConfig('settings.secondPicBedMode')).toBe('separate')
    expect(result.backupCtx?.getConfig('settings.secondPicBedMode')).toBe('separate')
    expect((await fs.readJson(picgo.configPath)).settings.secondPicBedMode).toBe('separate')
  })

  it.each(['separate', 'shared'])('isolates secondary uploads in %s mode', async mode => {
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

  describe.each(['upload', 'uploadReturnCtx'] as const)('%s clipboard cleanup', method => {
    it.each([
      { outcome: 'finished', source: 'file' },
      { outcome: 'failed', source: 'file' },
      { outcome: 'finished', source: 'clipboard' },
      { outcome: 'failed', source: 'clipboard' },
    ])('keeps a paused clipboard input when another $source upload has $outcome', async ({ outcome, source }) => {
      const imgPath = path.join(baseDir, 'clipboard.png')
      const otherPath = path.join(baseDir, 'other.png')
      await fs.writeFile(imgPath, 'clipboard image')
      await fs.writeFile(otherPath, 'other image')
      vi.mocked(getClipboardImage)
        .mockResolvedValueOnce({ imgPath, shouldKeepAfterUploading: false })
        .mockResolvedValueOnce({ imgPath: otherPath, shouldKeepAfterUploading: false })
      const remove = vi.spyOn(fsExtra, 'remove')
      const started = deferred()
      const release = deferred()
      beforeUpload = async ctx => {
        if (ctx.input[0] === imgPath) {
          started.resolve()
          await release.promise
          expect(await fs.readFile(imgPath, 'utf8')).toBe('clipboard image')
        } else if (outcome === 'failed') {
          throw new Error('Concurrent upload failed')
        }
      }
      const pending = picgo[method]()
      try {
        await started.promise
        const concurrent = picgo[method === 'upload' ? 'uploadReturnCtx' : 'upload'](
          source === 'clipboard' ? [] : [otherPath],
        )
        if (outcome === 'failed') {
          await expect(concurrent).rejects.toThrow('Concurrent upload failed')
        } else {
          await concurrent
        }
        // Drain any event-triggered removals before checking the paused upload's input.
        await Promise.all(remove.mock.results.map(result => result.value))
        expect(await fs.pathExists(imgPath)).toBe(true)
        expect(await fs.pathExists(otherPath)).toBe(source === 'file')
      } finally {
        release.resolve()
        await Promise.allSettled([pending])
      }
      const result = await pending
      const output = Array.isArray(result) ? result : (result as any).ctx.output
      expect(output[0].imgUrl).toBe(`https://example.invalid/a/${imgPath}`)
      expect(await fs.pathExists(imgPath)).toBe(false)
      expect(picgo.listenerCount(IBuildInEvent.FAILED)).toBe(0)
      expect(picgo.listenerCount(IBuildInEvent.FINISHED)).toBe(0)
    })

    it.each([false, true])('removes generated input after a failed upload (debug: %s)', async debug => {
      picgo.setConfig({ debug, 'settings.enableSecondUploader': true })
      const imgPath = path.join(baseDir, 'clipboard.png')
      await fs.writeFile(imgPath, 'clipboard image')
      vi.mocked(getClipboardImage).mockResolvedValue({ imgPath, shouldKeepAfterUploading: false })
      beforeUpload = async () => {
        throw new Error('Upload failed')
      }

      if (debug) {
        await expect(picgo[method]()).rejects.toThrow('Upload failed')
      } else {
        await picgo[method]()
      }

      expect(await fs.pathExists(imgPath)).toBe(false)
      expect(fsExtra.remove).toHaveBeenCalledExactlyOnceWith(imgPath)
    })

    it.each([false, true])('retains existing clipboard files (failure: %s)', async failure => {
      const imgPath = path.join(baseDir, 'existing.png')
      await fs.writeFile(imgPath, 'existing image')
      vi.mocked(getClipboardImage).mockResolvedValue({ imgPath, shouldKeepAfterUploading: true })
      beforeUpload = async () => {
        if (failure) throw new Error('Upload failed')
      }

      if (failure) {
        await expect(picgo[method]()).rejects.toThrow('Upload failed')
      } else {
        await picgo[method]()
      }

      expect(await fs.readFile(imgPath, 'utf8')).toBe('existing image')
      expect(fsExtra.remove).not.toHaveBeenCalled()
      expect(picgo.listenerCount(IBuildInEvent.FAILED)).toBe(0)
      expect(picgo.listenerCount(IBuildInEvent.FINISHED)).toBe(0)
    })

    it.each([false, true])('logs cleanup errors without replacing the upload outcome (failure: %s)', async failure => {
      const imgPath = path.join(baseDir, 'clipboard.png')
      await fs.writeFile(imgPath, 'clipboard image')
      vi.mocked(getClipboardImage).mockResolvedValue({ imgPath, shouldKeepAfterUploading: false })
      const cleanupError = new Error('Cleanup failed')
      vi.mocked(fsExtra.remove).mockRejectedValueOnce(cleanupError)
      const log = vi.spyOn(picgo.log, 'error')
      beforeUpload = async () => {
        if (failure) throw new Error('Upload failed')
      }

      if (failure) {
        await expect(picgo[method]()).rejects.toThrow('Upload failed')
      } else {
        const result = await picgo[method]()
        const output = Array.isArray(result) ? result : (result as any).ctx.output
        expect(output[0].imgUrl).toBe(`https://example.invalid/a/${imgPath}`)
      }
      expect(log).toHaveBeenCalledWith(cleanupError)
    })

    it('emits acquisition failures without trying to remove a sentinel path', async () => {
      vi.mocked(getClipboardImage).mockResolvedValue({ imgPath: 'no image', shouldKeepAfterUploading: false })
      const failed = vi.fn()
      picgo.on(IBuildInEvent.FAILED, failed)

      await expect(picgo[method]()).rejects.toThrow('image not found in clipboard')

      expect(failed).toHaveBeenCalledOnce()
      expect(fsExtra.remove).not.toHaveBeenCalled()
    })
  })

  describe.each(['separate', 'shared'])('clipboard cleanup with a %s secondary upload', mode => {
    it.each([false, true])('retains input until the secondary upload settles (failure: %s)', async failure => {
      picgo.setConfig({ 'settings.enableSecondUploader': true, 'settings.secondPicBedMode': mode })
      const imgPath = path.join(baseDir, 'clipboard.png')
      await fs.writeFile(imgPath, 'clipboard image')
      vi.mocked(getClipboardImage).mockResolvedValue({ imgPath, shouldKeepAfterUploading: false })
      const started = deferred()
      const release = deferred()
      const secondary = picgo.helper.uploader.get('test-b')!
      const handle = secondary.handle
      vi.spyOn(secondary, 'handle').mockImplementation(async ctx => {
        started.resolve()
        await release.promise
        expect(await fs.readFile(imgPath, 'utf8')).toBe('clipboard image')
        if (failure) throw new Error('Secondary upload failed')
        return handle(ctx)
      })
      const observedInputs: string[] = []
      beforeUpload = async ctx => {
        if (ctx.input[0] === imgPath) {
          expect(await fs.readFile(imgPath, 'utf8')).toBe('clipboard image')
          observedInputs.push(imgPath)
        }
      }

      const pending = picgo.uploadReturnCtx()
      try {
        await started.promise
        await picgo.upload(['other.png'])
        await Promise.all(vi.mocked(fsExtra.remove).mock.results.map(result => result.value))
        expect(await fs.pathExists(imgPath)).toBe(true)
      } finally {
        release.resolve()
        await Promise.allSettled([pending])
      }

      const result = await pending
      expect(result.ctx?.output[0].imgUrl).toBe(`https://example.invalid/a/${imgPath}`)
      if (failure) {
        expect(result.backupCtx).toBeUndefined()
      } else {
        expect(result.backupCtx?.output[0].imgUrl).toBe(`https://example.invalid/b/${imgPath}`)
      }
      expect(observedInputs).toHaveLength(mode === 'separate' ? 2 : 1)
      expect(await fs.pathExists(imgPath)).toBe(false)
      expect(fsExtra.remove).toHaveBeenCalledExactlyOnceWith(imgPath)
      expect(picgo.listenerCount(IBuildInEvent.FAILED)).toBe(0)
      expect(picgo.listenerCount(IBuildInEvent.FINISHED)).toBe(0)
    })
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
