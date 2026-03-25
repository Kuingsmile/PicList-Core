import crypto from 'node:crypto'

import mime from 'mime'

import { ILocalesKey } from '../../i18n/zh-CN'
import { IOldReqOptionsWithFullResponse, IPicGo, IPluginConfig, IUpyunConfig } from '../../types'
import { getMd5, safeParse } from '../../utils/common'
import { IBuildInEvent } from '../../utils/enum'
import { getAndCheckConfig, getImageBuffer } from './helper'
import { buildInUploaderNames, createField, encodePath, formatPathHelper } from './utils'

const DEFAULT_ENDPOINT = 'https://v0.api.upyun.com'
const DEFAULT_EXPIRE_TIME = 1800 // 30 minutes
const SUCCESS_STATUS_CODE = 200

const generateSignature = (options: IUpyunConfig, fileName: string): string => {
  const { path = '', operator, password, bucket } = options
  const md5Password = getMd5(password)
  const date = new Date().toUTCString()
  const uri = `/${bucket}/${encodePath(`${path}${fileName}`)}`
  const value = `PUT&${uri}&${date}`
  const sign = crypto.createHmac('sha1', md5Password).update(value).digest('base64')
  return `UPYUN ${operator}:${sign}`
}

const postOptions = (
  options: IUpyunConfig,
  fileName: string,
  signature: string,
  image: Buffer,
): IOldReqOptionsWithFullResponse => {
  const { bucket, path } = options
  let endpoint = (options.endpoint || DEFAULT_ENDPOINT).replace(/\/+$/g, '')
  if (!endpoint.startsWith('http')) {
    endpoint = `https://${endpoint}`
  }

  return {
    method: 'PUT',
    url: `${endpoint}/${bucket}/${encodePath(`${path}${fileName}`)}`,
    headers: {
      Authorization: signature,
      Date: new Date().toUTCString(),
      'Content-Type': mime.getType(fileName) || 'application/octet-stream',
    },
    body: image,
    resolveWithFullResponse: true,
  }
}

const getAntiLeechParam = (
  antiLeechToken: string,
  expireTime: string | number | undefined,
  options: IUpyunConfig,
  fileName: string,
): string => {
  const uri = `/${options.path || ''}${fileName}`.replace(/%2F/g, '/').replace(/^\/+/g, '/')
  const now = Math.round(Date.now() / 1000)
  const expire = expireTime ? now + parseInt(expireTime.toString(), 10) : now + DEFAULT_EXPIRE_TIME
  const sign = getMd5(`${antiLeechToken}&${expire}&${uri}`)
  const urlProtectionToken = `${sign.substring(12, 20)}${expire}`
  return `_upt=${urlProtectionToken}`
}

// Process upload for a single image
const processImage = async (ctx: IPicGo, img: any, upyunOptions: IUpyunConfig, path: string): Promise<void> => {
  if (!img.fileName) return
  const image = getImageBuffer(img)
  if (!image) return

  const signature = generateSignature(upyunOptions, img.fileName)
  const options = postOptions(upyunOptions, img.fileName, signature, image)
  const body = await ctx.request(options)

  if (body.statusCode !== SUCCESS_STATUS_CODE) {
    throw new Error('Upload failed')
  }

  delete img.base64Image
  delete img.buffer

  const suffix = upyunOptions.options || ''
  const baseUrl = `${upyunOptions.url}/${encodePath(`${path}${img.fileName}`)}${suffix}`

  img.imgUrl = upyunOptions.antiLeechToken ? addAntiLeechToken(baseUrl, upyunOptions, img.fileName) : baseUrl
}

const addAntiLeechToken = (url: string, options: IUpyunConfig, fileName: string): string => {
  const upt = getAntiLeechParam(options.antiLeechToken, options.expireTime, options, fileName)
  return url.includes('?') ? `${url}&${upt}` : `${url}?${upt}`
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const upyunOptions = getAndCheckConfig<IUpyunConfig>(ctx, 'picBed.upyun', ['bucket', 'operator', 'password', 'url'])

  try {
    const path = formatPathHelper({ path: upyunOptions.path })
    upyunOptions.path = path

    for (const img of ctx.output) {
      await processImage(ctx, img, upyunOptions, path)
    }

    return ctx
  } catch (err: any) {
    handleUploadError(ctx, err)
    throw err
  }
}

const handleUploadError = (ctx: IPicGo, err: any): void => {
  const isUploadFailure = err.message === 'Upload failed'

  if (isUploadFailure) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS'),
    })
  } else {
    const errorBody = safeParse<{ code: string }>(err.error)
    const errorCode = typeof errorBody === 'object' && errorBody ? errorBody.code : errorBody || 'Unknown error'

    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
      body: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED_REASON', { code: errorCode }),
      text: 'http://docs.upyun.com/api/errno/',
    })
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IUpyunConfig>('picBed.upyun') || {}

  return [
    createField(ctx, 'upyun', 'bucket', 'input', userConfig.bucket || '', true),
    createField(ctx, 'upyun', 'operator', 'input', userConfig.operator || '', true, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN_MESSAGE_OPERATOR')
      },
    }),
    createField(ctx, 'upyun', 'password', 'input', userConfig.password || '', true, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN_MESSAGE_PASSWORD')
      },
    }),
    createField(ctx, 'upyun', 'url', 'input', userConfig.url || '', true, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN_MESSAGE_URL')
      },
    }),
    createField(ctx, 'upyun', 'options', 'input', userConfig.options || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN_MESSAGE_OPTIONS')
      },
    }),
    createField(ctx, 'upyun', 'path', 'input', userConfig.path || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN_MESSAGE_PATH')
      },
    }),
    createField(ctx, 'upyun', 'antiLeechToken', 'input', userConfig.antiLeechToken || '', false),
    createField(ctx, 'upyun', 'expireTime', 'input', userConfig.expireTime || '', false),
    createField(ctx, 'upyun', 'endpoint', 'input', userConfig.endpoint || DEFAULT_ENDPOINT, false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN_MESSAGE_ENDPOINT')
      },
    }),
  ]
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.upyun, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN')
    },
    handle,
    config,
  })
}
