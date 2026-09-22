import path from 'node:path'

import fs from 'fs-extra'
import { ensureDirSync } from 'fs-extra/esm'
import { AuthType, createClient, WebDAVClient, WebDAVClientOptions } from 'webdav'

import { IPicGo, IPluginConfig, IWebdavPlistConfig } from '../../types'
import { getSha256 } from '../../utils/common/hash'
import { IBuildInEvent } from '../../utils/enum'
import { getAndCheckConfig, getImageBuffer } from './helper'
import { buildInUploaderNames, createField, encodePath, formatPathHelper } from './utils'

/** HTTP request and response size limit in bytes for the WebDAV client. */
const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024 // 4GB
const GALLERY_PORT = 36699

/** Rebuilds the host URL using the explicit SSL setting and removes trailing slashes. */
const normalizeHostUrl = (host: string, sslEnabled: boolean): string => {
  const cleanHost = host.replace(/^https?:\/\/|\/+$/g, '')
  return `${sslEnabled ? 'https://' : 'http://'}${cleanHost}`
}

/** Creates an authenticated WebDAV client with upload size limits and optional digest authentication. */
const createWebDAVClient = (config: IWebdavPlistConfig): WebDAVClient => {
  const clientOptions: WebDAVClientOptions = {
    username: config.username,
    password: config.password,
    maxBodyLength: MAX_FILE_SIZE,
    maxContentLength: MAX_FILE_SIZE,
  }

  if (config.authType === 'digest') {
    clientOptions.authType = AuthType.Digest
  }

  return createClient(config.host, clientOptions)
}

/**
 * Constructs a public URL from the selected upload or web path, encoded filename, and configured
 * suffix.
 */
const buildImageUrl = (
  baseUrl: string,
  uploadPath: string,
  webpath: string,
  fileName: string,
  suffix: string,
  useWebpath: boolean,
): string => {
  const pathToUse = useWebpath ? webpath : uploadPath
  const encodedPath = encodePath(`${pathToUse}${fileName}`).replace(/^\/+/g, '')
  return `${baseUrl}/${encodedPath}${suffix}`
}

/** Writes a destination-specific gallery copy while creating any nested filename directories. */
const saveImageToTemp = (ctx: IPicGo, destinationKey: string, fileName: string, imageBuffer: Buffer): void => {
  const imgTempPath = path.join(ctx.baseDir, 'imgTemp', 'webdavplist', destinationKey)
  const imgTempFilePath = path.join(imgTempPath, fileName)
  ensureDirSync(path.dirname(imgTempFilePath))
  fs.writeFileSync(imgTempFilePath, imageBuffer)
}

/** Creates remote parent directories and uploads image bytes with overwrite enabled. */
const uploadImage = async (
  client: WebDAVClient,
  uploadPath: string,
  fileName: string,
  imageBuffer: Buffer,
): Promise<boolean> => {
  const fullUploadDirPath = path.dirname(`${uploadPath}${fileName}`)
  const pathToCreate = fullUploadDirPath === '/' ? '' : fullUploadDirPath

  if (pathToCreate) {
    await client.createDirectory(pathToCreate, { recursive: true })
  }

  const filePath = `${uploadPath}${fileName}`.replace(/^\/+|\/+$/g, '')
  return await client.putFileContents(filePath, imageBuffer, { overwrite: true })
}

/** Uploads output images to WebDAV, assigns public URLs, and caches gallery copies on a best-effort basis. */
const handle = async (ctx: IPicGo): Promise<IPicGo | boolean> => {
  const webdavOptions = getAndCheckConfig<IWebdavPlistConfig>(ctx, 'picBed.webdavplist', [])

  webdavOptions.host = normalizeHostUrl(webdavOptions.host, webdavOptions.sslEnabled)
  webdavOptions.path = formatPathHelper({ path: webdavOptions.path, rootToEmpty: false })

  const webpath = formatPathHelper({ path: webdavOptions.webpath, rootToEmpty: false })
  const suffix = webdavOptions.options || ''
  // Share previews only within a destination, independently of passwords and public URL settings.
  const destinationKey = getSha256(JSON.stringify([webdavOptions.host, webdavOptions.username, webdavOptions.path]))

  try {
    const client = createWebDAVClient(webdavOptions)
    const baseUrl = webdavOptions.customUrl || webdavOptions.host

    for (const img of ctx.output) {
      if (!img.fileName) continue
      const imageBuffer = getImageBuffer(img)
      if (!imageBuffer) continue

      const uploadResult = await uploadImage(client, webdavOptions.path, img.fileName, imageBuffer)
      if (!uploadResult) throw new Error('Upload failed')
      delete img.base64Image
      delete img.buffer
      img.imgUrl = buildImageUrl(baseUrl, webdavOptions.path, webpath, img.fileName, suffix, !!webdavOptions.webpath)
      delete img.galleryPath
      try {
        saveImageToTemp(ctx, destinationKey, img.fileName, imageBuffer)
        img.galleryPath = `http://localhost:${GALLERY_PORT}/webdavplist/${destinationKey}/${encodePath(img.fileName)}`
      } catch (_error) {
        ctx.log.warn('WebDAV upload succeeded, but the gallery cache could not be updated.')
      }
    }
    return ctx
  } catch (err: any) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.t('UPLOAD_FAILED'),
      body: ctx.i18n.t('CHECK_SETTINGS'),
    })
    throw err
  }
}

/** Builds the WebDAV configuration form using saved values and localized field labels. */
const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IWebdavPlistConfig>('picBed.webdavplist') || {}

  return [
    createField(ctx, 'webdavplist', 'host', 'input', userConfig.host || '', true),
    createField(ctx, 'webdavplist', 'sslEnabled', 'confirm', !!userConfig.sslEnabled, false, undefined, {
      get message() {
        return ctx.i18n.t('PICBED_WEBDAVPLIST_MESSAGE_SSLENABLED')
      },
    }),
    createField(ctx, 'webdavplist', 'username', 'input', userConfig.username || '', true, undefined, {
      get message() {
        return ctx.i18n.t('PICBED_WEBDAVPLIST_MESSAGE_USERNAME')
      },
    }),
    createField(ctx, 'webdavplist', 'password', 'input', userConfig.password || '', true, undefined, {
      get message() {
        return ctx.i18n.t('PICBED_WEBDAVPLIST_MESSAGE_PASSWORD')
      },
    }),
    createField(ctx, 'webdavplist', 'path', 'input', userConfig.path || '', false, undefined, {
      get message() {
        return ctx.i18n.t('PICBED_WEBDAVPLIST_MESSAGE_PATH')
      },
    }),
    createField(ctx, 'webdavplist', 'webpath', 'input', userConfig.webpath || '', false, undefined, {
      get message() {
        return ctx.i18n.t('PICBED_WEBDAVPLIST_MESSAGE_WEBSITE_PATH')
      },
    }),
    createField(ctx, 'webdavplist', 'customUrl', 'input', userConfig.customUrl || '', false, undefined, {
      get message() {
        return ctx.i18n.t('PICBED_WEBDAVPLIST_MESSAGE_CUSTOMURL')
      },
    }),
    createField(ctx, 'webdavplist', 'authType', 'list', userConfig.authType || 'basic', false, undefined, {
      choices: ['basic', 'digest'],
    }),
    createField(ctx, 'webdavplist', 'options', 'input', userConfig.options || '', false, undefined, {
      get message() {
        return ctx.i18n.t('PICBED_WEBDAVPLIST_MESSAGE_OPTIONS')
      },
    }),
  ]
}

/** Registers the built-in WebDAV uploader and its configuration form on the client. */
export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.webdavplist, {
    get name() {
      return ctx.i18n.t('PICBED_WEBDAVPLIST')
    },
    handle,
    config,
  })
}
