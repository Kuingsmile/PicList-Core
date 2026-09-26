import { cloneDeep } from 'lodash-es'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { IConfigItem, IPicGo, IUploaderConfigList } from '../../src/types'
import { ConfigManager } from '../../src/utils/configManager'

/**
 * Creates a minimal mock of IPicGo with an in-memory config store.
 */
function createMockCtx(initialConfig: Record<string, any> = {}): IPicGo {
  const store: Record<string, any> = { ...initialConfig }

  function getByPath(obj: any, path: string): any {
    return path.split('.').reduce((acc, key) => acc?.[key], obj)
  }

  /** Applies a dotted-path update to the in-memory fixture store, creating missing parent objects. */
  function setByPath(obj: any, path: string, value: any): void {
    const keys = path.split('.')
    const last = keys.pop()!
    const target = keys.reduce((acc, key) => {
      if (acc[key] === undefined) acc[key] = {}
      return acc[key]
    }, obj)
    target[last] = value
  }

  function removeByPath(obj: any, parentPath: string, key: string): void {
    const parent = parentPath ? getByPath(obj, parentPath) : obj
    if (parent) delete parent[key]
  }

  return {
    getConfig: vi.fn((key?: string) => {
      if (!key) return store
      return getByPath(store, key)
    }),
    setConfig: vi.fn((config: Record<string, any>) => {
      Object.assign(store, config)
    }),
    saveConfig: vi.fn((config: Record<string, any>) => {
      for (const [key, value] of Object.entries(config)) {
        setByPath(store, key, cloneDeep(value))
      }
    }),
    removeConfig: vi.fn((parent: string, key: string) => {
      removeByPath(store, parent, key)
    }),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as IPicGo
}

describe('ConfigManager', () => {
  let ctx: IPicGo
  let cm: ConfigManager

  beforeEach(() => {
    ctx = createMockCtx({
      picBed: {
        uploader: 'github',
        github: {
          repo: 'user/repo',
          token: 'tok_xxx',
        },
      },
    })
    cm = new ConfigManager(ctx)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // --- migrateToMultiConfig ---

  describe('migrateToMultiConfig', () => {
    it('should migrate existing single config to multi-config format', () => {
      cm.migrateToMultiConfig('github')

      const uploaderData = ctx.getConfig<IUploaderConfigList>('uploader.github')
      expect(uploaderData).toBeDefined()
      expect(uploaderData.configList).toHaveLength(1)
      expect(uploaderData.configList[0].repo).toBe('user/repo')
      expect(uploaderData.configList[0]._id).toBeDefined()
      expect(uploaderData.configList[0]._configName).toBe('Default')
      expect(uploaderData.defaultId).toBe(uploaderData.configList[0]._id)
    })

    it('should be idempotent — skip if already migrated', () => {
      cm.migrateToMultiConfig('github')
      const firstCall = (ctx.saveConfig as ReturnType<typeof vi.fn>).mock.calls.length

      cm.migrateToMultiConfig('github')
      const secondCall = (ctx.saveConfig as ReturnType<typeof vi.fn>).mock.calls.length

      // No additional saveConfig calls on second migration
      expect(secondCall).toBe(firstCall)
    })

    it('should create empty configList for uploader with no existing config', () => {
      cm.migrateToMultiConfig('imgur')

      const uploaderData = ctx.getConfig<IUploaderConfigList>('uploader.imgur')
      expect(uploaderData).toBeDefined()
      expect(uploaderData.configList).toEqual([])
      expect(uploaderData.defaultId).toBe('')
    })

    it('preserves existing identity, names, and zero timestamps during migration', () => {
      ctx.saveConfig({
        'picBed.github': { _id: 'legacy', _configName: 'Legacy', _createdAt: 0, _updatedAt: 0, repo: 'user/repo' },
      })

      const config = cm.getCurrentUploaderConfig('github')!

      expect(config).toEqual({
        _id: 'legacy',
        _configName: 'Legacy',
        _createdAt: 0,
        _updatedAt: 0,
        repo: 'user/repo',
      })
      expect(ctx.getConfig('picBed.github')).toEqual(config)
    })

    it('gives a newly migrated profile matching creation and modification times', () => {
      vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValue(101)

      const config = cm.getCurrentUploaderConfig('github')!

      expect(config._createdAt).toBe(100)
      expect(config._updatedAt).toBe(100)
    })

    it.each([
      {},
      { defaultId: '' },
      { configList: [] },
      { configList: {}, defaultId: '' },
      { configList: [null], defaultId: '' },
    ])('rejects malformed profile data without overwriting it (%j)', uploaderData => {
      ctx.saveConfig({ 'uploader.github': uploaderData })
      vi.mocked(ctx.saveConfig).mockClear()

      expect(() => cm.addUploaderConfig('github', 'New', {})).toThrow('Invalid uploader profile configuration')

      expect(ctx.saveConfig).not.toHaveBeenCalled()
      expect(ctx.getConfig('uploader.github')).toEqual(uploaderData)
      expect(ctx.getConfig('picBed.github')).toEqual({ repo: 'user/repo', token: 'tok_xxx' })
    })

    it.each(['invalid', []])('rejects malformed legacy data without overwriting it (%j)', legacy => {
      ctx.saveConfig({ 'picBed.github': legacy })
      vi.mocked(ctx.saveConfig).mockClear()

      expect(() => cm.migrateToMultiConfig('github')).toThrow('Invalid legacy uploader configuration')

      expect(ctx.saveConfig).not.toHaveBeenCalled()
      expect(ctx.getConfig('uploader.github')).toBeUndefined()
      expect(ctx.getConfig('picBed.github')).toEqual(legacy)
    })
  })

  // --- getCurrentUploaderConfig ---

  describe('getCurrentUploaderConfig', () => {
    it('should return the default config after migration', () => {
      const config = cm.getCurrentUploaderConfig('github')
      expect(config).not.toBeNull()
      expect(config!.repo).toBe('user/repo')
    })

    it('should return null when no configs exist', () => {
      const config = cm.getCurrentUploaderConfig('imgur')
      expect(config).toBeNull()
    })
  })

  // --- getAllUploaderConfigs ---

  describe('getAllUploaderConfigs', () => {
    it('should return all configs', () => {
      cm.migrateToMultiConfig('github')
      const configs = cm.getAllUploaderConfigs('github')
      expect(configs).toHaveLength(1)
    })

    it('should return empty array when none exist', () => {
      const configs = cm.getAllUploaderConfigs('imgur')
      expect(configs).toHaveLength(0)
    })
  })

  // --- addUploaderConfig ---

  describe('addUploaderConfig', () => {
    it('should add a new config and set as default if first', () => {
      const newConfig = cm.addUploaderConfig('imgur', 'My Imgur', { clientId: 'abc123' })

      expect(newConfig._id).toBeDefined()
      expect(newConfig._configName).toBe('My Imgur')
      expect(newConfig.clientId).toBe('abc123')

      const all = cm.getAllUploaderConfigs('imgur')
      expect(all).toHaveLength(1)

      const current = cm.getCurrentUploaderConfig('imgur')
      expect(current!._id).toBe(newConfig._id)
    })

    it('should not override default when adding a second config', () => {
      cm.migrateToMultiConfig('github')
      const firstDefault = cm.getCurrentUploaderConfig('github')

      cm.addUploaderConfig('github', 'Second Account', { repo: 'user2/repo2', token: 'tok2' })

      const currentDefault = cm.getCurrentUploaderConfig('github')
      expect(currentDefault!._id).toBe(firstDefault!._id)

      const all = cm.getAllUploaderConfigs('github')
      expect(all).toHaveLength(2)
    })

    it('assigns fresh metadata and matching timestamps instead of trusting supplied metadata', () => {
      cm.migrateToMultiConfig('imgur')
      vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValue(101)

      const config = cm.addUploaderConfig('imgur', 'New', {
        _id: 'supplied',
        _configName: 'Supplied',
        _createdAt: 1,
        _updatedAt: 2,
      })

      expect(config._id).not.toBe('supplied')
      expect(config._configName).toBe('New')
      expect(config._createdAt).toBe(100)
      expect(config._updatedAt).toBe(100)
    })
  })

  // --- updateUploaderConfig ---

  describe('updateUploaderConfig', () => {
    it('should update an existing config', () => {
      cm.migrateToMultiConfig('github')
      const config = cm.getCurrentUploaderConfig('github')!

      const result = cm.updateUploaderConfig('github', config._id, {
        repo: 'user/new-repo',
        token: 'new_token',
      })

      expect(result).toBe(true)

      const updated = cm.getCurrentUploaderConfig('github')!
      expect(updated.repo).toBe('user/new-repo')
      expect(updated._id).toBe(config._id) // ID preserved
      expect(updated._createdAt).toBe(config._createdAt) // createdAt preserved
    })

    it('should return false for non-existent config id', () => {
      cm.migrateToMultiConfig('github')
      const result = cm.updateUploaderConfig('github', 'non-existent-id', { repo: 'x' })
      expect(result).toBe(false)
    })
  })

  // --- deleteUploaderConfig ---

  describe('deleteUploaderConfig', () => {
    it('should not delete the only config of the current uploader', () => {
      cm.migrateToMultiConfig('github')
      const config = cm.getCurrentUploaderConfig('github')!

      const result = cm.deleteUploaderConfig('github', config._id)
      expect(result).toBe(false)
    })

    it('should not delete the default config when other configs exist', () => {
      cm.migrateToMultiConfig('github')
      const defaultConfig = cm.getCurrentUploaderConfig('github')!
      cm.addUploaderConfig('github', 'Second', { repo: 'other/repo', token: 'tok' })

      const result = cm.deleteUploaderConfig('github', defaultConfig._id)
      expect(result).toBe(false) // Can't delete default; must switch first
    })

    it('should delete a non-default config', () => {
      cm.migrateToMultiConfig('github')
      const second = cm.addUploaderConfig('github', 'Second', { repo: 'other/repo', token: 'tok' })

      const result = cm.deleteUploaderConfig('github', second._id)
      expect(result).toBe(true)

      const all = cm.getAllUploaderConfigs('github')
      expect(all).toHaveLength(1)
    })

    it('should return false for non-existent config id', () => {
      cm.migrateToMultiConfig('github')
      const result = cm.deleteUploaderConfig('github', 'does-not-exist')
      expect(result).toBe(false)
      expect(ctx.log.warn).not.toHaveBeenCalled()
    })
  })

  // --- setDefaultConfig ---

  describe('setDefaultConfig', () => {
    it('should switch the default config', () => {
      cm.migrateToMultiConfig('github')
      const second = cm.addUploaderConfig('github', 'Alt', { repo: 'user2/repo2', token: 'tok2' })

      const result = cm.setDefaultConfig('github', second._id)
      expect(result).toBe(true)

      const current = cm.getCurrentUploaderConfig('github')
      expect(current!._id).toBe(second._id)
    })

    it('should return false for non-existent config id', () => {
      cm.migrateToMultiConfig('github')
      const result = cm.setDefaultConfig('github', 'fake-id')
      expect(result).toBe(false)
    })
  })

  // --- renameConfig ---

  describe('renameConfig', () => {
    it('should rename a config', () => {
      cm.migrateToMultiConfig('github')
      const config = cm.getCurrentUploaderConfig('github')!

      const result = cm.renameConfig('github', config._id, 'Renamed')
      expect(result).toBe(true)

      const updated = cm.getCurrentUploaderConfig('github')!
      expect(updated._configName).toBe('Renamed')
    })

    it('should return false for non-existent config id', () => {
      cm.migrateToMultiConfig('github')
      const result = cm.renameConfig('github', 'fake-id', 'Renamed')
      expect(result).toBe(false)
    })
  })

  // --- getConfigByName ---

  describe('secondary uploader synchronization', () => {
    /** Points secondary-upload settings at a selected fixture profile for synchronization tests. */
    const selectSecondary = (uploader: string, config: IConfigItem, enabled = true) => {
      ctx.saveConfig({
        'picBed.secondUploader': uploader,
        'picBed.secondUploaderConfig': config,
        'settings.enableSecondUploader': enabled,
        'settings.secondPicBedMode': 'separate',
      })
    }

    it.each([true, false])('syncs replacement data for a non-default secondary config (enabled: %s)', enabled => {
      const primary = cm.getCurrentUploaderConfig('github')!
      const secondary = cm.addUploaderConfig('github', 'Backup', { repo: 'old/repo', obsolete: true })
      selectSecondary('github', secondary, enabled)

      expect(cm.updateUploaderConfig('github', secondary._id, { repo: 'new/repo' })).toBe(true)

      const updated = cm.getConfigByName('github', 'Backup')!
      expect(ctx.getConfig('picBed.secondUploaderConfig')).toEqual(updated)
      expect(ctx.getConfig('picBed.secondUploaderConfig.obsolete')).toBeUndefined()
      expect(ctx.getConfig('picBed.github')).toEqual(primary)
      expect(ctx.getConfig('settings.enableSecondUploader')).toBe(enabled)
    })

    it('syncs secondary metadata on rename without changing the primary config', () => {
      const primary = cm.getCurrentUploaderConfig('github')!
      const secondary = cm.addUploaderConfig('github', 'Backup', { repo: 'backup/repo' })
      selectSecondary('github', secondary)

      expect(cm.renameConfig('github', secondary._id, 'Renamed backup')).toBe(true)

      expect(ctx.getConfig('picBed.secondUploaderConfig')).toEqual(cm.getConfigByName('github', 'Renamed backup'))
      expect(ctx.getConfig('picBed.secondUploaderConfig._configName')).toBe('Renamed backup')
      expect(ctx.getConfig('picBed.github')).toEqual(primary)
    })

    it('syncs changes when the secondary config is also the uploader default', () => {
      const secondary = cm.addUploaderConfig('imgur', 'Backup', { clientId: 'old-id' })
      selectSecondary('imgur', secondary)

      expect(cm.updateUploaderConfig('imgur', secondary._id, { clientId: 'new-id' })).toBe(true)
      expect(ctx.getConfig('picBed.secondUploaderConfig')).toEqual(ctx.getConfig('picBed.imgur'))
      expect(ctx.getConfig('picBed.secondUploaderConfig.clientId')).toBe('new-id')
      expect(cm.renameConfig('imgur', secondary._id, 'New name')).toBe(true)
      expect(ctx.getConfig('picBed.secondUploaderConfig')).toEqual(ctx.getConfig('picBed.imgur'))
      expect(ctx.getConfig('picBed.secondUploaderConfig._configName')).toBe('New name')
    })

    it('clears the selection and disables secondary upload when a non-default source is deleted', () => {
      const primary = cm.getCurrentUploaderConfig('github')!
      const secondary = cm.addUploaderConfig('github', 'Backup', { repo: 'backup/repo' })
      selectSecondary('github', secondary)

      expect(cm.deleteUploaderConfig('github', secondary._id)).toBe(true)

      expect(ctx.getConfig('picBed.secondUploader')).toBe('')
      expect(ctx.getConfig('picBed.secondUploaderConfig')).toEqual({})
      expect(ctx.getConfig('settings.enableSecondUploader')).toBe(false)
      expect(ctx.getConfig('picBed.github')).toEqual(primary)
      expect(cm.getCurrentUploaderConfig('github')).toEqual(primary)
    })

    it('resets secondary upload when its uploader loses its last config', () => {
      const secondary = cm.addUploaderConfig('imgur', 'Backup', { clientId: 'test-id' })
      selectSecondary('imgur', secondary)

      expect(cm.deleteUploaderConfig('imgur', secondary._id)).toBe(true)

      expect(ctx.getConfig('picBed.imgur')).toBeUndefined()
      expect(ctx.getConfig('picBed.secondUploader')).toBe('')
      expect(ctx.getConfig('picBed.secondUploaderConfig')).toEqual({})
      expect(ctx.getConfig('settings.enableSecondUploader')).toBe(false)
    })

    it('keeps the secondary selection when another config changes, is renamed, or is deleted', () => {
      const secondary = cm.getCurrentUploaderConfig('github')!
      const other = cm.addUploaderConfig('github', 'Other', { repo: 'other/repo' })
      selectSecondary('github', secondary)

      cm.updateUploaderConfig('github', other._id, { repo: 'changed/repo' })
      cm.renameConfig('github', other._id, 'Changed')
      cm.deleteUploaderConfig('github', other._id)

      expect(ctx.getConfig('picBed.secondUploaderConfig')).toEqual(secondary)
      expect(ctx.getConfig('settings.enableSecondUploader')).toBe(true)
    })

    it('matches both uploader and config ID before updating or clearing the secondary selection', () => {
      const source = cm.addUploaderConfig('imgur', 'Backup', { clientId: 'test-id' })
      selectSecondary('github', source)

      cm.updateUploaderConfig('imgur', source._id, { clientId: 'changed-id' })
      cm.renameConfig('imgur', source._id, 'Changed')
      cm.deleteUploaderConfig('imgur', source._id)

      expect(ctx.getConfig('picBed.secondUploaderConfig')).toEqual(source)
      expect(ctx.getConfig('settings.enableSecondUploader')).toBe(true)
    })

    it('keeps the secondary selection when the primary default changes', () => {
      const secondary = cm.getCurrentUploaderConfig('github')!
      const other = cm.addUploaderConfig('github', 'Other', { repo: 'other/repo' })
      selectSecondary('github', secondary)

      expect(cm.setDefaultConfig('github', other._id)).toBe(true)

      expect(ctx.getConfig('picBed.github')).toEqual(other)
      expect(ctx.getConfig('picBed.secondUploaderConfig')).toEqual(secondary)
      expect(ctx.getConfig('settings.enableSecondUploader')).toBe(true)
    })

    it('does not reset secondary upload when deletion is refused or the source is missing', () => {
      const secondary = cm.getCurrentUploaderConfig('github')!
      selectSecondary('github', secondary)

      expect(cm.deleteUploaderConfig('github', secondary._id)).toBe(false)
      cm.addUploaderConfig('github', 'Other', { repo: 'other/repo' })
      expect(cm.deleteUploaderConfig('github', secondary._id)).toBe(false)
      expect(cm.updateUploaderConfig('github', 'missing', {})).toBe(false)
      expect(cm.renameConfig('github', 'missing', 'Missing')).toBe(false)
      expect(cm.deleteUploaderConfig('github', 'missing')).toBe(false)

      expect(ctx.getConfig('picBed.secondUploaderConfig')).toEqual(secondary)
      expect(ctx.getConfig('settings.enableSecondUploader')).toBe(true)
    })
  })

  describe('getConfigByName', () => {
    it('should find config by name', () => {
      cm.migrateToMultiConfig('github')
      const config = cm.getConfigByName('github', 'Default')
      expect(config).not.toBeNull()
      expect(config!._configName).toBe('Default')
    })

    it('should return null for non-existent name', () => {
      cm.migrateToMultiConfig('github')
      const config = cm.getConfigByName('github', 'Does Not Exist')
      expect(config).toBeNull()
    })
  })

  describe('configuration snapshots', () => {
    it.each(['list', 'current', 'lookup', 'migrate'] as const)('loads one fresh snapshot for %s', action => {
      cm.migrateToMultiConfig('github')
      vi.mocked(ctx.getConfig).mockClear()
      vi.mocked(ctx.saveConfig).mockClear()

      if (action === 'list') cm.getAllUploaderConfigs('github')
      if (action === 'current') cm.getCurrentUploaderConfig('github')
      if (action === 'lookup') cm.getConfigByName('github', 'Default')
      if (action === 'migrate') cm.migrateToMultiConfig('github')

      expect(ctx.getConfig).toHaveBeenCalledOnce()
      expect(ctx.saveConfig).not.toHaveBeenCalled()
    })

    it.each(['add', 'update', 'rename', 'select', 'delete'] as const)(
      'does not mutate loaded profiles during %s',
      action => {
        cm.migrateToMultiConfig('github')
        const secondary = cm.addUploaderConfig('github', 'Backup', { repo: 'backup/repo' })
        const original = ctx.getConfig<IUploaderConfigList>('uploader.github')
        const snapshot = cloneDeep(original)
        original.configList.forEach(Object.freeze)
        Object.freeze(original.configList)
        Object.freeze(original)
        vi.mocked(ctx.getConfig).mockClear()
        vi.mocked(ctx.saveConfig).mockClear()

        if (action === 'add') cm.addUploaderConfig('github', 'New', { repo: 'new/repo' })
        if (action === 'update')
          expect(cm.updateUploaderConfig('github', secondary._id, { repo: 'new/repo' })).toBe(true)
        if (action === 'rename') expect(cm.renameConfig('github', secondary._id, 'Renamed')).toBe(true)
        if (action === 'select') expect(cm.setDefaultConfig('github', secondary._id)).toBe(true)
        if (action === 'delete') expect(cm.deleteUploaderConfig('github', secondary._id)).toBe(true)

        expect(original).toEqual(snapshot)
        expect(ctx.getConfig).toHaveBeenCalledOnce()
        expect(ctx.saveConfig).toHaveBeenCalledOnce()
      },
    )
  })
})
