import { ILifecyclePlugins, IPlugin } from '../types'

/** Registry of lifecycle handlers with ownership tracking for package-wide removal. */
export class LifecyclePlugins implements ILifecyclePlugins {
  /** Registration owner shared by lifecycle registries while a plugin registers its handlers. */
  static currentPlugin: string | null

  /**
   * The name of the plugin
   */
  private readonly name: string
  /**
   * The list of plugins
   */
  private readonly list: Map<string, IPlugin>
  /**
   * The map of plugin id
   */
  private readonly pluginIdMap: Map<string, string[]>

  constructor(name: string) {
    this.name = name
    this.list = new Map()
    this.pluginIdMap = new Map()
  }

  /**
   * Registers a unique handler and associates it with the current plugin package.
   *
   * @throws If the ID is empty, the handler is missing, or the ID is already registered.
   */
  register(id: string, plugin: IPlugin): void {
    if (!id) throw new TypeError('id is required!')
    if (typeof plugin.handle !== 'function') throw new TypeError('plugin.handle must be a function!')
    if (this.list.has(id)) throw new TypeError(`${this.name} duplicate id: ${id}!`)

    this.list.set(id, plugin)

    if (LifecyclePlugins.currentPlugin) {
      if (this.pluginIdMap.has(LifecyclePlugins.currentPlugin)) {
        this.pluginIdMap.get(LifecyclePlugins.currentPlugin)?.push(id)
      } else {
        this.pluginIdMap.set(LifecyclePlugins.currentPlugin, [id])
      }
    }
  }

  /** Removes all handler IDs owned by a plugin package; the argument is not a handler ID. */
  unregister(pluginName: string): void {
    if (this.pluginIdMap.has(pluginName)) {
      const pluginList = this.pluginIdMap.get(pluginName)
      pluginList?.forEach((plugin: string) => {
        this.list.delete(plugin)
      })
    }
  }

  getName(): string {
    return this.name
  }

  get(id: string): IPlugin | undefined {
    return this.list.get(id)
  }

  getList(): IPlugin[] {
    return [...this.list.values()]
  }

  getIdList(): string[] {
    return [...this.list.keys()]
  }
}

/** Sets the owner attributed to subsequent handler registrations; null disables attribution. */
export const setCurrentPluginName = (name: string | null = null): void => {
  LifecyclePlugins.currentPlugin = name
}

export const getCurrentPluginName = (): string | null => {
  return LifecyclePlugins.currentPlugin
}

export default LifecyclePlugins
