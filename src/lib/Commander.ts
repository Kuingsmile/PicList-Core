import { Command } from 'commander'

import { EN } from '../i18n/en'
import type { ILocalesKey } from '../i18n/zh-CN'
import commanders from '../plugins/commander'
import { ICommander, IPicGo, IPlugin } from '../types'
import { createInquirerAdapter, IInquirerAdapter } from '../utils/inquirerShim'
import { getCurrentPluginName } from './LifecyclePlugins'

/** Builds the CLI and tracks command plugins by their owning package. */
export class Commander implements ICommander {
  private readonly name = 'commander'
  static currentPlugin: string | null
  /** Registered command handlers keyed by their unique command IDs. */
  private readonly list = new Map<string, IPlugin>()
  /** Maps plugin package names to command IDs for package-wide unregistration. */
  private readonly pluginIdMap = new Map<string, string[]>()
  private readonly ctx: IPicGo

  program: Command
  /** Replaceable prompt adapter used by CLI commands and the terminal UI. */
  inquirer: IInquirerAdapter

  /** Creates the command parser and default interactive prompt adapter for a client. */
  constructor(ctx: IPicGo) {
    this.program = new Command()
    this.inquirer = createInquirerAdapter()
    this.ctx = ctx
  }

  getName(): string {
    return this.name
  }

  /** Configures global CLI options and registers built-in commands with localized descriptions. */
  init(): void {
    // init() may also be called before PicGo.create() has initialized i18n.
    const t = this.ctx.i18n?.t ?? ((key: ILocalesKey) => EN[key])
    this.program
      .version(process.env.PICGO_VERSION, '-v, --version', t('CLI_OPTION_VERSION'))
      .helpOption('-h, --help', t('CLI_OPTION_HELP'))
      .helpCommand('help [command]', t('CLI_HELP'))
      .option('-d, --debug', t('CLI_OPTION_DEBUG'), () => {
        this.ctx.setConfig({
          debug: true,
        })
      })
      .option('-s, --silent', t('CLI_OPTION_SILENT'), () => {
        this.ctx.setConfig({
          silent: true,
        })
      })
      .showSuggestionAfterError()

    // built-in commands
    commanders(this.ctx)
  }

  /**
   * Registers a command handler and records its plugin owner.
   *
   * @throws If the ID is empty or duplicated, or the plugin has no callable handler.
   */
  register(id: string, plugin: IPlugin): void {
    if (!id) throw new TypeError('name is required!')
    if (typeof plugin.handle !== 'function') throw new TypeError('plugin.handle must be a function!')
    if (this.list.has(id)) throw new TypeError(`${this.name} plugin duplicate id: ${id}!`)
    this.list.set(id, plugin)
    const currentPluginName = getCurrentPluginName()
    if (currentPluginName !== null) {
      if (this.pluginIdMap.has(currentPluginName)) {
        this.pluginIdMap.get(currentPluginName)?.push(id)
      } else {
        this.pluginIdMap.set(currentPluginName, [id])
      }
    }
  }

  /** Removes command handlers owned by a plugin package from the registry. */
  unregister(pluginName: string): void {
    if (this.pluginIdMap.has(pluginName)) {
      const pluginList = this.pluginIdMap.get(pluginName)
      pluginList?.forEach((plugin: string) => {
        this.list.delete(plugin)
      })
    }
  }

  /** Invokes registered command handlers, logging synchronous registration errors per handler. */
  loadCommands(): void {
    this.getList().forEach((item: IPlugin) => {
      try {
        item.handle(this.ctx)
      } catch (e: any) {
        this.ctx.log.error(e)
      }
    })
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

export default Commander
