import { Command } from 'commander'
import { Inquirer } from 'inquirer'
import { FormatEnum, GravityEnum } from 'sharp'

import { IRequestPromiseOptions } from './oldRequest'

export interface IPicGo extends NodeJS.EventEmitter {
  configPath: string
  baseDir: string
  log: ILogger
  cmd: ICommander
  output: IImgInfo[]
  input: any[]
  rawInput: any[]
  processedInput: any[]
  pluginLoader: IPluginLoader
  pluginHandler: IPluginHandler
  /**
   * @deprecated will be removed in v1.5.0+
   */
  Request: IRequest
  helper: IHelper
  VERSION: string
  GUI_VERSION?: string
  request: IRequest['request']
  rawInputPath?: string[]
  i18n: II18nManager

  getConfig: <T>(name?: string) => T
  saveConfig: (config: IStringKeyMap<any>) => void
  removeConfig: (key: string, propName: string) => void
  setConfig: (config: IStringKeyMap<any>) => void
  unsetConfig: (key: string, propName: string) => void
  upload: (input?: any[]) => Promise<IImgInfo[] | Error>
  uploadReturnCtx: (input?: any[]) => Promise<IPicGo>
}

// plugin config
export interface IPluginConfig {
  name: string
  type: string
  required: boolean
  default?: any
  alias?: string
  message?: string
  prefix?: string // for cli options
  [propName: string]: any
}

// for lifecycle plugins

export interface ILifecyclePlugins {
  register: (id: string, plugin: IPlugin) => void
  unregister: (id: string) => void
  getName: () => string
  get: (id: string) => IPlugin | undefined
  getList: () => IPlugin[]
  getIdList: () => string[]
}

export interface IHelper {
  transformer: ILifecyclePlugins
  uploader: ILifecyclePlugins
  beforeTransformPlugins: ILifecyclePlugins
  beforeUploadPlugins: ILifecyclePlugins
  afterUploadPlugins: ILifecyclePlugins
}

export interface ICommander extends ILifecyclePlugins {
  program: Command
  inquirer: Inquirer
}

export interface IPluginLoader {
  registerPlugin: (name: string, plugin?: IPicGoPlugin) => Promise<void>
  unregisterPlugin: (name: string) => void
  getPlugin: (name: string) => Promise<IPicGoPluginInterface | undefined>
  getList: () => string[]
  getFullList: () => string[]
  hasPlugin: (name: string) => boolean
}

export interface IRequestOld {
  request: import('axios').AxiosInstance
}

export type IOldReqOptions = Omit<
  IRequestPromiseOptions & {
    url: string
  },
  'auth'
>

export type IOldReqOptionsWithFullResponse = IOldReqOptions & {
  resolveWithFullResponse: true
}

export type IOldReqOptionsWithJSON = IOldReqOptions & {
  json: true
}

/**
 * for PicGo new request api, the response will be json format
 */
export type IReqOptions<T = any> = AxiosRequestConfig<T> & {
  resolveWithFullResponse: true
}

/**
 * for PicGo new request api, the response will be Buffer
 */
export type IReqOptionsWithArrayBufferRes<T = any> = IReqOptions<T> & {
  responseType: 'arraybuffer'
}

/**
 * for PicGo new request api, the response will be just response data. (not statusCode, headers, etc.)
 */
export type IReqOptionsWithBodyResOnly<T = any> = AxiosRequestConfig<T>

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
 * T is the response data type
 * U is the config type
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

export type IRequestConfig<T> = T extends IRequestLibOnlyOptions ? IOldReqOptions : AxiosRequestConfig

export interface IRequest {
  request: <
    T,
    U extends IRequestConfig<U> extends IOldReqOptions
      ? IOldReqOptions
      : IRequestConfig<U> extends AxiosRequestConfig
        ? AxiosRequestConfig
        : never
  >(
    config: U
  ) => Promise<IResponse<T, U>>
}

export type ILogColor = 'blue' | 'green' | 'yellow' | 'red'

export interface IImgInfo {
  buffer?: Buffer
  base64Image?: string
  fileName?: string
  width?: number
  height?: number
  extname?: string
  imgUrl?: string
  [propName: string]: any
}

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
  endpoint: string
  method?: string
  formDataKey?: string
  headers?: string
  body?: string
  resDataPath?: string
  customPrefix?: string
  webPath?: string
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
    /** for uploader */
    proxy?: string
    [others: string]: any
  }
  picgoPlugins: Record<string, boolean>
  debug?: boolean
  silent?: boolean
  settings?: {
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
  handle: ((ctx: IPicGo) => Promise<any>) | ((ctx: IPicGo) => void)
  name?: string
  config?: (ctx: IPicGo) => IPluginConfig[]
  [propName: string]: any
}

export type IPluginNameType = 'simple' | 'scope' | 'normal' | 'unknown'

export interface IPluginProcessResult {
  success: boolean
  pkgName: string
  fullName: string
}

export interface IPluginHandler {
  install: (
    plugins: string[],
    options: IPluginHandlerOptions,
    env?: IProcessEnv
  ) => Promise<IPluginHandlerResult<boolean>>
  update: (
    plugins: string[],
    options: IPluginHandlerOptions,
    env?: IProcessEnv
  ) => Promise<IPluginHandlerResult<boolean>>
  uninstall: (plugins: string[]) => Promise<IPluginHandlerResult<boolean>>
}

export interface IPluginHandlerResult<T> {
  success: T
  body: T extends true ? string[] : string
}

export interface IPluginHandlerOptions {
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

export interface IGuiMenuItem {
  label: string
  handle: (ctx: IPicGo, guiApi: any) => Promise<void>
}

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

export interface ILogger {
  success: (...msg: ILogArgvType[]) => void
  info: (...msg: ILogArgvType[]) => void
  error: (...msg: ILogArgvTypeWithError[]) => void
  warn: (...msg: ILogArgvType[]) => void
  debug: (...msg: ILogArgvType[]) => void
}

export interface IConfigChangePayload<T> {
  configName: string
  value: T
}

export type ILocale = Record<string, any>

export interface II18nManager {
  /**
   * translate text
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

export interface IBuildInWaterMarkOptions {
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
}

export interface IBuildInCompressOptions {
  quality?: number
  isConvert?: boolean
  convertFormat?: availableConvertFormat
  isReSize?: boolean
  reSizeWidth?: number
  reSizeHeight?: number
  skipReSizeOfSmallImg?: boolean
  isReSizeByPercent?: boolean
  reSizePercent?: number
  isRotate?: boolean
  rotateDegree?: number
  isRemoveExif?: boolean
  isFlip?: boolean
  isFlop?: boolean
  [propName: string]: any
}

export interface IBuildInSkipProcessOptions {
  skipProcessExtList?: string
}
