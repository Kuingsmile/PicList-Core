import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../../src/core/PicGo'
import configManager from '../../../src/plugins/commander/configManager'
import { IBusEvent } from '../../../src/utils/enum'
import { eventBus } from '../../../src/utils/eventBus'

describe('saved uploader config CLI commands', () => {
  let baseDir: string
  let ctx: PicGo
  let listeners: Set<(...args: any[]) => void>
  const primary = {
    _id: 'primary',
    _configName: 'Default',
    _createdAt: 1,
    _updatedAt: 1,
    destination: 'primary',
    retries: 1,
  }
  const backup = { ...primary, _id: 'backup', _configName: 'Backup', destination: 'backup', retries: 0 }
  const run = (...args: string[]) => ctx.cmd.program.parseAsync(args, { from: 'user' })

  beforeEach(async () => {
    listeners = new Set(eventBus.listeners(IBusEvent.CONFIG_CHANGE))
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-config-cli-'))
    await fs.writeJson(path.join(baseDir, 'config.json'), {
      silent: true,
      settings: { language: 'en' },
      picBed: { current: 'test-uploader', uploader: 'test-uploader', 'test-uploader': primary },
      uploader: { 'test-uploader': { defaultId: primary._id, configList: [primary, backup] } },
      picgoPlugins: {},
    })
    ctx = await PicGo.create(path.join(baseDir, 'config.json'))
    ctx.helper.uploader.register('test-uploader', {
      handle: async () => {},
      config: () => [
        { name: 'destination', type: 'input', message: 'Destination', required: false },
        { name: 'retries', type: 'input', message: 'Retries', required: false },
        { name: 'region', type: 'input', message: 'Region', required: false, default: 'auto' },
      ],
    })
    vi.spyOn(ctx.log, 'info').mockImplementation(() => {})
    vi.spyOn(ctx.log, 'success').mockImplementation(() => {})
    vi.spyOn(ctx.log, 'error').mockImplementation(() => {})
    configManager.handle(ctx)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const listener of eventBus.listeners(IBusEvent.CONFIG_CHANGE)) {
      if (!listeners.has(listener)) eventBus.removeListener(IBusEvent.CONFIG_CHANGE, listener)
    }
    await fs.remove(baseDir)
  })

  it('lists, shows, selects, renames, and removes profiles through config subcommands', async () => {
    await run('config', 'list', 'test-uploader')
    expect(ctx.log.info).toHaveBeenCalledWith(expect.stringContaining('Default (default)'))
    expect(ctx.log.info).toHaveBeenCalledWith(expect.stringContaining('Backup'))

    await run('config', 'show', 'test-uploader', 'Backup')
    expect(ctx.log.info).toHaveBeenCalledWith('Config details for "Backup":')

    await run('config', 'use', 'test-uploader', 'Backup')
    expect(ctx.configManager.getCurrentUploaderConfig('test-uploader')?._id).toBe(backup._id)

    await run('config', 'rename', 'test-uploader', 'Backup', 'Renamed')
    expect(ctx.configManager.getConfigByName('test-uploader', 'Renamed')?._id).toBe(backup._id)

    await run('config', 'use', 'test-uploader', 'Default')
    vi.spyOn(ctx.cmd.inquirer, 'prompt').mockResolvedValueOnce({ confirm: true })
    await run('config', 'remove', 'test-uploader', 'Renamed')
    expect(ctx.configManager.getAllUploaderConfigs('test-uploader')).toEqual([primary])
  })

  it('edits a named profile without selecting it or discarding fields outside its form', async () => {
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt').mockResolvedValueOnce({ destination: 'edited' })

    await run('config', 'edit', 'test-uploader', 'Backup')

    expect(prompt).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'destination', default: 'backup' }),
      expect.objectContaining({ name: 'retries', default: 0 }),
      expect.objectContaining({ name: 'region', default: 'auto' }),
    ])
    expect(ctx.configManager.getConfigByName('test-uploader', 'Backup')).toEqual({
      ...backup,
      destination: 'edited',
      _updatedAt: expect.any(Number),
    })
    expect(ctx.configManager.getCurrentUploaderConfig('test-uploader')).toEqual(primary)
    expect(ctx.getConfig('picBed.test-uploader')).toEqual(primary)
  })

  it('edits the default profile when its name is omitted', async () => {
    vi.spyOn(ctx.cmd.inquirer, 'prompt').mockResolvedValueOnce({ destination: 'edited-primary' })

    await run('config', 'edit', 'test-uploader')

    expect(ctx.configManager.getCurrentUploaderConfig('test-uploader')?.destination).toBe('edited-primary')
    expect(ctx.getConfig('picBed.test-uploader')).toMatchObject({ destination: 'edited-primary' })
  })

  it('does not create a profile when an edit target is missing', async () => {
    const prompt = vi.spyOn(ctx.cmd.inquirer, 'prompt')

    await run('config', 'edit', 'test-uploader', 'Missing')

    expect(ctx.log.error).toHaveBeenCalledWith('Config "Missing" not found for test-uploader')
    expect(prompt).not.toHaveBeenCalled()
    expect(ctx.configManager.getAllUploaderConfigs('test-uploader')).toEqual([primary, backup])
  })

  it('leaves profiles intact when the edit prompt is cancelled', async () => {
    const original = await fs.readFile(ctx.configPath, 'utf8')
    vi.spyOn(ctx.cmd.inquirer, 'prompt').mockRejectedValueOnce(new Error('Prompt cancelled'))

    await run('config', 'edit', 'test-uploader', 'Backup')

    expect(await fs.readFile(ctx.configPath, 'utf8')).toBe(original)
    expect(ctx.log.success).not.toHaveBeenCalled()
  })

  it('keeps the old flat commands available for existing scripts', async () => {
    await run('config-use', 'test-uploader', 'Backup')
    expect(ctx.configManager.getCurrentUploaderConfig('test-uploader')?._id).toBe(backup._id)
  })
})
