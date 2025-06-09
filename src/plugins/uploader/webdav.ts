import fs, { ensureDirSync } from 'fs-extra'
import path from 'path'
import { WebDAVClient, WebDAVClientOptions, AuthType, createClient } from 'webdav'

import { IPicGo, IPluginConfig, IWebdavPlistConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'
import { buildInUploaderNames, encodePath, formatPathHelper, createField } from './utils'

const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024 // 4GB
const GALLERY_PORT = 36699

const normalizeHostUrl = (host: string, sslEnabled: boolean): string => {
  const cleanHost = host.replace(/^https?:\/\/|\/+$/g, '')
  return `${sslEnabled ? 'https://' : 'http://'}${cleanHost}`
}

const createWebDAVClient = (config: IWebdavPlistConfig): WebDAVClient => {
  const clientOptions: WebDAVClientOptions = {
    username: config.username,
    password: config.password,
    maxBodyLength: MAX_FILE_SIZE,
    maxContentLength: MAX_FILE_SIZE
  }

  if (config.authType === 'digest') {
    clientOptions.authType = AuthType.Digest
  }

  return createClient(config.host, clientOptions)
}

const getImageBuffer = (img: any): Buffer => {
  if (img.buffer) return img.buffer
  if (img.base64Image) return Buffer.from(img.base64Image, 'base64')
  throw new Error('No image data found')
}

const buildImageUrl = (
  baseUrl: string,
  uploadPath: string,
  webpath: string,
  fileName: string,
  suffix: string,
  useWebpath: boolean
): string => {
  const pathToUse = useWebpath ? webpath : uploadPath
  const encodedPath = encodePath(`${pathToUse}${fileName}`).replace(/^\/+/g, '')
  return `${baseUrl}/${encodedPath}${suffix}`
}

const saveImageToTemp = (ctx: IPicGo, fileName: string, imageBuffer: Buffer): void => {
  const imgTempPath = path.join(ctx.baseDir, 'imgTemp', 'webdavplist')
  const imgTempFilePath = path.join(imgTempPath, fileName)
  ensureDirSync(path.dirname(imgTempFilePath))
  fs.writeFileSync(imgTempFilePath, imageBuffer)
}

const uploadImage = async (
  client: WebDAVClient,
  uploadPath: string,
  fileName: string,
  imageBuffer: Buffer
): Promise<boolean> => {
  const fullUploadDirPath = path.dirname(`${uploadPath}${fileName}`)
  const pathToCreate = fullUploadDirPath === '/' ? '' : fullUploadDirPath

  if (pathToCreate) {
    await client.createDirectory(pathToCreate, { recursive: true })
  }

  const filePath = `${uploadPath}${fileName}`.replace(/^\/+|\/+$/g, '')
  return await client.putFileContents(filePath, imageBuffer, { overwrite: true })
}

const handle = async (ctx: IPicGo): Promise<IPicGo | boolean> => {
  const config = ctx.getConfig<IWebdavPlistConfig>('picBed.webdavplist')
  if (!config) throw new Error("Can't find webdavplist config")

  config.host = normalizeHostUrl(config.host, config.sslEnabled)
  config.path = formatPathHelper({ path: config.path, rootToEmpty: false })

  const webpath = formatPathHelper({ path: config.webpath, rootToEmpty: false })
  const suffix = config.options || ''

  try {
    const client = createWebDAVClient(config)
    const baseUrl = config.customUrl || config.host

    for (const img of ctx.output) {
      if (!img.fileName) continue

      const imageBuffer = getImageBuffer(img)
      const uploadResult = await uploadImage(client, config.path, img.fileName, imageBuffer)

      if (!uploadResult) {
        throw new Error('Upload failed')
      }

      saveImageToTemp(ctx, img.fileName, imageBuffer)

      delete img.base64Image
      delete img.buffer

      img.imgUrl = buildImageUrl(baseUrl, config.path, webpath, img.fileName, suffix, !!config.webpath)
      img.galleryPath = `http://localhost:${GALLERY_PORT}/webdavplist/${encodeURIComponent(img.fileName)}`
    }

    return ctx
  } catch (err: any) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS')
    })
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IWebdavPlistConfig>('picBed.webdavplist') || {}

  return [
    createField(ctx, 'webdavplist', 'host', 'input', userConfig.host || '', true),
    createField(ctx, 'webdavplist', 'sslEnabled', 'confirm', userConfig.sslEnabled ?? false, false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_SSLENABLED')
      }
    }),
    createField(ctx, 'webdavplist', 'username', 'input', userConfig.username || '', true, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_USERNAME')
      }
    }),
    createField(ctx, 'webdavplist', 'password', 'input', userConfig.password || '', true, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_PASSWORD')
      }
    }),
    createField(ctx, 'webdavplist', 'path', 'input', userConfig.path || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_PATH')
      }
    }),
    createField(ctx, 'webdavplist', 'webpath', 'input', userConfig.webpath || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_WEBSITE_PATH')
      }
    }),
    createField(ctx, 'webdavplist', 'customUrl', 'input', userConfig.customUrl || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_CUSTOMURL')
      }
    }),
    createField(ctx, 'webdavplist', 'authType', 'list', userConfig.authType || 'basic', false, undefined, {
      choices: ['basic', 'digest']
    }),
    createField(ctx, 'webdavplist', 'options', 'input', userConfig.options || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_OPTIONS')
      }
    })
  ]
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.webdavplist, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST')
    },
    handle,
    config
  })
}
