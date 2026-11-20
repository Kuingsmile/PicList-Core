import { findPackageJSON, registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import fs from 'fs-extra'
import { readJSONSync } from 'fs-extra/esm'
import resolve from 'resolve'

import { IPicGo, IPicGoPlugin, IPicGoPluginInterface, IPluginLoader } from '../types/index'
import { IBuildInEvent } from '../utils/enum'
import { getCurrentPluginName, setCurrentPluginName } from './LifecyclePlugins'

/**
 * Local plugin loader, file system is required
 */
export class PluginLoader implements IPluginLoader {
  private readonly ctx: IPicGo
  private readonly profileManifest: string
  /** Names of enabled plugins registered with the current client. */
  private list: string[] = []
  /** Discovered plugin names, including disabled packages and packages that failed to load. */
  private readonly fullList = new Set<string>()
  /** Instantiated plugin interfaces cached by package or registration name. */
  private readonly pluginMap = new Map<string, IPicGoPluginInterface>()
  /** Initializes plugin state and ensures the user plugin package manifest exists. */
  constructor(ctx: IPicGo) {
    this.ctx = ctx
    this.profileManifest = path.resolve(ctx.baseDir, 'package.json')
    this.init()
  }

  /** Creates a package manifest in the client base directory for local npm plugin management. */
  private init(): void {
    if (!fs.existsSync(this.profileManifest)) {
      const pkg = {
        name: 'picgo-plugins',
        description: 'picgo-plugins',
        repository: 'https://github.com/Kuingsmile/PicList-Core',
        license: 'MIT',
      }
      fs.writeFileSync(this.profileManifest, JSON.stringify(pkg), 'utf8')
    }
  }

  /** Locates the package independently of whether its root export or legacy entry can be loaded. */
  private findPluginManifest(name: string): string | undefined {
    try {
      return findPackageJSON(name, this.profileManifest)
    } catch {
      return undefined
    }
  }

  private resolvePlugin(name: string): string {
    const manifest = this.findPluginManifest(name)
    const exports = manifest && fs.existsSync(manifest) ? readJSONSync(manifest).exports : undefined
    if (exports === undefined || exports === null) {
      return pathToFileURL(resolve.sync(name, { basedir: this.ctx.baseDir })).href
    }

    // Node 24 gates import.meta.resolve's parent URL argument behind a flag. Supply the
    // profile as the parent for this synchronous lookup, keeping Node's active import conditions.
    const parentURL = pathToFileURL(this.profileManifest).href
    const hook = registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === name && context.parentURL === import.meta.url) {
          return nextResolve(specifier, { ...context, parentURL })
        }
        return nextResolve(specifier, context)
      },
    })
    try {
      return import.meta.resolve(name)
    } finally {
      hook.deregister()
    }
  }

  // load all third party plugin
  /**
   * Discovers installed PicGo plugins from the user manifest and registers enabled entries.
   *
   * @returns False when the user node_modules directory does not exist.
   */
  async load(): Promise<boolean> {
    const pluginDir = path.join(this.ctx.baseDir, 'node_modules/')
    // Thanks to hexo -> https://github.com/hexojs/hexo/blob/master/lib/hexo/load_plugins.js
    if (!fs.existsSync(pluginDir)) {
      return false
    }
    const json = readJSONSync(this.profileManifest)
    const deps = Object.keys(json.dependencies || {})
    const devDeps = Object.keys(json.devDependencies || {})
    for (const name of new Set([...deps, ...devDeps])) {
      if (/^picgo-plugin-|^@[^/]+\/picgo-plugin-/.test(name) && this.findPluginManifest(name)) {
        await this.registerPlugin(name)
      }
    }
    return true
  }

  /**
   * Registers an installed package or an explicitly supplied plugin factory.
   *
   * @remarks
   * Installed packages respect persisted enablement and save their enabled state. Supplied factories
   * register without saving enablement. Failures roll back owned handlers and commands, clear loader
   * caches, and are logged and notified. Registration ownership is restored after each factory and hook.
   *
   * @param name - Package name or runtime registration name.
   * @param plugin - Optional factory to use instead of importing an installed package.
   */
  async registerPlugin(name: string, plugin?: IPicGoPlugin): Promise<void> {
    if (!name || typeof name !== 'string') {
      this.ctx.log.warn('Please provide valid plugin')
      return
    }
    if (this.list.includes(name)) return
    const wasDiscovered = this.fullList.has(name)
    this.fullList.add(name)
    try {
      if (!plugin) {
        const enabled = this.ctx.getConfig(`picgoPlugins.${name}`)
        if (enabled !== true && enabled !== undefined) return
      }

      // Resolve installed packages before setting the synchronous registration owner.
      const loadedPlugin = plugin ? undefined : await this.getPlugin(name)
      const previousPluginName = getCurrentPluginName()
      setCurrentPluginName(name)
      try {
        const pluginInterface = plugin ? plugin(this.ctx) : loadedPlugin!
        pluginInterface.register(this.ctx)
        this.pluginMap.set(name, pluginInterface)
      } finally {
        setCurrentPluginName(previousPluginName)
      }

      // Supplied factories do not persist enablement.
      if (!plugin) {
        this.ctx.saveConfig({
          [`picgoPlugins[${name}]`]: true,
        })
      }
      this.list.push(name)
    } catch (e) {
      this.unregisterPluginHandlers(name)
      this.pluginMap.delete(name)
      this.list = this.list.filter((item: string) => item !== name)
      if (!wasDiscovered && (plugin || !this.findPluginManifest(name))) this.fullList.delete(name)
      const title = `Plugin ${name} Load Error`
      this.ctx.log.error(title, e as Error)
      this.ctx.emit(IBuildInEvent.NOTIFICATION, {
        title,
        body: e,
      })
    }
  }

  /** Removes a plugin's cached interface, owned lifecycle handlers, commands, and saved enablement. */
  unregisterPlugin(name: string): void {
    this.list = this.list.filter((item: string) => item !== name)
    this.fullList.delete(name)
    this.pluginMap.delete(name)
    this.unregisterPluginHandlers(name)
    this.ctx.removeConfig('picgoPlugins', name)
  }

  /** Removes owned registrations without changing saved enablement or registration ownership. */
  private unregisterPluginHandlers(name: string): void {
    this.ctx.helper.uploader.unregister(name)
    this.ctx.helper.transformer.unregister(name)
    this.ctx.helper.beforeTransformPlugins.unregister(name)
    this.ctx.helper.beforeUploadPlugins.unregister(name)
    this.ctx.helper.afterUploadPlugins.unregister(name)
    this.ctx.cmd.unregister(name)
  }

  // get plugin by name
  /**
   * Returns a cached plugin interface or imports and instantiates its installed package.
   *
   * @throws If the plugin cannot be resolved, imported, or instantiated.
   */
  async getPlugin(name: string): Promise<IPicGoPluginInterface | undefined> {
    if (this.pluginMap.has(name)) {
      return this.pluginMap.get(name)
    }

    const mod = await import(this.resolvePlugin(name))
    const previousPluginName = getCurrentPluginName()
    setCurrentPluginName(name)
    try {
      const plugin = (mod.default || mod)(this.ctx)
      this.pluginMap.set(name, plugin)
      return plugin
    } finally {
      setCurrentPluginName(previousPluginName)
    }
  }

  /**
   * Get the list of enabled plugins
   */
  getList(): string[] {
    return this.list
  }

  hasPlugin(name: string): boolean {
    return this.fullList.has(name)
  }

  /**
   * Get the full list of plugins, whether it is enabled or not
   */
  getFullList(): string[] {
    return [...this.fullList]
  }
}
export default PluginLoader
