import { AsyncLocalStorage } from 'node:async_hooks'
import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import path from 'node:path'

import { ensureFileSync, pathExistsSync, remove } from 'fs-extra/esm'
import { cloneDeep, get, set, unset } from 'lodash-es'

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
  IUploadOptions,
  IUploadResultWithBackup,
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
  private readonly uploadConfig = new AsyncLocalStorage<IConfig>()
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
  rawInputPath: string[]
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
    this.rawInputPath = []
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
    const uploadConfig = this.uploadConfig.getStore()
    if (uploadConfig) {
      // Callers can manipulate returned values without changing the upload's snapshot.
      return cloneDeep(name ? get(uploadConfig, name) : uploadConfig) as T
    }
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
      set(this.uploadConfig.getStore() || this._config, name, cloneDeep(config[name]))
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
    const config = this.uploadConfig.getStore()
    unset(config ? get(config, key) : this.getConfig(key), propName)
  }

  get request(): IRequest['request'] {
    return this.Request.request.bind(this.Request)
  }

  private getUploadConfig(options: IUploadOptions = {}): IConfig {
    const config = cloneDeep(this.getConfig<IConfig>())
    const type = options.picBed
    if (!type) return config

    const picBed = config.picBed || {}
    const currentType = picBed.uploader || picBed.current || 'smms'
    const configName = options.configName || picBed[type]?._configName
    if (type !== currentType || picBed[type]?._configName !== configName) {
      const configList = config.uploader?.[type]?.configList
      if (picBed[type]?._configName && configList) {
        const selected = configList.find(item => item._configName === configName)
        if (!selected) throw new Error('Uploader configuration not found')
        set(config, `picBed.${type}`, cloneDeep(selected))
        if (selected._id) set(config, `uploader.${type}.defaultId`, selected._id)
      }
    }
    set(config, 'picBed.current', type)
    set(config, 'picBed.uploader', type)
    return config
  }

  async upload(input?: any[], options?: IUploadOptions): Promise<IImgInfo[] | Error> {
    return this.uploadConfig.run(this.getUploadConfig(options), () => this.uploadWithConfig(input))
  }

  private async uploadWithConfig(input?: any[]): Promise<IImgInfo[] | Error> {
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

  changeCurrentUploader(type: string, config: IStringKeyMap<any>): void {
    this.saveConfig({
      [`picBed.${type}`]: config,
      'picBed.uploader': type,
      'picBed.current': type,
    })
  }

  async uploadReturnCtx(input?: any[], options?: IUploadOptions): Promise<IUploadResultWithBackup> {
    return this.uploadConfig.run(this.getUploadConfig(options), () => this.uploadReturnCtxWithConfig(input))
  }

  private async uploadReturnCtxWithConfig(input?: any[]): Promise<IUploadResultWithBackup> {
    const ctxResult: IUploadResultWithBackup = { ctx: this, backupCtx: undefined }
    if (this.configPath === '') {
      this.log.error('No config file found, please check your config file path')
      return ctxResult
    }
    const rawInput = cloneDeep(input || [])
    let enableSecondUploader = this.getConfig<boolean>('settings.enableSecondUploader') || false
    const secondaryUploaderType = this.getConfig<string>('picBed.secondUploader') || ''
    const secondUploaderConfig = this.getConfig<IStringKeyMap<any>>('picBed.secondUploaderConfig') || {}
    const secondPicBedMode = this.getConfig<string>('settings.secondPicBedMode')
    const secondaryConfig = this.getUploadConfig()
    set(secondaryConfig, `picBed.${secondaryUploaderType}`, secondUploaderConfig)
    set(secondaryConfig, 'picBed.current', secondaryUploaderType)
    set(secondaryConfig, 'picBed.uploader', secondaryUploaderType)
    if (!secondUploaderConfig || Object.keys(secondUploaderConfig).length === 0) {
      enableSecondUploader = false
    }
    const currentUploader = this.lifecycle.getUploaderType(this)
    if (!currentUploader.config || Object.keys(currentUploader.config).length === 0) {
      this.log.error('Current uploader config is empty, please check your settings')
      return ctxResult
    }
    if (secondUploaderConfig._id === currentUploader.id) {
      this.log.info('The second uploader config is the same as the first uploader, skipping second upload.')
      enableSecondUploader = false
    }
    let initialUploadType: 'file' | 'clipboard'
    let imgPath: string = ''
    let getClipboardResult: { imgPath: string; shouldKeepAfterUploading: boolean } = {
      imgPath: '',
      shouldKeepAfterUploading: false,
    }
    let shouldKeepAfterUploading: boolean = false
    let ctxP: IPicGo

    // upload the default picbed first
    if (!(input === undefined || input.length === 0)) {
      initialUploadType = 'file'
      ctxP = await this.lifecycle.start(input, false)
      ctxResult.ctx = ctxP
    } else {
      initialUploadType = 'clipboard'
      try {
        getClipboardResult = await getClipboardImage(this)
        imgPath = getClipboardResult.imgPath
        shouldKeepAfterUploading = getClipboardResult.shouldKeepAfterUploading
        if (enableSecondUploader) {
          shouldKeepAfterUploading = true
        }
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
          ctxP = await this.lifecycle.start([imgPath], false)
          ctxResult.ctx = ctxP
        }
      } catch (e) {
        this.emit(IBuildInEvent.FAILED, e)
        throw e
      }
    }
    if (!enableSecondUploader) return ctxResult
    // upload the second picbed
    if (!secondUploaderConfig || Object.keys(secondUploaderConfig).length === 0) {
      this.log.error('Second uploader config is empty, please check your settings')
      return ctxResult
    }
    try {
      ctxResult.backupCtx = await this.uploadConfig.run(secondaryConfig, async () => {
        if (secondPicBedMode === 'seperate') {
          if (initialUploadType === 'clipboard') {
            const cleanupForSecond = (): void => {
              if (!getClipboardResult.shouldKeepAfterUploading) {
                remove(imgPath).catch(e => {
                  this.log.error(e)
                })
              }
            }
            this.once(IBuildInEvent.FAILED, cleanupForSecond)
            this.once(IBuildInEvent.FINISHED, cleanupForSecond)
          }
          return this.lifecycle.start(initialUploadType === 'file' ? rawInput : [getClipboardResult.imgPath], false)
        } else {
          return this.lifecycle.start(ctxP.processedInput, true)
        }
      })
    } catch (e: any) {
      this.log.error('Failed to upload to second uploader:', e)
    }
    return ctxResult
  }
}
