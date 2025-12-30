import path from 'node:path'

import axios from 'axios'

import { ILocalesKey } from '../../i18n/zh-CN'
import { IAlistConfig, IFullResponse, IOldReqOptions, IPicGo, IPluginConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { buildInUploaderNames, createField, encodePath, formatPathHelper } from './utils'

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
    password,
  })
  if (res.data.code === 200 && res.data.message === 'success') {
    const token = res.data.data.token
    ctx.saveConfig({
      'picgo-plugin-buildin-alistplist': {
        token,
        refreshedAt: Date.now(),
      },
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
      'File-Path': encodeURIComponent(filePath),
    },
    formData: {
      file: {
        value: image,
        options: {
          filename: fileName,
        },
      },
    },
    resolveWithFullResponse: true,
  }
}

const handleResError = (ctx: IPicGo, res: IFullResponse): void => {
  if (res.statusCode !== 200 || res.body.code !== 200 || res.body.message !== 'success') {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS_AND_NETWORK'),
      text: res.body.message,
    })
    throw new Error(res.body.message)
  }
}

const createApiRequest = (url: string, token: string, body: any): IOldReqOptions => ({
  method: 'POST',
  url,
  headers: {
    Authorization: token,
    'Content-Type': 'application/json',
  },
  body,
  resolveWithFullResponse: true,
})

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
      rootToEmpty: false,
    }),
    webPath: webPath
      ? formatPathHelper({
          path: webPath || '',
          startSlash: true,
          endSlash: true,
          rootToEmpty: false,
        })
      : '',
    customUrl: (customUrl || '').replace(/\/$/, ''),
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

      const refreshRes = (await ctx.request(
        createApiRequest(`${url}/api/fs/list`, token, {
          password: '',
          page: 1,
          per_page: 1,
          refresh: true,
          path: path.dirname(fullUploadPath),
        }),
      )) as unknown as IFullResponse
      handleResError(ctx, refreshRes)

      const getInfoRes = (await ctx.request(
        createApiRequest(`${url}/api/fs/get`, token, {
          password: '',
          path: fullUploadPath,
          page: 1,
          per_page: 1,
          refresh: true,
        }),
      )) as unknown as IFullResponse
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
  return [
    createField(ctx, 'alist', 'url', 'input', userConfig.url || '', true, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_URL')
      },
    }),
    createField(ctx, 'alist', 'token', 'input', userConfig.token || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_TOKEN')
      },
    }),
    createField(ctx, 'alist', 'username', 'input', userConfig.username || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_USERNAME')
      },
    }),
    createField(ctx, 'alist', 'password', 'input', userConfig.password || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_PASSWORD')
      },
    }),
    createField(ctx, 'alist', 'uploadPath', 'input', userConfig.uploadPath || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_UPLOAD_PATH')
      },
    }),
    createField(ctx, 'alist', 'webPath', 'input', userConfig.webPath || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_WEB_PATH')
      },
    }),
    createField(ctx, 'alist', 'customUrl', 'input', userConfig.customUrl || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_MESSAGE_CUSTOMURL')
      },
    }),
  ]
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.alistplist, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_PLIST')
    },
    handle,
    config,
  })
}
