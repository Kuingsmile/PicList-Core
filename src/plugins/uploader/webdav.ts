import { type IPicGo, type IPluginConfig, type IWebdavPlistConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { type ILocalesKey } from '../../i18n/zh-CN'
import fs from 'fs-extra'
import path from 'path'
import type { WebDAVClient, WebDAVClientOptions } from 'webdav'
import { AuthType, createClient } from 'webdav'

const handle = async (ctx: IPicGo): Promise<IPicGo | boolean> => {
  const webdavplistOptions = ctx.getConfig<IWebdavPlistConfig>('picBed.webdavplist')
  if (!webdavplistOptions) {
    throw new Error('Can\'t find webdavplist config')
  }
  webdavplistOptions.host = webdavplistOptions.host.replace(/^https?:\/\/|\/+$/g, '')
  webdavplistOptions.host = (webdavplistOptions.sslEnabled ? 'https://' : 'http://') + webdavplistOptions.host
  webdavplistOptions.path = (webdavplistOptions.path || '').replace(/^\/+|\/+$/g, '') + '/'
  const authType = webdavplistOptions.authType || 'basic'
  const webpath = (webdavplistOptions.webpath || '').replace(/^\/+|\/+$/g, '') + '/'
  try {
    const imgList = ctx.output
    const customUrl = webdavplistOptions.customUrl
    const uploadPath = webdavplistOptions.path
    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        let image = img.buffer
        if (!image && img.base64Image) {
          image = Buffer.from(img.base64Image, 'base64')
        }
        const clientOptions: WebDAVClientOptions = {
          username: webdavplistOptions.username,
          password: webdavplistOptions.password,
          maxBodyLength: 4 * 1024 * 1024 * 1024,
          maxContentLength: 4 * 1024 * 1024 * 1024
        }
        if (authType === 'digest') {
          clientOptions.authType = AuthType.Digest
        }
        const client: WebDAVClient = createClient(webdavplistOptions.host, clientOptions)
        const pathToCreate = uploadPath === '/' ? '' : uploadPath
        if (pathToCreate) {
          await client.createDirectory(pathToCreate, { recursive: true })
        }
        const res = await client.putFileContents(`${uploadPath}${img.fileName}`.replace(/^\/+|\/+$/g, ''), image, {
          overwrite: true
        })
        if (res) {
          const imgTempPath = path.join(ctx.baseDir, 'imgTemp', 'webdavplist')
          const imgTempFilePath = path.join(imgTempPath, img.fileName)
          fs.ensureDirSync(imgTempPath)
          fs.writeFileSync(imgTempFilePath, image)
          delete img.base64Image
          delete img.buffer
          const baseUrl = customUrl || webdavplistOptions.host
          if (webdavplistOptions.webpath) {
            img.imgUrl = `${baseUrl}/${webpath === '/' ? '' : encodeURIComponent(webpath)}${encodeURIComponent(img.fileName)}`.replace(/%2F/g, '/')
          } else {
            img.imgUrl = `${baseUrl}/${uploadPath === '/' ? '' : encodeURIComponent(uploadPath)}${encodeURIComponent(img.fileName)}`.replace(/%2F/g, '/')
          }
          img.galleryPath = `http://localhost:36699/webdavplist/${encodeURIComponent(img.fileName)}`
        } else {
          throw new Error('Upload failed')
        }
      }
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
  const config: IPluginConfig[] = [
    {
      name: 'host',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_HOST') },
      default: userConfig.host || '',
      required: true
    },
    {
      name: 'sslEnabled',
      type: 'confirm',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_SSLENABLED') },
      required: false,
      default: userConfig.sslEnabled ?? false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_SSLENABLED') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_SSLENABLED') }
    },
    {
      name: 'username',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_USERNAME') },
      default: userConfig.username || '',
      required: true,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_USERNAME') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_USERNAME') }
    },
    {
      name: 'password',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_PASSWORD') },
      default: userConfig.password || '',
      required: true,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_PASSWORD') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_PASSWORD') }
    },
    {
      name: 'path',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_PATH') },
      default: userConfig.path || '',
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_PATH') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_PATH') }
    },
    {
      name: 'webpath',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_WEBSITE_PATH') },
      default: userConfig.path || '',
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_WEBSITE_PATH') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_WEBSITE_PATH') }
    },
    {
      name: 'customUrl',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_CUSTOMURL') },
      default: userConfig.customUrl || '',
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_CUSTOMURL') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_CUSTOMURL') }
    },
    {
      name: 'authType',
      type: 'list',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_AUTHTYPE') },
      choices: ['basic', 'digest'],
      default: userConfig.authType || 'basic',
      required: false
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('webdavplist', {
    get name () { return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST') },
    handle,
    config
  })
}
