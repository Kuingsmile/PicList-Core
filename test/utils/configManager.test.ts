import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { IPicGo, IUploaderConfigList } from '../../src/types'
import { ConfigManager } from '../../src/utils/configManager'

/**
 * Creates a minimal mock of IPicGo with an in-memory config store.
 */
function createMockCtx(initialConfig: Record<string, any> = {}): IPicGo {
  const store: Record<string, any> = { ...initialConfig }

  function getByPath(obj: any, path: string): any {
    return path.split('.').reduce((acc, key) => acc?.[key], obj)
  }

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
        setByPath(store, key, value)
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
})
