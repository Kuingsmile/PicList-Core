import os from 'node:os'
import path from 'node:path'

import { JSONStore } from '@piclist/store'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../src/core/PicGo'
import type { IUploaderConfigList } from '../../src/types'

describe('ConfigManager persistence', () => {
  let baseDir: string
  let ctx: PicGo

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-config-manager-'))
    const configPath = path.join(baseDir, 'config.json')
    await fs.writeJson(configPath, {
      silent: true,
      picBed: { uploader: 'github', github: { repo: 'user/repo', obsolete: true } },
      picgoPlugins: {},
    })
    ctx = new PicGo(configPath)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.remove(baseDir)
  })

  it("migrates in one write without persisting another uploader's runtime overrides", async () => {
    const runtime: IUploaderConfigList = { configList: [], defaultId: '' }
    ctx.setConfig({ 'uploader.imgur': runtime })
    const writes = vi.spyOn(JSONStore.prototype, 'setMany')

    const migrated = ctx.configManager.getCurrentUploaderConfig('github')!

    expect(writes).toHaveBeenCalledOnce()
    const saved = await fs.readJson(ctx.configPath)
    expect(saved.uploader.github).toEqual({ configList: [migrated], defaultId: migrated._id })
    expect(saved.picBed.github).toEqual(migrated)
    expect(saved.uploader.imgur).toBeUndefined()
    expect(ctx.getConfig('uploader.imgur')).toEqual(runtime)
  })

  it.each(['update', 'rename', 'select'] as const)(
    'persists the profile, default, and secondary settings together on %s',
    async action => {
      const primary = ctx.configManager.getCurrentUploaderConfig('github')!
      const target =
        action === 'select' ? ctx.configManager.addUploaderConfig('github', 'Backup', { repo: 'backup/repo' }) : primary
      ctx.saveConfig({
        'picBed.secondUploader': 'github',
        'picBed.secondUploaderConfig': target,
        'settings.enableSecondUploader': true,
      })
      const writes = vi.spyOn(JSONStore.prototype, 'setMany')

      if (action === 'update')
        expect(ctx.configManager.updateUploaderConfig('github', target._id, { repo: 'new/repo' })).toBe(true)
      if (action === 'rename') expect(ctx.configManager.renameConfig('github', target._id, 'Renamed')).toBe(true)
      if (action === 'select') expect(ctx.configManager.setDefaultConfig('github', target._id)).toBe(true)

      expect(writes).toHaveBeenCalledOnce()
      const saved = await fs.readJson(ctx.configPath)
      const current = new PicGo(ctx.configPath).configManager.getCurrentUploaderConfig('github')!
      expect(current._id).toBe(target._id)
      expect(saved.uploader.github.defaultId).toBe(target._id)
      expect(saved.picBed.github).toEqual(current)
      expect(saved.picBed.secondUploaderConfig).toEqual(current)
      expect(saved.settings.enableSecondUploader).toBe(true)
      if (action === 'update') {
        expect(current.repo).toBe('new/repo')
        expect(current.obsolete).toBeUndefined()
      }
      if (action === 'rename') expect(current._configName).toBe('Renamed')
    },
  )

  it('removes a secondary profile and disables it in one persistence batch', async () => {
    const primary = ctx.configManager.getCurrentUploaderConfig('github')!
    const backup = ctx.configManager.addUploaderConfig('github', 'Backup', { repo: 'backup/repo' })
    ctx.saveConfig({
      'picBed.secondUploader': 'github',
      'picBed.secondUploaderConfig': backup,
      'settings.enableSecondUploader': true,
    })
    const writes = vi.spyOn(JSONStore.prototype, 'setMany')

    expect(ctx.configManager.deleteUploaderConfig('github', backup._id)).toBe(true)

    expect(writes).toHaveBeenCalledOnce()
    const saved = await fs.readJson(ctx.configPath)
    expect(saved.uploader.github.configList).toEqual([primary])
    expect(saved.picBed.github).toEqual(primary)
    expect(saved.picBed.secondUploader).toBe('')
    expect(saved.picBed.secondUploaderConfig).toEqual({})
    expect(saved.settings.enableSecondUploader).toBe(false)
  })

  it('refreshes externally edited profiles between operations', async () => {
    const primary = ctx.configManager.getCurrentUploaderConfig('github')!
    const saved = await fs.readJson(ctx.configPath)
    const external = { ...primary, repo: 'external/repo', _configName: 'External' }
    saved.uploader.github.configList = [external]
    saved.picBed.github = external
    await fs.writeJson(ctx.configPath, saved)

    expect(ctx.configManager.getCurrentUploaderConfig('github')).toEqual(external)
    expect(ctx.configManager.getConfigByName('github', 'External')).toEqual(external)
    expect(ctx.configManager.renameConfig('github', primary._id, 'Renamed')).toBe(true)

    const reopened = new PicGo(ctx.configPath)
    expect(reopened.configManager.getConfigByName('github', 'Renamed')?.repo).toBe('external/repo')
  })
})
