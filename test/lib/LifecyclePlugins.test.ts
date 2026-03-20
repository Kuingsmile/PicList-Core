import { beforeEach, describe, expect, it } from 'vitest'

import { getCurrentPluginName, LifecyclePlugins, setCurrentPluginName } from '../../src/lib/LifecyclePlugins'
import type { IPlugin } from '../../src/types'

function makePlugin(name?: string): IPlugin {
  return {
    handle: async () => {},
    ...(name ? { name } : {}),
  }
}

describe('LifecyclePlugins', () => {
  let registry: LifecyclePlugins

  beforeEach(() => {
    registry = new LifecyclePlugins('uploader')
    setCurrentPluginName(null)
  })

  // --- constructor ---

  describe('constructor', () => {
    it('should set the name', () => {
      expect(registry.getName()).toBe('uploader')
    })

    it('should start with no plugins', () => {
      expect(registry.getList()).toEqual([])
      expect(registry.getIdList()).toEqual([])
    })
  })

  // --- register ---

  describe('register', () => {
    it('should register a plugin with a valid id and handle', () => {
      const plugin = makePlugin()
      registry.register('github', plugin)
      expect(registry.get('github')).toBe(plugin)
    })

    it('should throw if id is empty', () => {
      expect(() => registry.register('', makePlugin())).toThrow('id is required')
    })

    it('should throw if handle is not a function', () => {
      expect(() => registry.register('test', { handle: 'not-a-function' } as any)).toThrow(
        'plugin.handle must be a function',
      )
    })

    it('should throw on duplicate id', () => {
      registry.register('github', makePlugin())
      expect(() => registry.register('github', makePlugin())).toThrow('duplicate id')
    })

    it('should track plugin ownership when currentPlugin is set', () => {
      setCurrentPluginName('picgo-plugin-foo')
      registry.register('custom-uploader', makePlugin())
      // verify the plugin was registered
      expect(registry.get('custom-uploader')).toBeDefined()
    })

    it('should append to existing owner id list', () => {
      setCurrentPluginName('picgo-plugin-foo')
      registry.register('uploader-a', makePlugin())
      registry.register('uploader-b', makePlugin())
      expect(registry.getIdList()).toContain('uploader-a')
      expect(registry.getIdList()).toContain('uploader-b')
    })
  })

  // --- unregister ---

  describe('unregister', () => {
    it('should remove all plugins owned by a plugin name', () => {
      setCurrentPluginName('picgo-plugin-foo')
      registry.register('uploader-a', makePlugin())
      registry.register('uploader-b', makePlugin())
      setCurrentPluginName(null)

      expect(registry.getList()).toHaveLength(2)
      registry.unregister('picgo-plugin-foo')
      expect(registry.getList()).toHaveLength(0)
    })

    it('should be a no-op if plugin name is not known', () => {
      registry.register('test', makePlugin())
      registry.unregister('non-existent-plugin')
      expect(registry.getList()).toHaveLength(1)
    })

    it('should not affect plugins owned by other plugin names', () => {
      setCurrentPluginName('plugin-a')
      registry.register('uploader-a', makePlugin())
      setCurrentPluginName('plugin-b')
      registry.register('uploader-b', makePlugin())
      setCurrentPluginName(null)

      registry.unregister('plugin-a')
      expect(registry.getList()).toHaveLength(1)
      expect(registry.get('uploader-b')).toBeDefined()
    })
  })

  // --- get ---

  describe('get', () => {
    it('should return the plugin by id', () => {
      const plugin = makePlugin('test')
      registry.register('test-id', plugin)
      expect(registry.get('test-id')).toBe(plugin)
    })

    it('should return undefined for unknown id', () => {
      expect(registry.get('nonexistent')).toBeUndefined()
    })
  })

  // --- getList / getIdList ---

  describe('getList and getIdList', () => {
    it('should return all registered plugins', () => {
      registry.register('a', makePlugin())
      registry.register('b', makePlugin())
      registry.register('c', makePlugin())

      expect(registry.getList()).toHaveLength(3)
      expect(registry.getIdList()).toEqual(['a', 'b', 'c'])
    })

    it('should return copies (spread from Map)', () => {
      registry.register('a', makePlugin())
      const list1 = registry.getList()
      const list2 = registry.getList()
      expect(list1).not.toBe(list2)
      expect(list1).toEqual(list2)
    })
  })
})

// --- setCurrentPluginName / getCurrentPluginName ---

describe('setCurrentPluginName / getCurrentPluginName', () => {
  it('should set and get', () => {
    setCurrentPluginName('test-plugin')
    expect(getCurrentPluginName()).toBe('test-plugin')
  })

  it('should default to null', () => {
    setCurrentPluginName()
    expect(getCurrentPluginName()).toBeNull()
  })

  it('should allow setting to null explicitly', () => {
    setCurrentPluginName('something')
    setCurrentPluginName(null)
    expect(getCurrentPluginName()).toBeNull()
  })
})
