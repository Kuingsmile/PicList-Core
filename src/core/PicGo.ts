import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import path from 'node:path'

import { ensureFileSync, pathExistsSync, remove } from 'fs-extra/esm'
import { get, set, unset } from 'lodash-es'

import { I18nManager } from '../i18n'
import { Commander } from '../lib/Commander'
import { LifecyclePlugins, setCurrentPluginName } from '../lib/LifecyclePlugins'
import { Logger } from '../lib/Logger'
import { PluginHandler } from '../lib/PluginHandler'
import { PluginLoader } from '../lib/PluginLoader'
import { Request } from '../lib/Request'
import buildInTransformers from '../plugins/transformer'
import buildInUploaders from '../plugins/uploader'
import {
  IConfig,
  IHelper,
  II18nManager,
  IImgInfo,
  IPicGo,
  IPicGoPlugin,
  IPicGoPluginInterface,
  IPluginLoader,
  IRequest,
  IStringKeyMap,
} from '../types'
import { isConfigKeyInBlackList, isInputConfigValid } from '../utils/common'
import { ConfigManager } from '../utils/configManager'
import DB from '../utils/db'
import { IBuildInEvent, IBusEvent } from '../utils/enum'
import { eventBus } from '../utils/eventBus'
import getClipboardImage from '../utils/getClipboardImage'
import { Lifecycle } from './Lifecycle'

export class PicGo extends EventEmitter implements IPicGo {
  private _config!: IConfig
  private lifecycle!: Lifecycle
  private db!: DB
  private _pluginLoader!: PluginLoader
  configPath: string
  baseDir!: string
  helper!: IHelper
  log: Logger
  cmd: Commander
  output: IImgInfo[]
  input: any[]
  rawInput: any[]
  processedInput: any[]
  pluginHandler: PluginHandler
  configManager: ConfigManager
  /**
   * @deprecated will be removed in v1.5.0+
   *
   * use request instead
   */
  Request!: Request
  i18n!: II18nManager
  VERSION: string = process.env.PICGO_VERSION
  GUI_VERSION?: string

  get pluginLoader(): IPluginLoader {
    return this._pluginLoader
  }

  constructor(configPath: string = '') {
    super()
    this.configPath = configPath
    this.input = []
    this.rawInput = []
    this.processedInput = []
    this.output = []
    this.helper = {
      transformer: new LifecyclePlugins('transformer'),
      uploader: new LifecyclePlugins('uploader'),
      beforeTransformPlugins: new LifecyclePlugins('beforeTransformPlugins'),
      beforeUploadPlugins: new LifecyclePlugins('beforeUploadPlugins'),
      afterUploadPlugins: new LifecyclePlugins('afterUploadPlugins'),
    }
    this.initConfigPath()
    this.log = new Logger(this)
    this.cmd = new Commander(this)
    this.pluginHandler = new PluginHandler(this)
    this.configManager = new ConfigManager(this)
    this.initConfig()
  }

  static async create(configPath: string = ''): Promise<PicGo> {
    const ctx = new PicGo(configPath)
    await ctx.init()
    return ctx
  }

  private initConfigPath(): void {
    this.configPath = this.configPath || path.join(homedir(), '.piclist/config.json')
    if (path.extname(this.configPath).toUpperCase() !== '.JSON') {
      this.configPath = ''
      throw Error('The configuration file only supports JSON format.')
    }
    this.baseDir = path.dirname(this.configPath)
    if (!pathExistsSync(this.configPath)) {
      ensureFileSync(`${this.configPath}`)
    }
  }

  private initConfig(): void {
    this.db = new DB(this)
    this.configManager = new ConfigManager(this)
    this._config = this.db.read(true) as IConfig
  }

  private async init(): Promise<void> {
    try {
      // init 18n at first
      this.i18n = new I18nManager(this)
      this.Request = new Request(this)
      this._pluginLoader = new PluginLoader(this)
      // load self plugins
      setCurrentPluginName('picgo')
      buildInUploaders().register(this)
      buildInTransformers().register(this)
      setCurrentPluginName('')
      // load third-party plugins
      await this._pluginLoader.load()
      this.lifecycle = new Lifecycle(this)
    } catch (e: any) {
      this.emit(IBuildInEvent.UPLOAD_PROGRESS, -1)
      this.log.error(e)
      throw e
    }
  }

  /**
   * easily mannually load a plugin
   * if provide plugin name, will register plugin by name
   * or just instantiate a plugin
   */
  async use(plugin: IPicGoPlugin, name?: string): Promise<IPicGoPluginInterface> {
    if (name) {
      await this.pluginLoader.registerPlugin(name, plugin)
      return (await this.pluginLoader.getPlugin(name))!
    }
    return plugin(this)
  }

  registerCommands(): void {
    if (this.configPath !== '') {
      this.cmd.init()
      this.cmd.loadCommands()
    }
  }

  getConfig<T>(name?: string): T {
    this._config = this.db.read(true) as IConfig
    if (!name) {
      return this._config as unknown as T
    }
    return get(this._config, name)
  }

  saveConfig(config: IStringKeyMap<any>): void {
    if (!isInputConfigValid(config)) {
      this.log.warn('the format of config is invalid, please provide object')
      return
    }
    this.setConfig(config)
    this.db.saveConfig(config)
  }

  removeConfig(key: string, propName: string): void {
    if (!key || !propName) return
    if (isConfigKeyInBlackList(key)) {
      this.log.warn(`the config.${key} can't be removed`)
      return
    }
    this.unsetConfig(key, propName)
    this.db.unset(key, propName)
  }

  setConfig(config: IStringKeyMap<any>): void {
    if (!isInputConfigValid(config)) {
      this.log.warn('the format of config is invalid, please provide object')
      return
    }
    Object.keys(config).forEach((name: string) => {
      if (isConfigKeyInBlackList(name)) {
        this.log.warn(`the config.${name} can't be modified`)

        delete config[name]
      }
      set(this._config, name, config[name])
      eventBus.emit(IBusEvent.CONFIG_CHANGE, {
        configName: name,
        value: config[name],
      })
    })
  }

  unsetConfig(key: string, propName: string): void {
    if (!key || !propName) return
    if (isConfigKeyInBlackList(key)) {
      this.log.warn(`the config.${key} can't be unset`)
      return
    }
    unset(this.getConfig(key), propName)
  }

  get request(): IRequest['request'] {
    return this.Request.request.bind(this.Request)
  }

  async upload(input?: any[]): Promise<IImgInfo[] | Error> {
    if (this.configPath === '') {
      this.log.error('No config file found, please check your config file path')
      return []
    }

    if (input === undefined || input.length === 0) {
      try {
        const { imgPath, shouldKeepAfterUploading } = await getClipboardImage(this)
        const cleanup = (): void => {
          if (!shouldKeepAfterUploading) {
            remove(imgPath).catch(e => {
              this.log.error(e)
            })
          }
        }
        if (imgPath === 'no image') {
          throw new Error('image not found in clipboard')
        } else {
          this.once(IBuildInEvent.FAILED, cleanup)
          this.once(IBuildInEvent.FINISHED, cleanup)
          const { output } = await this.lifecycle.start([imgPath])
          return output
        }
      } catch (e) {
        this.emit(IBuildInEvent.FAILED, e)
        throw e
      }
    } else {
      const { output } = await this.lifecycle.start(input)
      return output
    }
  }

  async uploadReturnCtx(input?: any[], skipProcess = false): Promise<IPicGo> {
    if (this.configPath === '') {
      this.log.error('No config file found, please check your config file path')
      return this
    }

    if (input === undefined || input.length === 0) {
      try {
        const { imgPath, shouldKeepAfterUploading } = await getClipboardImage(this)
        const cleanup = (): void => {
          if (!shouldKeepAfterUploading) {
            remove(imgPath).catch(e => {
              this.log.error(e)
            })
          }
        }
        if (imgPath === 'no image') {
          throw new Error('image not found in clipboard')
        } else {
          this.once(IBuildInEvent.FAILED, cleanup)
          this.once(IBuildInEvent.FINISHED, cleanup)
          return await this.lifecycle.start([imgPath], skipProcess)
        }
      } catch (e) {
        this.emit(IBuildInEvent.FAILED, e)
        throw e
      }
    } else {
      return await this.lifecycle.start(input, skipProcess)
    }
  }
}
