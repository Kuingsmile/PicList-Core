import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../../src/core/PicGo'
import configManager from '../../../src/plugins/commander/configManager'
import setting from '../../../src/plugins/commander/setting'
import type { IConfigItem } from '../../../src/types'
import { IBusEvent } from '../../../src/utils/enum'
import { eventBus } from '../../../src/utils/eventBus'

describe('secondary uploader CLI settings', () => {
  let baseDir: string
  let picgo: PicGo
  let listeners: Set<(...args: any[]) => void>
  const primary = { _id: 'a', _configName: 'Default', _createdAt: 1, _updatedAt: 1, destination: 'primary' }
  const defaultBackup = { ...primary, _id: 'b', destination: 'default-backup' }
  const backup = { ...primary, _id: 'b2', _configName: 'Backup account', destination: 'backup' }

  const run = async (...args: string[]) => picgo.cmd.program.parseAsync(args, { from: 'user' })

  beforeEach(async () => {
    listeners = new Set(eventBus.listeners(IBusEvent.CONFIG_CHANGE))
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-secondary-cli-'))
    await fs.writeJson(path.join(baseDir, 'config.json'), {
      silent: true,
      picBed: {
        current: 'test-a',
        uploader: 'test-a',
        'test-a': primary,
        'test-b': defaultBackup,
      },
      uploader: {
        'test-a': { defaultId: primary._id, configList: [primary] },
        'test-b': { defaultId: defaultBackup._id, configList: [defaultBackup, backup] },
      },
      picgoPlugins: {},
    })
    picgo = await PicGo.create(path.join(baseDir, 'config.json'))
    for (const uploader of ['test-a', 'test-b', 'test-empty']) {
      picgo.helper.uploader.register(uploader, {
        handle: async () => {},
        config: () => [{ name: 'destination', type: 'input', message: 'Destination' }],
      })
    }
    vi.spyOn(picgo.log, 'success').mockImplementation(() => {})
    vi.spyOn(picgo.log, 'error').mockImplementation(() => {})
    setting.handle(picgo)
    configManager.handle(picgo)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const listener of eventBus.listeners(IBusEvent.CONFIG_CHANGE)) {
      if (!listeners.has(listener)) eventBus.removeListener(IBusEvent.CONFIG_CHANGE, listener)
    }
    await fs.remove(baseDir)
  })

  it.each([
    ['set', 'shared'],
    ['config', 'seperate'],
  ])('selects a named source using %s in %s mode without changing defaults', async (command, mode) => {
    vi.spyOn(picgo.cmd.inquirer, 'prompt')
      .mockResolvedValueOnce({ enableSecondUploader: true })
      .mockResolvedValueOnce({ secondPicBedMode: mode })

    await run(command, 'secondUploader', 'test-b', 'Backup account')

    const saved = await fs.readJson(picgo.configPath)
    expect(saved.picBed.secondUploader).toBe('test-b')
    expect(saved.picBed.secondUploaderConfig).toEqual(backup)
    expect(saved.settings).toMatchObject({ enableSecondUploader: true, secondPicBedMode: mode })
    expect(saved.picBed.current).toBe('test-a')
    expect(saved.picBed.uploader).toBe('test-a')
    expect(saved.picBed['test-b']).toEqual(defaultBackup)
    expect(saved.uploader['test-b'].defaultId).toBe(defaultBackup._id)
  })

  it('prompts for the uploader and source, preserving the current selection as the default', async () => {
    picgo.saveConfig({
      'picBed.secondUploader': 'test-b',
      'picBed.secondUploaderConfig': backup,
      'settings.enableSecondUploader': true,
      'settings.secondPicBedMode': 'seperate',
    })
    const prompt = vi
      .spyOn(picgo.cmd.inquirer, 'prompt')
      .mockResolvedValueOnce({ enableSecondUploader: true })
      .mockResolvedValueOnce({ uploader: 'test-b' })
      .mockResolvedValueOnce({ configId: backup._id })
      .mockResolvedValueOnce({ secondPicBedMode: 'shared' })

    await run('set', 'secondUploader')

    expect(prompt.mock.calls.map(([questions]) => questions[0].default)).toEqual([true, 'test-b', 'b2', 'seperate'])
    expect(picgo.getConfig('picBed.secondUploaderConfig')).toEqual(backup)
    expect(picgo.getConfig('settings.secondPicBedMode')).toBe('shared')
  })

  it('disables secondary upload without requiring an uploader or discarding the saved selection', async () => {
    picgo.saveConfig({
      'picBed.secondUploader': 'test-b',
      'picBed.secondUploaderConfig': backup,
      'settings.enableSecondUploader': true,
    })
    const prompt = vi.spyOn(picgo.cmd.inquirer, 'prompt').mockResolvedValueOnce({ enableSecondUploader: false })

    await run('set', 'secondUploader')

    expect(prompt).toHaveBeenCalledTimes(1)
    const saved = await fs.readJson(picgo.configPath)
    expect(saved.settings.enableSecondUploader).toBe(false)
    expect(saved.picBed.secondUploaderConfig).toEqual(backup)
  })

  it.each([
    ['missing-uploader', 'Backup account', 'No uploader named missing-uploader'],
    ['test-b', 'Missing', 'Config "Missing" not found for test-b'],
    ['test-empty', 'Default', 'No configs found for test-empty'],
  ])('does not enable secondary upload for an invalid source: %s / %s', async (uploader, name, error) => {
    vi.spyOn(picgo.cmd.inquirer, 'prompt').mockResolvedValueOnce({ enableSecondUploader: true })

    await run('set', 'secondUploader', uploader, name)

    expect(picgo.log.error).toHaveBeenCalledWith(expect.stringContaining(error))
    expect(picgo.log.success).not.toHaveBeenCalled()
    expect(picgo.getConfig('settings.enableSecondUploader')).toBeUndefined()
    expect(picgo.getConfig('picBed.secondUploader')).toBeUndefined()
    expect(picgo.getConfig('picBed.secondUploaderConfig')).toBeUndefined()
  })

  it('leaves the existing settings intact when the mode prompt is cancelled', async () => {
    const saved = await fs.readFile(picgo.configPath, 'utf8')
    vi.spyOn(picgo.cmd.inquirer, 'prompt')
      .mockResolvedValueOnce({ enableSecondUploader: true })
      .mockRejectedValueOnce(new Error('Prompt cancelled'))

    await run('set', 'secondUploader', 'test-b', 'Backup account')

    expect(await fs.readFile(picgo.configPath, 'utf8')).toBe(saved)
    expect(picgo.log.success).not.toHaveBeenCalled()
  })

  it('supports selecting a migrated legacy uploader config', async () => {
    picgo.saveConfig({ 'picBed.test-empty': { destination: 'legacy' } })
    const prompt = vi.spyOn(picgo.cmd.inquirer, 'prompt').mockImplementation(async questions => {
      switch (questions[0].name) {
        case 'enableSecondUploader':
          return { enableSecondUploader: true }
        case 'configId':
          return { configId: questions[0].default }
        default:
          return { secondPicBedMode: 'shared' }
      }
    })

    await run('set', 'secondUploader', 'test-empty')

    expect(prompt).toHaveBeenCalledTimes(3)
    const secondary = picgo.getConfig<IConfigItem>('picBed.secondUploaderConfig')
    expect(secondary._id).toBeTruthy()
    expect(secondary.destination).toBe('legacy')
    expect(secondary).toEqual(picgo.configManager.getCurrentUploaderConfig('test-empty'))
  })

  it('persists source edits and renames, then clears secondary settings when the CLI removes the source', async () => {
    const prompt = vi
      .spyOn(picgo.cmd.inquirer, 'prompt')
      .mockResolvedValueOnce({ enableSecondUploader: true })
      .mockResolvedValueOnce({ secondPicBedMode: 'shared' })
    await run('set', 'secondUploader', 'test-b', 'Backup account')

    prompt.mockResolvedValueOnce({ destination: 'updated-backup' })
    await run('set', 'uploader', 'test-b', 'Backup account')
    let saved = await fs.readJson(picgo.configPath)
    expect(saved.picBed.secondUploaderConfig.destination).toBe('updated-backup')

    await run('config-rename', 'test-b', 'Backup account', 'Renamed')
    saved = await fs.readJson(picgo.configPath)
    expect(saved.picBed.secondUploaderConfig._configName).toBe('Renamed')

    prompt.mockResolvedValueOnce({ confirm: true })
    await run('config-remove', 'test-b', 'Renamed')
    await vi.waitFor(() => expect(picgo.getConfig('settings.enableSecondUploader')).toBe(false))
    saved = await fs.readJson(picgo.configPath)
    expect(saved.picBed.secondUploader).toBe('')
    expect(saved.picBed.secondUploaderConfig).toEqual({})
    expect(saved.uploader['test-b'].configList).toEqual([defaultBackup])
  })
})
