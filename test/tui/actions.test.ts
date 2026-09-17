import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../src/core/PicGo'
import { createActions, parseUploadPaths, validateUploadPaths } from '../../src/tui/actions'
import { PromptCancelledError, TuiSession } from '../../src/tui/session'
import { IBusEvent } from '../../src/utils/enum'
import { eventBus } from '../../src/utils/eventBus'

describe('TUI workflows', () => {
  let baseDir: string
  let ctx: PicGo
  let session: TuiSession
  let listeners: Set<(...args: any[]) => void>
  const primary = {
    _id: 'primary',
    _configName: 'Default',
    _createdAt: 1,
    _updatedAt: 1,
    destination: 'primary-destination',
  }
  const backup = { ...primary, _id: 'backup', _configName: 'Backup', destination: 'backup-destination' }
  const run = (label: string) =>
    createActions(ctx)
      .find(action => action.label === label)!
      .run()
  const answers = (...values: any[]) => {
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt')
    values.forEach(value => prompt.mockResolvedValueOnce(value))
    return prompt
  }

  beforeEach(async () => {
    listeners = new Set(eventBus.listeners(IBusEvent.CONFIG_CHANGE))
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-tui-'))
    await fs.writeJson(path.join(baseDir, 'config.json'), {
      silent: true,
      picBed: { current: 'test-uploader', uploader: 'test-uploader', 'test-uploader': primary },
      uploader: { 'test-uploader': { defaultId: primary._id, configList: [primary, backup] } },
      picgoPlugins: {},
    })
    ctx = await PicGo.create(path.join(baseDir, 'config.json'))
    ctx.helper.uploader.register('test-uploader', {
      handle: async () => {},
      config: () => [{ name: 'destination', type: 'input', default: primary.destination }],
    })
    session = new TuiSession()
    session.attach(ctx)
  })

  afterEach(async () => {
    await session.dispose()
    vi.restoreAllMocks()
    for (const listener of eventBus.listeners(IBusEvent.CONFIG_CHANGE)) {
      if (!listeners.has(listener)) eventBus.removeListener(IBusEvent.CONFIG_CHANGE, listener)
    }
    await fs.remove(baseDir)
  })

  it('edits the selected configuration using its own defaults', async () => {
    const prompt = answers(
      { value: 'test-uploader' },
      { value: 'Edit' },
      { value: 'backup' },
      { destination: 'edited-backup' },
    )
    await run('Uploader configurations')
    expect(prompt.mock.calls[3][0][0].default).toBe('backup-destination')
    expect(ctx.configManager.getConfigByName('test-uploader', 'Backup')?.destination).toBe('edited-backup')
    expect(ctx.configManager.getConfigByName('test-uploader', 'Default')?.destination).toBe(primary.destination)
  })

  it('creates and activates a destination through the guided setup flow', async () => {
    answers({ value: 'test-uploader' }, { value: 'New destination' }, { destination: 'new-target' })
    await run('Set up a destination')
    expect(ctx.configManager.getCurrentUploaderConfig('test-uploader')).toMatchObject({
      _configName: 'New destination',
      destination: 'new-target',
    })
    expect(ctx.getConfig('picBed.current')).toBe('test-uploader')
  })

  it('does not save a partially completed uploader form after cancellation', async () => {
    const previous = await fs.readFile(ctx.configPath, 'utf8')
    const prompt = answers({ value: 'test-uploader' }, { value: 'Edit' }, { value: 'backup' })
    prompt.mockRejectedValueOnce(new PromptCancelledError())
    await expect(run('Uploader configurations')).rejects.toBeInstanceOf(PromptCancelledError)
    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(previous)
  })

  it('switches uploader configuration without changing transformer settings', async () => {
    ctx.saveConfig({ 'picBed.transformer': 'base64' })
    answers({ value: 'test-uploader' }, { value: 'backup' })
    await run('Switch uploader')
    expect(ctx.getConfig('picBed.test-uploader.destination')).toBe('backup-destination')
    expect(ctx.getConfig('picBed.transformer')).toBe('base64')
  })

  it('uses the shared secondary uploader workflow', async () => {
    answers(
      { enableSecondUploader: true },
      { uploader: 'test-uploader' },
      { configId: 'backup' },
      { secondPicBedMode: 'shared' },
    )
    await run('Secondary uploader')
    expect(ctx.getConfig('picBed.secondUploaderConfig')).toMatchObject({ _id: 'backup' })
    expect(ctx.getConfig('settings.enableSecondUploader')).toBe(true)
  })

  it('does not delete a configuration when confirmation is declined', async () => {
    answers({ value: 'test-uploader' }, { value: 'Delete' }, { value: 'backup' }, { value: false })
    await run('Uploader configurations')
    expect(ctx.configManager.getAllUploaderConfigs('test-uploader')).toHaveLength(2)
  })

  it('retains defaults from the selected image processing configuration', async () => {
    ctx.saveConfig({
      'buildIn.compress': { quality: 80 },
      'buildIn.list': [{ id: 'backup', compress: { quality: 37, isConvert: false } }],
    })
    const prompt = answers(
      { value: 'uploader' },
      { value: 'test-uploader' },
      { value: 'backup' },
      { buildin: 'compress' },
    )
    prompt.mockRejectedValueOnce(new PromptCancelledError())
    await expect(run('Image processing')).rejects.toBeInstanceOf(PromptCancelledError)
    expect(prompt.mock.calls[4][0].find(question => question.name === 'quality')?.default).toBe(37)
    expect(ctx.getConfig('buildIn.compress')).toEqual({ quality: 80 })
  })

  it('uploads a local image through the real lifecycle and returns its destination', async () => {
    const file = path.join(baseDir, 'image with spaces.png')
    const target = path.join(baseDir, 'uploaded')
    await fs.writeFile(
      file,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
        'base64',
      ),
    )
    ctx.configManager.addUploaderConfig('local', 'Default', { path: target })
    ctx.saveConfig({ 'picBed.current': 'local', 'picBed.uploader': 'local', 'settings.rename': false })
    answers({ value: `"${file}"` })
    const result = await run('Upload files or URLs')
    expect(result).toEqual([path.join(target, 'image with spaces.png')])
    expect(await fs.readFile(path.join(target, 'image with spaces.png'))).toEqual(await fs.readFile(file))
    expect(await fs.pathExists(path.join(baseDir, 'piclist.log'))).toBe(false)
  })

  it('rejects invalid paths without falling back to a clipboard upload', async () => {
    const upload = vi.spyOn(ctx, 'uploadReturnCtx')
    answers({ value: 'missing-file.png' })
    await expect(run('Upload files or URLs')).rejects.toThrow('missing')
    expect(upload).not.toHaveBeenCalled()
    await expect(validateUploadPaths('')).rejects.toThrow('at least one')
    await expect(validateUploadPaths(`"${baseDir}"`)).rejects.toThrow('not a file')
  })
})

describe('pasted upload paths', () => {
  it('preserves Windows paths, quotes, apostrophes and URL query strings', () => {
    expect(parseUploadPaths('"C:\\My Pictures\\one.png" C:\\pics\\two.png "https://example.com/a?b=1&c=2"')).toEqual([
      'C:\\My Pictures\\one.png',
      'C:\\pics\\two.png',
      'https://example.com/a?b=1&c=2',
    ])
    expect(parseUploadPaths("/tmp/it's.png '/tmp/space name.png'")).toEqual(["/tmp/it's.png", '/tmp/space name.png'])
  })
  it('rejects unmatched quotes', () => {
    expect(() => parseUploadPaths('"unfinished path')).toThrow('Close the quote')
  })
})
