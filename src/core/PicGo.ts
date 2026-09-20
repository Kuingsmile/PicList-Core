import { AsyncLocalStorage } from 'node:async_hooks'
import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import path from 'node:path'

import { ensureFileSync, pathExistsSync, remove } from 'fs-extra/esm'
import { cloneDeep, get, has, set, toPath, unset } from 'lodash-es'

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

/**
 * Upload client that owns configuration, plugin registries, and lifecycle services.
 *
 * @remarks
 * Use {@link PicGo.create} to initialize asynchronous services before uploading.
 */
export class PicGo extends EventEmitter implements IPicGo {
  private _config!: IConfig
  /** Configuration paths explicitly overridden or removed in memory, reapplied after disk refreshes. */
  private readonly runtimeConfigPaths = new Map<string, string[]>()
  /** Async-local configuration snapshots that keep per-upload settings separate from saved defaults. */
  private readonly uploadConfig = new AsyncLocalStorage<IConfig>()
  private lifecycle!: Lifecycle
  private db!: DB
  private _pluginLoader!: PluginLoader
  configPath: string
  baseDir!: string
  helper!: IHelper
  log: Logger
  cmd: Commander
  /** Image records progressively populated by transformers and uploaders. */
  output: IImgInfo[]
  /** Inputs for the active lifecycle stage; preprocessing may replace paths with temporary files. */
  input: any[]
  /** Original upload inputs retained before preprocessing and transformation. */
  rawInput: any[]
  /** Source paths indexed by original input position, used to preserve names after transformation. */
  rawInputPath: string[]
  /** Transformed image records retained for a secondary upload that reuses processing results. */
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

  /**
   * Creates synchronous configuration and service state. Call {@link PicGo.create} for a ready client.
   *
   * @param configPath - JSON configuration path; an empty string uses the user's
   * `.piclist/config.json`.
   */
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

  /**
   * Creates a client and initializes localization, HTTP requests, plugins, and the upload lifecycle.
   *
   * @param configPath - JSON configuration path; an empty string selects the default user
   * configuration.
   * @returns A fully initialized upload client.
   * @throws If configuration setup or asynchronous initialization fails.
   */
  static async create(configPath: string = ''): Promise<PicGo> {
    const ctx = new PicGo(configPath)
    await ctx.init()
    return ctx
  }

  /** Resolves and creates the configuration file and base directory; rejects non-JSON paths. */
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

  /** Loads a cloned disk configuration and initializes the configuration manager. */
  private initConfig(): void {
    this.db = new DB(this)
    this.configManager = new ConfigManager(this)
    this._config = cloneDeep(this.db.read(true)) as IConfig
  }

  /** Initializes localization and requests, registers built-ins, then loads third-party plugins. */
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
   * Instantiates a plugin factory and optionally registers its handlers under a name.
   *
   * @param plugin - Factory receiving this client and returning its plugin interface.
   * @param name - Registration name; omitted to instantiate without invoking register.
   * @returns The instantiated plugin interface, or the loader result after named registration.
   */
  async use(plugin: IPicGoPlugin, name?: string): Promise<IPicGoPluginInterface> {
    if (name) {
      await this.pluginLoader.registerPlugin(name, plugin)
      return (await this.pluginLoader.getPlugin(name))!
    }
    return plugin(this)
  }

  /** Initializes built-in CLI commands and runs command registrations supplied by plugins. */
  registerCommands(): void {
    if (this.configPath !== '') {
      this.cmd.init()
      this.cmd.loadCommands()
    }
  }

  /**
   * Reads configuration from the current upload snapshot or refreshes saved settings with runtime
   * overrides.
   *
   * @param name - Optional lodash-style path; omitted to return the complete configuration.
   * @returns The selected value. Values read inside an upload are cloned to protect its snapshot.
   */
  getConfig<T>(name?: string): T {
    const uploadConfig = this.uploadConfig.getStore()
    if (uploadConfig) {
      // Callers can manipulate returned values without changing the upload's snapshot.
      return cloneDeep(name ? get(uploadConfig, name) : uploadConfig) as T
    }
    // Refresh saved settings while retaining explicitly set or unset runtime paths.
    const config = cloneDeep(this.db.read(true)) as IConfig
    for (const configPath of this.runtimeConfigPaths.values()) {
      if (has(this._config, configPath)) {
        set(config, configPath, cloneDeep(get(this._config, configPath)))
      } else {
        unset(config, configPath)
      }
    }
    this._config = config
    if (!name) {
      return this._config as unknown as T
    }
    return get(this._config, name)
  }

  /**
   * Applies configuration paths in memory and on disk, clearing matching runtime overrides.
   *
   * @param config - Mapping of lodash-style paths to values. Protected keys are removed from the
   * supplied object before saving.
   */
  saveConfig(config: IStringKeyMap<any>): void {
    if (!isInputConfigValid(config)) {
      this.log.warn('the format of config is invalid, please provide object')
      return
    }
    this.setConfig(config)
    this.db.saveConfig(config)
    Object.keys(config).forEach(name => {
      // Explicit saves also update defaults when called from an upload snapshot.
      set(this._config, name, cloneDeep(config[name]))
      this.clearRuntimeConfigPaths(toPath(name))
    })
  }

  /**
   * Removes a nested setting from memory and disk unless its configuration root is protected.
   *
   * @param key - Configuration root or path containing the setting.
   * @param propName - Nested property path to remove.
   */
  removeConfig(key: string, propName: string): void {
    if (!key || !propName) return
    if (isConfigKeyInBlackList(key)) {
      this.log.warn(`the config.${key} can't be removed`)
      return
    }
    this.unsetConfig(key, propName)
    this.db.unset(key, propName)
    unset(get(this._config, key), propName)
    this.clearRuntimeConfigPaths([...toPath(key), ...toPath(propName)])
  }

  /**
   * Applies temporary configuration changes and emits a change event for each accepted path.
   *
   * @remarks
   * During an upload, only its async-local snapshot is changed. Otherwise, overrides survive disk
   * refreshes.
   * Protected keys are deleted from the supplied object.
   *
   * @param config - Mapping of lodash-style paths to values; changes are not saved to disk.
   */
  setConfig(config: IStringKeyMap<any>): void {
    if (!isInputConfigValid(config)) {
      this.log.warn('the format of config is invalid, please provide object')
      return
    }
    Object.keys(config).forEach((name: string) => {
      if (isConfigKeyInBlackList(name)) {
        this.log.warn(`the config.${name} can't be modified`)

        delete config[name]
        return
      }
      const uploadConfig = this.uploadConfig.getStore()
      set(uploadConfig || this._config, name, cloneDeep(config[name]))
      if (!uploadConfig) this.trackRuntimeConfigPath(toPath(name))
      eventBus.emit(IBusEvent.CONFIG_CHANGE, {
        configName: name,
        value: config[name],
      })
    })
  }

  /**
   * Removes a nested setting from the upload snapshot or runtime configuration without saving it.
   *
   * @param key - Configuration root or path containing the setting.
   * @param propName - Nested property path to remove.
   */
  unsetConfig(key: string, propName: string): void {
    if (!key || !propName) return
    if (isConfigKeyInBlackList(key)) {
      this.log.warn(`the config.${key} can't be unset`)
      return
    }
    const config = this.uploadConfig.getStore()
    unset(config ? get(config, key) : this.getConfig(key), propName)
    if (!config) this.trackRuntimeConfigPath([...toPath(key), ...toPath(propName)])
  }

  /** Records an explicit runtime override, replacing tracked descendant paths. */
  private trackRuntimeConfigPath(configPath: string[]): void {
    this.clearRuntimeConfigPaths(configPath)
    this.runtimeConfigPaths.set(JSON.stringify(configPath), configPath)
  }

  /** Forgets runtime overrides at or below the supplied path while retaining unrelated paths. */
  private clearRuntimeConfigPaths(configPath: string[]): void {
    for (const [key, runtimePath] of this.runtimeConfigPaths) {
      if (configPath.every((part, index) => part === runtimePath[index])) {
        this.runtimeConfigPaths.delete(key)
      }
    }
  }

  /** Bound HTTP request API supporting both Axios options and legacy request-style options. */
  get request(): IRequest['request'] {
    return this.Request.request.bind(this.Request)
  }

  /**
   * Clones effective settings and applies an optional uploader and named profile for one upload.
   *
   * @throws If a requested profile cannot be found in an applicable saved configuration list.
   */
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

  /**
   * Uploads supplied inputs, or a clipboard image when inputs are omitted or empty.
   *
   * @param input - Inputs accepted by the selected transformer, normally file paths or URLs.
   * @param options - Uploader selection applied only to this upload.
   * @returns The primary upload's output records. Lifecycle failures may leave incomplete output.
   * @throws If clipboard acquisition fails, profile resolution fails, or a lifecycle error occurs in
   * debug mode.
   */
  async upload(input?: any[], options?: IUploadOptions): Promise<IImgInfo[] | Error> {
    return this.uploadConfig.run(this.getUploadConfig(options), () => this.uploadWithConfig(input))
  }

  /** Runs the primary upload under the active configuration snapshot and schedules clipboard cleanup. */
  private async uploadWithConfig(input?: any[]): Promise<IImgInfo[] | Error> {
    if (this.configPath === '') {
      this.log.error('No config file found, please check your config file path')
      return []
    }

    if (input === undefined || input.length === 0) {
      try {
        const { imgPath, shouldKeepAfterUploading } = await getClipboardImage(this)
        /**
         * Deletes a generated clipboard image after completion or failure while retaining existing
         * files.
         */
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

  /** Persists the uploader configuration and updates both current and legacy uploader selectors. */
  changeCurrentUploader(type: string, config: IStringKeyMap<any>): void {
    this.saveConfig({
      [`picBed.${type}`]: config,
      'picBed.uploader': type,
      'picBed.current': type,
    })
  }

  /**
   * Uploads with optional secondary delivery and returns both lifecycle contexts.
   *
   * @remarks
   * Processed temporary files remain available until both uploads and their hooks finish. Secondary
   * upload errors are logged without discarding the primary result.
   *
   * @param input - Transformer inputs; omitted or empty to acquire an image from the clipboard.
   * @param options - Uploader selection for this call without changing saved defaults.
   */
  async uploadReturnCtx(input?: any[], options?: IUploadOptions): Promise<IUploadResultWithBackup> {
    return this.uploadConfig.run(this.getUploadConfig(options), () =>
      this.lifecycle.withTempFileCleanup(tempDirs => this.uploadReturnCtxWithConfig(input, tempDirs)),
    )
  }

  /**
   * Runs primary and optional secondary uploads, either reprocessing original inputs or reusing
   * transformed records.
   */
  private async uploadReturnCtxWithConfig(
    input: any[] | undefined,
    tempDirs: string[],
  ): Promise<IUploadResultWithBackup> {
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
    /** Snapshot selecting the secondary uploader without changing the primary upload's configuration. */
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
      ctxP = await this.lifecycle.start(input, false, tempDirs)
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
        /**
         * Deletes a generated clipboard image after completion or failure while retaining existing
         * files.
         */
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
          ctxP = await this.lifecycle.start([imgPath], false, tempDirs)
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
            /** Releases a generated clipboard file after the secondary upload has finished using it. */
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
          return this.lifecycle.start(
            initialUploadType === 'file' ? rawInput : [getClipboardResult.imgPath],
            false,
            tempDirs,
          )
        } else {
          return this.lifecycle.start(ctxP.processedInput, true, tempDirs)
        }
      })
    } catch (e: any) {
      this.log.error('Failed to upload to second uploader:', e)
    }
    return ctxResult
  }
}
