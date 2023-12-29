// https://github.com/hellodk34/picgo-plugin-lankong
// LICENSE: MIT

import https from 'https'
import { ILskyConfig, IPicGo, IPluginConfig } from '../../types'
import { ILocalesKey } from '../../i18n/zh-CN'
import { IBuildInEvent } from '../../utils/enum'

export interface IMGTYPE {
  imgUrl?: string
  type?: string
  key?: string
  id?: string
}

export interface IV2FORMDATA {
  file: {
    value: Buffer
    options: {
      filename: string
    }
  }
  ssl: string
  strategy_id?: string
  album_id?: string
  permission?: number
}

const postOptions = (options: ILskyConfig, fileName: string | undefined, image: Buffer): any => {
  let host = options.host
  host = host.replace(/\/$/, '')
  const isV2 = options.version === 'V2'
  const token = options.token

  const v1Headers = {
    'Content-Type': 'multipart/form-data',
    'User-Agent': 'PicList',
    Connection: 'keep-alive',
    token: token || undefined
  }
  const v1FormData = {
    image: {
      value: image,
      options: {
        filename: fileName!
      }
    },
    ssl: 'true'
  }

  const v2Headers = {
    'Content-Type': 'multipart/form-data',
    'User-Agent': 'PicList',
    Connection: 'keep-alive',
    Accept: 'application/json',
    Authorization: token || undefined
  }
  const strategyId = options.strategyId
  const albumId = options.albumId
  let permission: any = options.permission.value
  if (permission === undefined) {
    permission = options.permission
  }
  const v2FormData: IV2FORMDATA = {
    file: {
      value: image,
      options: {
        filename: fileName!
      }
    },
    ssl: 'true',
    strategy_id: strategyId,
    album_id: albumId,
    permission
  }
  if (!strategyId) {
    delete v2FormData.strategy_id
  }
  if (!albumId) {
    delete v2FormData.album_id
  }
  if (!(permission === 0 || permission === 1)) {
    delete v2FormData.permission
  }

  const requestAgent = new https.Agent({
    rejectUnauthorized: false
  })
  return {
    method: 'POST',
    url: isV2 ? `${host}/api/v1/upload` : `${host}/api/upload`,
    agent: requestAgent,
    headers: isV2 ? v2Headers : v1Headers,
    formData: isV2 ? v2FormData : v1FormData
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const lskyOptions = ctx.getConfig<ILskyConfig>('picBed.lskyplist')
  if (!lskyOptions) {
    throw new Error('Can\'t find lsky uploader config')
  }
  try {
    const imgList = ctx.output
    for (const img of imgList) {
      let image = img.buffer!
      if (!image && img.base64Image) {
        image = Buffer.from(img.base64Image, 'base64')
      }
      const postConfig = postOptions(lskyOptions, img.fileName, image)
      let body = await ctx.Request.request(postConfig) as any
      body = typeof body === 'string' ? JSON.parse(body) : body
      let isV2 = lskyOptions.version === 'V2'
      let condition = isV2 ? (body.status === true) : (body.code === 200)
      if (condition) {
        delete img.base64Image
        delete img.buffer
        img.imgUrl = isV2 ? body.data.links.url : body.data.url
        if (isV2) {
          img.hash = body.data.key
        }
      } else {
        ctx.emit('notification', {
          title: 'upload failed',
          body: body.message
        })
        throw new Error(body.message)
      }
    }
    return ctx
  } catch (err) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS')
    })
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  let userConfig = ctx.getConfig<ILskyConfig>('picBed.lskyplist') || {}
  const config: IPluginConfig[] = [
    {
      name: 'version',
      type: 'list',
      default: userConfig.version || 'V1',
      get prefix() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_VERSION') },
      get alias() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_VERSION') },
      get message() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_MESSAGE_VERSION') },
      choices: ['V1', 'V2'],
      required: true,
    },
    {
      name: 'host',
      type: 'input',
      get prefix() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_HOST') },
      get alias() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_HOST') },
      get message() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_MESSAGE_HOST') },
      default: userConfig.host || '',
      required: true,
    },
    {
      name: 'token',
      type: 'input',
      get prefix() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_TOKEN') },
      get alias() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_TOKEN') },
      get message() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_MESSAGE_TOKEN') },
      default: userConfig.token,
      required: true,
    },
    {
      name: 'strategyId',
      type: 'input',
      default: userConfig.strategyId,
      required: false,
      get prefix() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_STRATEGY_ID') },
      get alias() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_STRATEGY_ID') },
      get message() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_MESSAGE_STRATEGY_ID') },
    },
    {
      name: 'albumId',
      type: 'input',
      default: userConfig.albumId,
      required: false,
      get prefix() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_ALBUM_ID') },
      get alias() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_ALBUM_ID') },
      get message() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_MESSAGE_ALBUM_ID') },
    },
    {
      name: 'permission',
      type: 'list',
      default: userConfig.permission || 'private(default)',
      choices: [
        {
          name: 'private(default)',
          value: 0
        },
        {
          name: 'public',
          value: 1
        }
      ],
      required: false,
      get prefix() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_PERMISSION') },
      get alias() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_PERMISSION') },
      get message() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_MESSAGE_PERMISSION') },
    }
  ]
  return config
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register('lskyplist', {
    get name() { return ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_PLIST') },
    handle,
    config
  })
}