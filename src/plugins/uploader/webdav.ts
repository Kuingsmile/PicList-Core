import fs, { ensureDirSync } from 'fs-extra'
import path from 'path'
import { WebDAVClient, WebDAVClientOptions, AuthType, createClient } from 'webdav'

import { IPicGo, IPluginConfig, IWebdavPlistConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'
import { buildInUploaderNames, encodePath, formatPathHelper } from './utils'

const handle = async (ctx: IPicGo): Promise<IPicGo | boolean> => {
  const webdavplistOptions = ctx.getConfig<IWebdavPlistConfig>('picBed.webdavplist')
  if (!webdavplistOptions) throw new Error("Can't find webdavplist config")
  webdavplistOptions.host = webdavplistOptions.host.replace(/^https?:\/\/|\/+$/g, '')
  webdavplistOptions.host = (webdavplistOptions.sslEnabled ? 'https://' : 'http://') + webdavplistOptions.host
  webdavplistOptions.path = formatPathHelper({
    path: webdavplistOptions.path,
    rootToEmpty: false
  })
  const authType = webdavplistOptions.authType || 'basic'
  const webpath = formatPathHelper({
    path: webdavplistOptions.webpath,
    rootToEmpty: false
  })
  const suffix = webdavplistOptions.options || ''
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
        const fullUploadDirPath = path.dirname(`${uploadPath}${img.fileName}`)
        const pathToCreate = fullUploadDirPath === '/' ? '' : fullUploadDirPath
        if (pathToCreate) {
          await client.createDirectory(pathToCreate, { recursive: true })
        }
        const res = await client.putFileContents(`${uploadPath}${img.fileName}`.replace(/^\/+|\/+$/g, ''), image, {
          overwrite: true
        })
        if (res) {
          const imgTempPath = path.join(ctx.baseDir, 'imgTemp', 'webdavplist')
          const imgTempFilePath = path.join(imgTempPath, img.fileName)
          ensureDirSync(path.dirname(imgTempFilePath))
          fs.writeFileSync(imgTempFilePath, image)
          delete img.base64Image
          delete img.buffer
          const baseUrl = customUrl || webdavplistOptions.host
          if (webdavplistOptions.webpath) {
            img.imgUrl = `${baseUrl}/${encodePath(`${webpath}${img.fileName}`).replace(/^\/+/g, '')}${suffix}`
          } else {
            img.imgUrl = `${baseUrl}/${encodePath(`${uploadPath}${img.fileName}`).replace(/^\/+/g, '')}${suffix}`
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
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_HOST')
      },
      default: userConfig.host || '',
      required: true
    },
    {
      name: 'sslEnabled',
      type: 'confirm',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_SSLENABLED')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_SSLENABLED')
      },
      required: false,
      default: userConfig.sslEnabled ?? false,
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_SSLENABLED')
      }
    },
    {
      name: 'username',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_USERNAME')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_USERNAME')
      },
      default: userConfig.username || '',
      required: true,
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_USERNAME')
      }
    },
    {
      name: 'password',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_PASSWORD')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_PASSWORD')
      },
      default: userConfig.password || '',
      required: true,
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_PASSWORD')
      }
    },
    {
      name: 'path',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_PATH')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_PATH')
      },
      default: userConfig.path || '',
      required: false,
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_PATH')
      }
    },
    {
      name: 'webpath',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_WEBSITE_PATH')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_WEBSITE_PATH')
      },
      default: userConfig.path || '',
      required: false,
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_WEBSITE_PATH')
      }
    },
    {
      name: 'customUrl',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_CUSTOMURL')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_CUSTOMURL')
      },
      default: userConfig.customUrl || '',
      required: false,
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_CUSTOMURL')
      }
    },
    {
      name: 'authType',
      type: 'list',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_AUTHTYPE')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_AUTHTYPE')
      },
      choices: ['basic', 'digest'],
      default: userConfig.authType || 'basic',
      required: false
    },
    {
      name: 'options',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_OPTIONS')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_OPTIONS')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST_MESSAGE_OPTIONS')
      },
      default: userConfig.options || '',
      required: false
    }
  ]
  return config
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
