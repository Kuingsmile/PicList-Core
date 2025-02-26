import axios from 'axios'
import { IPicGo, IPluginConfig, IAlistConfig, IOldReqOptions, IFullResponse } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'
import { buildInUploaderNames, encodePath, formatPathHelper } from './utils'
import path from 'path'

interface IAlistTokenStore {
  token: string
  refreshedAt: number
}

const getAlistToken = async (ctx: IPicGo, url: string, username: string, password: string): Promise<string> => {
  const tokenStore = ctx.getConfig<IAlistTokenStore>('picgo-plugin-buildin-alistplist')
  if (tokenStore && tokenStore.refreshedAt && Date.now() - tokenStore.refreshedAt < 3600000 && tokenStore.token) {
    return tokenStore.token
  }
  const res = await axios.post(`${url}/api/auth/login`, {
    username,
    password
  })
  if (res.data.code === 200 && res.data.message === 'success') {
    const token = res.data.data.token
    ctx.saveConfig({
      'picgo-plugin-buildin-alistplist': {
        token,
        refreshedAt: Date.now()
      }
    })
    return token
  }
  throw new Error('Get token failed')
}

const postOptions = (url: string, token: string, fileName: string, filePath: string, image: Buffer): IOldReqOptions => {
  return {
    method: 'PUT',
    url: `${url}/api/fs/form`,
    headers: {
      contentType: 'multipart/form-data',
      'User-Agent': 'PicList',
      Authorization: token,
      'File-Path': encodeURIComponent(filePath)
    },
    formData: {
      file: {
        value: image,
        options: {
          filename: fileName
        }
      }
    },
    resolveWithFullResponse: true
  }
}

const handleResError = (ctx: IPicGo, res: IFullResponse): void => {
  if (res.statusCode !== 200 || res.body.code !== 200 || res.body.message !== 'success') {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS_AND_NETWORK'),
      text: res.body.message
    })
    throw new Error(res.body.message)
  }
}

const extractConfig = (config: IAlistConfig) => {
  const { url, token, username, password, uploadPath, webPath, customUrl } = config
  return {
    url: (url || '').replace(/\/$/, ''),
    token: token || '',
    username: username || '',
    password: password || '',
    uploadPath: formatPathHelper({
      path: uploadPath || '',
      startSlash: true,
      endSlash: true,
      rootToEmpty: false
    }),
    webPath: webPath
      ? formatPathHelper({
          path: webPath || '',
          startSlash: true,
          endSlash: true,
          rootToEmpty: false
        })
      : '',
    customUrl: (customUrl || '').replace(/\/$/, '')
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const alistConfig = ctx.getConfig<IAlistConfig>('picBed.alistplist')
  if (!alistConfig) throw new Error('Can not find alist config!')

  const { url, username, password, uploadPath, webPath, customUrl } = extractConfig(alistConfig)
  let { token } = extractConfig(alistConfig)
  if (!token) {
    token = await getAlistToken(ctx, url, username, password)
  }
  if (!url || !(token || (username && password))) throw new Error('Please check your alist config!')

  const imgList = ctx.output
  for (const img of imgList) {
    if (img.fileName && img.buffer) {
      let image = img.buffer
      if (!image && img.base64Image) {
        image = Buffer.from(img.base64Image, 'base64')
      }
      const fullUploadPath = `${uploadPath}${img.fileName}`
      const postConfig = postOptions(url, token, img.fileName, fullUploadPath, image)
      const uploadRes = (await ctx.request(postConfig)) as unknown as IFullResponse
      handleResError(ctx, uploadRes)
      const refreshUrl = `${url}/api/fs/list`
      const getInfoUrl = `${url}/api/fs/get`
      const refreshRes = (await ctx.request({
        method: 'POST',
        url: refreshUrl,
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        },
        body: {
          password: '',
          page: 1,
          per_page: 1,
          refresh: true,
          path: path.dirname(fullUploadPath)
        },
        resolveWithFullResponse: true
      })) as unknown as IFullResponse
      handleResError(ctx, refreshRes)
      const getInfoRes = (await ctx.request({
        method: 'POST',
        url: getInfoUrl,
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        },
        body: {
          password: '',
          path: fullUploadPath,
          page: 1,
          per_page: 1,
          refresh: true
        },
        resolveWithFullResponse: true
      })) as unknown as IFullResponse
      handleResError(ctx, getInfoRes)
      const sign = getInfoRes.body.data.sign
      const encodedPath = encodePath(`${webPath || uploadPath}${img.fileName}`)
      img.imgUrl = `${customUrl || url}${customUrl && customUrl !== url ? '' : '/d'}${encodedPath}`
      img.imgUrl += (!customUrl || customUrl === url) && sign ? `?sign=${sign}` : ''
      delete img.base64Image
      delete img.buffer
    }
  }
  return ctx
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IAlistConfig>('picBed.alistplist') || {}
  const config: IPluginConfig[] = [
    {
      name: 'url',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_URL')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_URL')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_URL')
      },
      default: userConfig.url || '',
      required: true
    },
    {
      name: 'token',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_TOKEN')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_TOKEN')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_TOKEN')
      },
      default: userConfig.token || '',
      required: false
    },
    {
      name: 'username',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_USERNAME')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_USERNAME')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_USERNAME')
      },
      default: userConfig.username || '',
      required: false
    },
    {
      name: 'password',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_PASSWORD')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_PASSWORD')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_PASSWORD')
      },
      default: userConfig.password || '',
      required: false
    },
    {
      name: 'uploadPath',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_UPLOAD_PATH')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_UPLOAD_PATH')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_UPLOAD_PATH')
      },
      default: userConfig.uploadPath || '',
      required: false
    },
    {
      name: 'webPath',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_WEB_PATH')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_WEB_PATH')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_WEB_PATH')
      },
      default: userConfig.webPath || '',
      required: false
    },
    {
      name: 'customUrl',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_CUSTOMURL')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_CUSTOMURL')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_CUSTOMURL')
      },
      default: userConfig.customUrl || '',
      required: false
    }
  ]
  return config
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.alistplist, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_PLIST')
    },
    handle,
    config
  })
}
