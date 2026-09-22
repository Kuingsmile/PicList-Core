import os from 'node:os'
import path from 'node:path'

import { Command } from 'commander'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../../src/core/PicGo'
import upload from '../../../src/plugins/commander/upload'
import type { IPicGo } from '../../../src/types'
import * as imageFile from '../../../src/utils/common/imageFile'
import { IBusEvent } from '../../../src/utils/enum'
import { eventBus } from '../../../src/utils/eventBus'
import getClipboardImage from '../../../src/utils/getClipboardImage'

vi.mock('../../../src/utils/getClipboardImage', () => ({ default: vi.fn() }))

describe('upload CLI inputs', () => {
  let baseDir: string
  let ctx: {
    cmd: { program: Command }
    i18n: { t: (key: string) => string }
    uploadReturnCtx: ReturnType<typeof vi.fn>
    log: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }
  }

  const run = async (...args: string[]) => ctx.cmd.program.parseAsync(args, { from: 'user' })

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-upload-cli-'))
    ctx = {
      cmd: { program: new Command() },
      i18n: { t: (key: string) => key },
      uploadReturnCtx: vi.fn().mockResolvedValue({}),
      log: { warn: vi.fn(), error: vi.fn() },
    }
    upload.handle(ctx as unknown as IPicGo)
  })

  afterEach(async () => {
    await fs.remove(baseDir)
  })

  it.each(['upload', 'u'])('does not start an upload for a missing file via %s', async command => {
    const missing = path.join(baseDir, 'does-not-exist.png')

    await run(command, missing)

    expect(ctx.log.warn).toHaveBeenCalledWith(`${missing} does not exist.`)
    expect(ctx.uploadReturnCtx).not.toHaveBeenCalled()
  })

  it('does not start an upload when all supplied files are missing', async () => {
    await run('upload', path.join(baseDir, 'missing-one.png'), path.join(baseDir, 'missing-two.png'))

    expect(ctx.log.warn).toHaveBeenCalledTimes(2)
    expect(ctx.uploadReturnCtx).not.toHaveBeenCalled()
  })

  it('still requests a clipboard upload when no inputs are supplied', async () => {
    await run('upload')

    expect(ctx.uploadReturnCtx).toHaveBeenCalledExactlyOnceWith([], undefined)
    expect(ctx.log.warn).not.toHaveBeenCalled()
  })

  it('uploads an existing local file', async () => {
    const file = path.join(baseDir, 'image with spaces.png')
    await fs.writeFile(file, 'test image')

    await run('upload', path.relative(process.cwd(), file))

    expect(ctx.uploadReturnCtx).toHaveBeenCalledExactlyOnceWith([file], undefined)
  })

  it('uploads a URL without requiring a local file', async () => {
    const url = 'https://example.com/image.png'

    await run('upload', url)

    expect(ctx.uploadReturnCtx).toHaveBeenCalledExactlyOnceWith([url], undefined)
    expect(ctx.log.warn).not.toHaveBeenCalled()
  })

  it('still uploads valid files and URLs when other inputs are missing', async () => {
    const file = path.join(baseDir, 'image.png')
    const missing = path.join(baseDir, 'missing.png')
    const url = 'https://example.com/image.png'
    await fs.writeFile(file, 'test image')

    await run('upload', missing, file, url)

    expect(ctx.uploadReturnCtx).toHaveBeenCalledExactlyOnceWith([file, url], undefined)
    expect(ctx.log.warn).toHaveBeenCalledWith(`${missing} does not exist.`)
  })
})

describe('upload CLI destination selection', () => {
  let baseDir: string
  let file: string
  let picgo: PicGo
  let listeners: Set<(...args: any[]) => void>
  let destinations: string[]

  const run = async (...args: string[]) => picgo.cmd.program.parseAsync(args, { from: 'user' })

  beforeEach(async () => {
    listeners = new Set(eventBus.listeners(IBusEvent.CONFIG_CHANGE))
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-upload-destination-'))
    file = path.join(baseDir, 'image with spaces.png')
    await fs.writeFile(file, 'test image')
    const defaultA = { _id: 'a', _configName: 'Default', destination: 'a' }
    const defaultB = { _id: 'b', _configName: 'Default', destination: 'b' }
    await fs.writeJson(path.join(baseDir, 'config.json'), {
      silent: true,
      picBed: { uploader: 'test-a', current: 'test-b', transformer: 'test', 'test-a': defaultA, 'test-b': defaultB },
      uploader: {
        'test-a': {
          defaultId: 'a',
          configList: [defaultA, { _id: 'a2', _configName: 'Work account', destination: 'a2' }],
        },
        'test-b': {
          defaultId: 'b',
          configList: [defaultB, { _id: 'b2', _configName: 'Work account', destination: 'b2' }],
        },
      },
      picgoPlugins: {},
    })
    picgo = await PicGo.create(path.join(baseDir, 'config.json'))
    picgo.helper.transformer.register('test', {
      handle: async ctx => {
        ctx.output = ctx.input.map(input => ({ fileName: path.basename(input) }))
      },
    })
    destinations = []
    for (const type of ['test-a', 'test-b']) {
      picgo.helper.uploader.register(type, {
        handle: async ctx => {
          const destination = ctx.getConfig<string>(`picBed.${type}.destination`)
          destinations.push(destination)
          for (const item of ctx.output) item.imgUrl = `https://example.invalid/${destination}/${item.fileName}`
        },
      })
    }
    vi.spyOn(picgo.log, 'error').mockImplementation(() => {})
    vi.spyOn(imageFile, 'getURLFile').mockResolvedValue({
      success: true,
      buffer: Buffer.from('test image'),
      fileName: 'image.png',
      extname: '.png',
    })
    vi.mocked(getClipboardImage).mockResolvedValue({ imgPath: file, shouldKeepAfterUploading: true })
    upload.handle(picgo)
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
    { command: 'upload', options: ['--picbed', 'test-b'], destination: 'b', clipboard: false },
    {
      command: 'u',
      options: ['--picbed', 'test-b', '--configName', 'Work account'],
      destination: 'b2',
      clipboard: false,
    },
    { command: 'upload', options: ['--configName', 'Work account'], destination: 'a2', clipboard: false },
    {
      command: 'upload',
      options: ['--picbed=test-b', '--configName=Work account'],
      destination: 'b2',
      clipboard: true,
    },
  ])('selects $destination via $command (clipboard: $clipboard) without changing defaults', async testCase => {
    const saved = await fs.readFile(picgo.configPath, 'utf8')
    const originalConfig = picgo.getConfig()
    const inputs = testCase.clipboard ? [] : [file, 'https://example.invalid/image.png']

    await run(testCase.command, ...inputs, ...testCase.options)

    expect(picgo.log.error).not.toHaveBeenCalled()
    expect(destinations).toEqual([testCase.destination])
    expect(getClipboardImage).toHaveBeenCalledTimes(testCase.clipboard ? 1 : 0)
    expect(picgo.getConfig()).toEqual(originalConfig)
    expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(saved)

    await run('upload', file)
    expect(destinations).toEqual([testCase.destination, 'a'])
  })

  it('uses the legacy current uploader when selecting a profile without --picbed', async () => {
    picgo.removeConfig('picBed', 'uploader')

    await run('upload', '--configName', 'Work account', file)

    expect(picgo.log.error).not.toHaveBeenCalled()
    expect(destinations).toEqual(['b2'])
  })

  it.each([
    { options: ['--picbed', 'missing'], error: 'No uploader named missing' },
    { options: ['--configName', 'Missing'], error: 'Uploader configuration not found' },
    { options: ['--picbed', 'test-b', '--configName', 'Missing'], error: 'Uploader configuration not found' },
  ])('rejects an unavailable destination: $options', async ({ options, error }) => {
    const saved = await fs.readFile(picgo.configPath, 'utf8')

    await run('upload', ...options)

    expect(picgo.log.error).toHaveBeenCalledExactlyOnceWith(new Error(error))
    expect(destinations).toEqual([])
    expect(getClipboardImage).not.toHaveBeenCalled()
    expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(saved)
  })
})
