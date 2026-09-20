import type { TypedTranslate } from '@piclist/i18n'
import { Command } from 'commander'
import { FormatEnum, GravityEnum } from 'sharp'

import type { ILocalesKey, ZH_CN } from '../i18n/zh-CN'
import type { ConfigManager } from '../utils/configManager'
import type { IInquirerAdapter } from '../utils/inquirerShim'
import { IRequestPromiseOptions } from './oldRequest'

/**
 * Client and per-upload context exposed to plugins, including configuration, lifecycle data, and
 * shared services.
 */
export interface IPicGo extends NodeJS.EventEmitter {
  configPath: string
  baseDir: string
  log: ILogger
  cmd: ICommander
  /** Image records progressively populated by transformers and uploaders. */
  output: IImgInfo[]
  /** Inputs for the current stage, potentially replaced with processed temporary paths. */
  input: any[]
  /** Original inputs captured before lifecycle processing. */
  rawInput: any[]
  /** Transformed records retained for secondary uploads that share preprocessing. */
  processedInput: any[]
  pluginLoader: IPluginLoader
  pluginHandler: IPluginHandler
  configManager: ConfigManager
  /**
   * @deprecated will be removed in v1.5.0+
   */
  Request: IRequest
  helper: IHelper
  VERSION: string
  GUI_VERSION?: string
  /** Bound HTTP adapter supporting Axios and legacy request-style options. */
  request: IRequest['request']
  /** Source paths indexed by original input position for later filename resolution. */
  rawInputPath: string[]
  i18n: II18nManager

  /**
   * Reads effective configuration, using the active upload snapshot or saved values plus runtime
   * overrides.
   */
  getConfig: <T>(name?: string) => T
  /** Persists path/value settings and updates effective configuration. */
  saveConfig: (config: IStringKeyMap<any>) => void
  /** Removes a nested setting from memory and disk unless the root is protected. */
  removeConfig: (key: string, propName: string) => void
  /**
   * Applies runtime or upload-local settings without persisting them and emits configuration-change
   * events.
   */
  setConfig: (config: IStringKeyMap<any>) => void
  /**
   * Removes a nested setting from runtime or upload-local configuration without persisting the change.
   */
  unsetConfig: (key: string, propName: string) => void
  /** Uploads transformer inputs or a clipboard image when omitted, returning primary output records. */
  upload: (input?: any[], options?: IUploadOptions) => Promise<IImgInfo[] | Error>
  /**
   * Uploads with optional secondary delivery and returns contexts retaining their upload
   * configuration.
   */
  uploadReturnCtx: (input?: any[], options?: IUploadOptions) => Promise<IUploadResultWithBackup>
  /** Persists an uploader configuration and updates both modern and legacy default selectors. */
  changeCurrentUploader: (type: string, config: IStringKeyMap<any>) => void
}

// plugin config
/** Configuration field schema consumed by CLI prompts, the terminal UI, and plugin hosts. */
export interface IPluginConfig {
  name: string
  type: string
  required: boolean
  default?: any
  alias?: string
  message?: string
  /** Prompt prefix that may be implemented as a getter to follow language changes. */
  prefix?: string // for cli options
  [propName: string]: any
}

// for lifecycle plugins

/** Named registry of lifecycle handlers with removal grouped by owning plugin package. */
export interface ILifecyclePlugins {
  /** Adds a unique handler and attributes it to the current registration owner. */
  register: (id: string, plugin: IPlugin) => void
  /** Removes handlers belonging to a plugin package rather than a single handler ID. */
  unregister: (id: string) => void
  getName: () => string
  get: (id: string) => IPlugin | undefined
  getList: () => IPlugin[]
  getIdList: () => string[]
}

/** Lifecycle registries shared by the client and its derived upload contexts. */
export interface IHelper {
  transformer: ILifecyclePlugins
  uploader: ILifecyclePlugins
  beforeTransformPlugins: ILifecyclePlugins
  beforeUploadPlugins: ILifecyclePlugins
  afterUploadPlugins: ILifecyclePlugins
}

/** Command registry paired with the CLI parser and a replaceable prompt adapter. */
export interface ICommander extends ILifecyclePlugins {
  program: Command
  inquirer: IInquirerAdapter
}

/** Loads and caches installed or explicitly supplied plugin interfaces. */
export interface IPluginLoader {
  /**
   * Registers an installed plugin or supplied factory and reports loading failures through client
   * events.
   */
  registerPlugin: (name: string, plugin?: IPicGoPlugin) => Promise<void>
  /** Removes a plugin's handlers, cached interface, and persisted enablement. */
  unregisterPlugin: (name: string) => void
  /** Returns a cached interface or imports and instantiates the installed plugin. */
  getPlugin: (name: string) => Promise<IPicGoPluginInterface | undefined>
  /** Returns names of enabled, registered plugins. */
  getList: () => string[]
  /** Returns discovered plugin names, including disabled plugins. */
  getFullList: () => string[]
  /** Checks discovery membership, including disabled plugins. */
  hasPlugin: (name: string) => boolean
}

export interface IRequestOld {
  request: import('axios').AxiosInstance
}

/** Legacy request-style options accepted by the Axios compatibility adapter. */
export type IOldReqOptions = Omit<
  IRequestPromiseOptions & {
    url: string
  },
  'auth'
>

/** Legacy options selecting response metadata together with body and statusCode aliases. */
export type IOldReqOptionsWithFullResponse = IOldReqOptions & {
  resolveWithFullResponse: true
}

/** Legacy options selecting the decoded response body. */
export type IOldReqOptionsWithJSON = IOldReqOptions & {
  json: true
}

/**
 * Axios options selecting the full response, including data, headers, and compatibility aliases.
 */
export type IReqOptions<T = any> = AxiosRequestConfig<T> & {
  resolveWithFullResponse: true
}

/**
 * Full-response options requesting binary data in the response body.
 */
export type IReqOptionsWithArrayBufferRes<T = any> = IReqOptions<T> & {
  responseType: 'arraybuffer'
}

/**
 * Axios options returning only response data without status or header metadata.
 */
export type IReqOptionsWithBodyResOnly<T = any> = AxiosRequestConfig<T>

/** Axios response extended with the legacy body and statusCode aliases. */
export type IFullResponse<T = any, U = any> = AxiosResponse<T, U> & {
  statusCode: number
  body: T
}

type AxiosResponse<T = any, U = any> = import('axios').AxiosResponse<T, U>

type AxiosRequestConfig<T = any> = import('axios').AxiosRequestConfig<T>

interface IRequestOptionsWithFullResponse {
  resolveWithFullResponse: true
}

interface IRequestOptionsWithJSON {
  json: true
}

interface IRequestOptionsWithResponseTypeArrayBuffer {
  responseType: 'arraybuffer'
}

/**
 * Selects the response shape from full-response, JSON, binary, and legacy request options.
 *
 * @typeParam T - Expected decoded response data.
 * @typeParam U - Request options used to choose the returned shape.
 */
export type IResponse<T, U> = U extends IRequestOptionsWithFullResponse
  ? IFullResponse<T, U>
  : U extends IRequestOptionsWithJSON
    ? T
    : U extends IRequestOptionsWithResponseTypeArrayBuffer
      ? Buffer
      : U extends IOldReqOptionsWithFullResponse
        ? IFullResponse<T, U>
        : U extends IOldReqOptionsWithJSON
          ? T
          : U extends IOldReqOptions
            ? string
            : U extends IReqOptionsWithBodyResOnly
              ? T
              : string

/**
 * the old request lib will be removed in v1.5.0+
 * the request options have the following properties
 */
export interface IRequestLibOnlyOptions {
  proxy?: string
  body?: any
  formData?: Record<string, any> | undefined
  form?: Record<string, any> | string | undefined
}

/** Selects legacy or Axios option types based on the request-only fields present in the input. */
export type IRequestConfig<T> = T extends IRequestLibOnlyOptions ? IOldReqOptions : AxiosRequestConfig

/** Generic HTTP adapter whose response type follows the supplied request options. */
export interface IRequest {
  /** Executes a request and returns body data or response metadata according to its option flags. */
  request: <
    T,
    U extends (IRequestConfig<U> extends IOldReqOptions
      ? IOldReqOptions
      : IRequestConfig<U> extends AxiosRequestConfig
        ? AxiosRequestConfig
        : never),
  >(
    config: U,
  ) => Promise<IResponse<T, U>>
}

export type ILogColor = 'blue' | 'green' | 'yellow' | 'red'

/** Extensible image record passed through transformation, upload, and completion hooks. */
export interface IImgInfo {
  /** Encoded image bytes; released by uploaders or lifecycle completion after use. */
  buffer?: Buffer
  /** Alternative base64-encoded payload used by uploaders that accept base64 input. */
  base64Image?: string
  fileName?: string
  width?: number
  height?: number
  /** Image extension, normally including its leading dot. */
  extname?: string
  imgUrl?: string
  filePath?: string
  /** Index of the source input, retained when failed inputs are removed from the output. */
  inputIndex?: number
  [propName: string]: any
}

/** File or URL load result with an explicit success flag and optional failure reason in extra fields. */
export interface IPathTransformedImgInfo extends IImgInfo {
  success: boolean
}

export type IStringKeyMap<T> = Record<string, T extends T ? T : any>

export type ICLIConfigs = Record<string, IStringKeyMap<any>>

/**
 * Telegraph 图床配置项
 * @deprecated since v1.9.6
 */
export interface ITelegraphConfig {
  proxy?: string
}

/** SM.MS 图床配置项 */
export interface ISmmsConfig {
  token: string
  backupDomain?: string
}

/** 内置高级自定义图床 */
export interface IAdvancedPlistConfig {
  endpoint?: string
  method?: string
  formDataKey?: string
  headers?: string
  body?: string
  resDataPath?: string
  customPrefix?: string
  webPath?: string
  uploadScriptName?: string
}

/** 内置alist 图床配置项 */
export interface IAlistConfig {
  url: string
  token?: string
  username?: string
  password?: string
  uploadPath?: string
  webPath?: string
  customUrl?: string
}

/** 本地图床配置项 */
export interface ILocalConfig {
  path: string
  customUrl?: string
  webPath?: string
}

/** 七牛云图床配置项 */
export interface IQiniuConfig {
  accessKey: string
  secretKey: string
  /** 存储空间名 */
  bucket: string
  /** 自定义域名 */
  url: string
  /** 存储区域编号 */
  area: 'z0' | 'z1' | 'z2' | 'na0' | 'as0' | string
  /** 网址后缀，比如使用 `?imageslim` 可进行[图片瘦身](https://developer.qiniu.com/dora/api/1271/image-thin-body-imageslim) */
  options: string
  /** 自定义存储路径，比如 `img/` */
  path: string
}

/** 又拍云图床配置项 */
export interface IUpyunConfig {
  /** 存储空间名，及你的服务名 */
  bucket: string
  /** 操作员 */
  operator: string
  /** 密码 */
  password: string
  /** 针对图片的一些后缀处理参数 */
  options: string
  /** 自定义存储路径，比如 `img/` */
  path: string
  /** 加速域名，注意要加 `http://` 或者 `https://` */
  url: string
  /** 防盗链密钥 */
  antiLeechToken: string
  /** 防盗链过期时间，单位为秒 */
  expireTime: number
  /** 自定义API接入点 */
  endpoint: string
}

/** 腾讯云图床配置项 */
export interface ITcyunConfig {
  secretId: string
  secretKey: string
  /** 存储桶名，v4 和 v5 版本不一样 */
  bucket: string
  appId: string
  /** 存储区域，例如 ap-beijing-1 */
  area: string
  /** 自定义存储路径，比如 img/ */
  /** endpoint: string */
  endpoint: string
  path: string
  /** 自定义域名，注意要加 `http://` 或者 `https://` */
  webPath: string
  customUrl: string
  /** COS 版本，v4 或者 v5 */
  version: 'v5' | 'v4'
  /** 针对图片的一些后缀处理参数 PicGo 2.4.0+ PicGo-Core 1.5.0+ */
  options: string
  /** 是否支持极智压缩 */
  slim: boolean
}

/** GitHub 图床配置项 */
export interface IGithubConfig {
  /** 仓库名，格式是 `username/reponame` */
  repo: string
  /** github token */
  token: string
  /** 自定义存储路径，比如 `img/` */
  path: string
  /** 网站路径，用于拼接网址路径 */
  webPath?: string
  /** 自定义域名，注意要加 `http://` 或者 `https://` */
  customUrl: string
  /** 分支名，默认是 `main` */
  branch: string
}

/** 阿里云图床配置项 */
export interface IAliyunConfig {
  accessKeyId: string
  accessKeySecret: string
  /** 存储空间名 */
  bucket: string
  /** 存储区域代号 */
  area: string
  /** 自定义存储路径 */
  path: string
  /** 网站路径，用于拼接网址路径 */
  webPath: string
  /** 自定义域名，注意要加 `http://` 或者 `https://` */
  customUrl: string
  /** 针对图片的一些后缀处理参数 PicGo 2.2.0+ PicGo-Core 1.4.0+ */
  options: string
}

/** Imgur 图床配置项 */
export interface IImgurConfig {
  /** imgur 的 `clientId` */
  clientId: string
  /** 代理地址，仅支持 http 代理 */
  proxy: string
  /** imgur 用户名 */
  username: string
  /** imgur access token */
  accessToken: string
  /** imgur album name */
  album: string
}

/** Webdav 图床配置项 */
export interface IWebdavPlistConfig {
  /** webdav 的 `host` */
  host: string
  /** webdav 的 `sslEnabled` */
  sslEnabled: boolean
  /** webdav 的 `username` */
  username: string
  /** webdav 的 `password` */
  password: string
  /** webdav 的 `path` */
  path: string
  /** webdav 的 `webpath` */
  webpath: string
  /** webdav 的 `customUrl` */
  customUrl: string
  /** webdav 的 `authType` */
  authType: string
  /** webdav 的 `options` */
  options: string
}

/** 内置sftp 图床配置项 */
export interface ISftpPlistConfig {
  host: string
  port?: number
  username: string
  password?: string
  privateKey?: string
  passphrase?: string
  uploadPath?: string
  customUrl?: string
  webPath?: string
  fileUser?: string
  fileMode?: string
  dirMode?: string
}

/** PicList 图床配置项 */
export interface IPicListConfig {
  host: string
  port?: number
  picbed?: string
  configName?: string
  serverKey?: string
}

/** 内置lsky 图床配置项 */
export interface ILskyConfig {
  version: string
  host: string
  token: string
  strategyId: string
  albumId: string
  permission: IStringKeyMap<string>
}

/** 内置aws s3 图床配置项 */
export interface IAwsS3PListUserConfig {
  accessKeyID: string
  secretAccessKey: string
  bucketName: string
  uploadPath: string
  region?: string
  endpoint?: string
  proxy?: string
  urlPrefix?: string
  pathStyleAccess?: boolean
  rejectUnauthorized?: boolean
  acl?: string
  disableBucketPrefixToURL?: boolean | string
  options?: string
}

/** Base config item with metadata */
export interface IConfigItem {
  _id: string
  _configName: string
  _createdAt: number
  _updatedAt: number
  [key: string]: any
}

/** Multi-config structure for uploaders */
export interface IUploaderConfigList {
  configList: IConfigItem[]
  defaultId: string
}

/** PicGo 配置文件类型定义 */
export interface IConfig {
  picBed: {
    uploader: string
    current?: string
    smms?: ISmmsConfig
    qiniu?: IQiniuConfig
    upyun?: IUpyunConfig
    tcyun?: ITcyunConfig
    github?: IGithubConfig
    aliyun?: IAliyunConfig
    imgur?: IImgurConfig
    webdavplist?: IWebdavPlistConfig
    local?: ILocalConfig
    transformer?: string
    secondUploader?: string
    secondUploaderConfig?: Partial<IConfigItem>
    /** for uploader */
    proxy?: string
    [others: string]: any
  }
  /** Multi-config structure for uploaders (new format) */
  uploader?: Record<string, IUploaderConfigList>
  picgoPlugins: Record<string, boolean>
  debug?: boolean
  silent?: boolean
  settings?: {
    enableSecondUploader?: boolean
    secondPicBedMode?: 'shared' | 'seperate'
    logLevel?: string[]
    logPath?: string
    /** for npm */
    registry?: string
    /** for npm */
    proxy?: string
    [others: string]: any
  }
  [configOptions: string]: any
}

/**
 * for an uploader/transformer/beforeTransformHandler/beforeUploadHandler/afterUploadHandler
 */
export interface IPlugin {
  /** Runs a lifecycle stage against its context; asynchronous handlers are awaited by the lifecycle. */
  handle: ((ctx: IPicGo) => Promise<any>) | ((ctx: IPicGo) => void)
  name?: string
  /** Returns the configuration form for this handler using the supplied client context. */
  config?: (ctx: IPicGo) => IPluginConfig[]
  [propName: string]: any
}

export type IPluginNameType = 'simple' | 'scope' | 'normal' | 'unknown'

/** Normalized plugin installation input and unversioned package identity with a validity flag. */
export interface IPluginProcessResult {
  success: boolean
  pkgName: string
  fullName: string
}

/** npm-backed package management and plugin registration operations. */
export interface IPluginHandler {
  getList: () => Promise<string[]>
  /** Installs supplied names or paths and registers successful packages on the client. */
  install: (
    plugins: string[],
    options: IPluginHandlerOptions,
    env?: IProcessEnv,
  ) => Promise<IPluginHandlerResult<boolean>>
  /** Updates resolved plugin packages and reports the operation outcome. */
  update: (
    plugins: string[],
    options: IPluginHandlerOptions,
    env?: IProcessEnv,
  ) => Promise<IPluginHandlerResult<boolean>>
  /** Uninstalls resolved packages and removes their registered handlers on success. */
  uninstall: (plugins: string[], options?: IPluginHandlerOptions) => Promise<IPluginHandlerResult<boolean>>
}

/** Plugin operation outcome with package names on success or a message on failure. */
export interface IPluginHandlerResult<T> {
  success: T
  body: T extends true ? string[] : string
}

/** Per-operation npm output, proxy, and registry overrides. */
export interface IPluginHandlerOptions {
  /** Suppress npm output when embedding plugin management in a terminal UI. */
  silent?: boolean
  proxy?: string
  registry?: string
}

/**
 * for picgo npm plugins
 */
export type IPicGoPlugin = (ctx: IPicGo) => IPicGoPluginInterface

/**
 * interfaces for PicGo plugin
 */
export interface IPicGoPluginInterface {
  /**
   * since PicGo-Core v1.5, register will inject ctx
   */
  register: (ctx: IPicGo) => void
  /**
   * this plugin's config
   */
  config?: (ctx: IPicGo) => IPluginConfig[]
  /**
   * register uploader name
   */
  uploader?: string
  /**
   * register transformer name
   */
  transformer?: string
  /**
   * for picgo gui plugins
   */
  guiMenu?: (ctx: IPicGo) => IGuiMenuItem[]

  /**
   * for picgo gui plugins
   * short key -> command
   */
  commands?: (ctx: IPicGo) => ICommandItem[]

  [propName: string]: any
}

/** Plugin-provided GUI menu action invoked with both core and host GUI APIs. */
export interface IGuiMenuItem {
  label: string
  handle: (ctx: IPicGo, guiApi: any) => Promise<void>
}

/** Plugin-provided GUI command with a display label, command name, and shortcut key. */
export interface ICommandItem {
  label: string
  name: string
  key: string
  handle: (ctx: IPicGo, guiApi: any) => Promise<void>
}

/**
 * for spawn output
 */
export interface IResult {
  code: number
  data: string
}

/**
 * for transformer - path
 */
export interface IImgSize {
  width: number
  height: number
  real?: boolean
  extname?: string
}

/**
 * for clipboard image
 */
export interface IClipboardImage {
  imgPath: string
  /**
   * if the path is generate by picgo -> false
   * if the path is a real file path in system -> true
   */
  shouldKeepAfterUploading: boolean
}

/**
 * for install command environment variable
 */
export type IProcessEnv = Record<string, Undefinable<string>>

export type ILogArgvType = string | number

export type ILogArgvTypeWithError = ILogArgvType | Error

export type Nullable<T> = T | null
export type Undefinable<T> = T | undefined

/** Client logging API controlled by runtime silence, level, and development settings. */
export interface ILogger {
  success: (...msg: ILogArgvType[]) => void
  info: (...msg: ILogArgvType[]) => void
  error: (...msg: ILogArgvTypeWithError[]) => void
  warn: (...msg: ILogArgvType[]) => void
  /** Writes debug messages only in development mode. */
  debug: (...msg: ILogArgvType[]) => void
}

/** Configuration path and new value emitted on the internal configuration-change bus. */
export interface IConfigChangePayload<T> {
  configName: string
  value: T
}

export type ILocale = Record<string, any>

declare const typedTranslate: TypedTranslate<typeof ZH_CN>

/** The v3 call signature, with a guaranteed string from our key fallback. */
export type I18nTranslate = <Key extends ILocalesKey>(...args: Parameters<typeof typedTranslate<Key>>) => string

/** Typed built-in and dynamic plugin translation APIs with runtime locale management. */
export interface II18nManager {
  /**
   * translate a built-in message with checked keys and placeholder arguments
   */
  readonly t: I18nTranslate
  /**
   * translate dynamic keys, including locales registered by plugins
   */
  translate: <T extends string>(key: T, args?: IStringKeyMap<string>) => string
  /**
   * add locale to current i18n language
   * default locale list
   * - zh-CN
   * - en
   */
  addLocale: (language: string, locales: ILocale) => boolean
  /**
   * set current language
   */
  setLanguage: (language: string) => void
  /**
   * dynamic add new language & locales
   */
  addLanguage: (language: string, locales: ILocale) => boolean
  /**
   * get language list
   */
  getLanguageList: () => string[]
}

export type availableConvertFormat = keyof FormatEnum

export type availableWatermarkPosition = keyof GravityEnum

/**
 * Global watermark settings with optional maps keyed by uploader type. Profile overrides take
 * precedence.
 */
export interface IBuildInWaterMarkOptions {
  isAddWatermark?: boolean
  isAddWatermarkMap?: Record<string, boolean>
  watermarkType?: 'text' | 'image'
  watermarkTypeMap?: Record<string, 'text' | 'image'>
  isFullScreenWatermark?: boolean
  isFullScreenWatermarkMap?: Record<string, boolean>
  /** Watermark rotation in degrees. */
  watermarkDegree?: number
  watermarkDegreeMap?: Record<string, number>
  watermarkText?: string
  watermarkTextMap?: Record<string, string>
  watermarkFontPath?: string
  watermarkFontPathMap?: Record<string, string>
  /** Watermark width as a fraction of source image width. */
  watermarkScaleRatio?: number
  watermarkScaleRatioMap?: Record<string, number>
  watermarkColor?: string
  watermarkColorMap?: Record<string, string>
  watermarkImagePath?: string
  watermarkImagePathMap?: Record<string, string>
  watermarkPosition?: availableWatermarkPosition
  watermarkPositionMap?: Record<string, availableWatermarkPosition>
  /** Image-watermark alpha on a 0–255 scale. */
  watermarkImageOpacity?: number
  watermarkImageOpacityMap?: Record<string, number>
  [propName: string]: any
}

/** Resolved watermark settings after profile, uploader-map, and global precedence is applied. */
export interface IBuildInWaterMarkOptionsTreated {
  isAddWatermark?: boolean
  watermarkType?: 'text' | 'image'
  isFullScreenWatermark?: boolean
  watermarkDegree?: number
  watermarkText?: string
  watermarkFontPath?: string
  watermarkScaleRatio?: number
  watermarkColor?: string
  watermarkImagePath?: string
  watermarkPosition?: availableWatermarkPosition
  watermarkImageOpacity?: number
  [propName: string]: any
}

/** Global image-processing settings and optional uploader-keyed maps, overridden by profile settings. */
export interface IBuildInCompressOptions {
  /** Encoder quality; values below 100 request quality reduction. */
  quality?: number
  qualityMap?: Record<string, number>
  isConvert?: boolean
  isConvertMap?: Record<string, boolean>
  convertFormat?: availableConvertFormat
  convertFormatMap?: Record<string, availableConvertFormat>
  isReSize?: boolean
  isReSizeMap?: Record<string, boolean>
  reSizeWidth?: number
  reSizeWidthMap?: Record<string, number>
  reSizeHeight?: number
  reSizeHeightMap?: Record<string, number>
  /** Uses the longer source edge for height-only proportional resizing. */
  longEdgeAsHeight?: boolean
  longEdgeAsHeightMap?: Record<string, boolean>
  skipReSizeOfSmallImg?: boolean
  skipReSizeOfSmallImgMap?: Record<string, boolean>
  isReSizeByPercent?: boolean
  isReSizeByPercentMap?: Record<string, boolean>
  /** Percentage of original image dimensions used for proportional resizing. */
  reSizePercent?: number
  reSizePercentMap?: Record<string, number>
  isRotate?: boolean
  isRotateMap?: Record<string, boolean>
  rotateDegree?: number
  rotateDegreeMap?: Record<string, number>
  isRemoveExif?: boolean
  isRemoveExifMap?: Record<string, boolean>
  isFlip?: boolean
  isFlipMap?: Record<string, boolean>
  isFlop?: boolean
  isFlopMap?: Record<string, boolean>
  /** Source-extension to output-format mapping, supplied as an object or JSON string. */
  formatConvertObj?: any
  formatConvertObjMap?: Record<string, any>
  [propName: string]: any
}

/** Resolved compression settings after profile, uploader-map, and global precedence is applied. */
export interface IBuildInCompressOptionsTreated {
  quality?: number
  isConvert?: boolean
  convertFormat?: availableConvertFormat
  isReSize?: boolean
  reSizeWidth?: number
  reSizeHeight?: number
  skipReSizeOfSmallImg?: boolean
  isReSizeByPercent?: boolean
  reSizePercent?: number
  longEdgeAsHeight?: boolean
  isRotate?: boolean
  rotateDegree?: number
  isRemoveExif?: boolean
  isFlip?: boolean
  isFlop?: boolean
  formatConvertObj?: any
  [propName: string]: any
}

/** Extension exclusions that bypass built-in image processing. */
export interface IBuildInSkipProcessOptions {
  /** Comma-separated extensions; matching is case-insensitive and accepts optional leading dots. */
  skipProcessExtList?: string
}

/** Processing overrides associated with a saved uploader profile ID. */
export interface IBuildInListItem {
  /** ID of the saved uploader profile to which these processing overrides apply. */
  id: string
  compress?: Partial<IBuildInCompressOptionsTreated>
  watermark?: Partial<IBuildInWaterMarkOptionsTreated>
  skipProcess?: IBuildInSkipProcessOptions
  rename?: {
    enable?: boolean
    format?: string
  }
  // settings.autoRename
  autoRename?: boolean
  // settings.rename
  manualRename?: boolean
}

/** Per-call uploader/profile selection that leaves persisted defaults unchanged. */
export interface IUploadOptions {
  /** Select an uploader for this upload only, without changing saved defaults. */
  picBed?: string
  /** Select a saved configuration by name (requires picBed). */
  configName?: string
}

/** Primary and optional secondary lifecycle contexts returned after upload processing. */
export interface IUploadResultWithBackup {
  ctx?: IPicGo
  /** Secondary upload context when one was produced; absent when disabled, skipped, or rejected. */
  backupCtx?: IPicGo
}

/** Lifecycle stage names shared with script integrations, including GUI-only stages. */
export type IScriptLifecycle =
  | 'onSoftwareOpen'
  | 'onSoftwareClose'
  | 'preProcess'
  | 'beforeTransform'
  | 'transform'
  | 'beforeUpload'
  | 'upload'
  | 'afterUpload'
  | 'onUploadSuccess'
  | 'onUploadFailure'
  | 'onGalleryRemove'

/** Persisted Alist login token cache scoped to a server and credential identity. */
export interface IAlistTokenStore {
  token: string
  /** Token refresh timestamp in milliseconds since the Unix epoch. */
  refreshedAt: number
  /** Identifies the server and login credentials; absent in legacy caches. */
  cacheKey?: string
}
