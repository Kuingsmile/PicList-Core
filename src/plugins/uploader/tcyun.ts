import crypto from 'node:crypto'

import mime from 'mime'

import { ILocalesKey } from '../../i18n/zh-CN'
import { IOldReqOptionsWithFullResponse, IPicGo, IPluginConfig, ITcyunConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { getAndCheckConfig, getImageBuffer } from './helper'
import { buildInUploaderNames, createField, encodePath, formatPathHelper } from './utils'

export interface ISignature {
  signature: string
  appId: string
  bucket: string
  signTime: string
}

const generateSignature = (options: ITcyunConfig, fileName: string): ISignature => {
  const { secretId, secretKey, appId, bucket, version, area, endpoint, path } = options
  const isV4 = !version || version === 'v4'

  let signature: string
  let signTime = ''

  if (isV4) {
    const random = Math.floor(Math.random() * 10000000000)
    const current = Math.floor(Date.now() / 1000) - 1
    const expired = current + 3600
    const multiSignature = `a=${appId}&b=${bucket}&k=${secretId}&e=${expired}&t=${current}&r=${random}&f=`

    const signHexKey = crypto.createHmac('sha1', secretKey).update(multiSignature).digest()
    const tempString = Buffer.concat([signHexKey, Buffer.from(multiSignature)])
    signature = Buffer.from(tempString).toString('base64')
  } else {
    const today = Math.floor(Date.now() / 1000)
    signTime = `${today};${today + 86400}`
    const signKey = crypto.createHmac('sha1', secretKey).update(signTime).digest('hex')
    const defaultEndpoint = `cos.${area}.myqcloud.com`
    const httpString = `put\n/${path}${fileName}\n\nhost=${bucket}.${endpoint || defaultEndpoint}\n`
    const sha1edHttpString = crypto.createHash('sha1').update(httpString).digest('hex')
    const stringToSign = `sha1\n${signTime}\n${sha1edHttpString}\n`
    signature = crypto.createHmac('sha1', signKey).update(stringToSign).digest('hex')
  }

  return { signature, appId, bucket, signTime }
}

const postOptions = (
  options: ITcyunConfig,
  fileName: string,
  signature: ISignature,
  image: Buffer,
  version: string,
): IOldReqOptionsWithFullResponse => {
  const { area, path, bucket, endpoint, secretId } = options
  const isV4 = !options.version || options.version === 'v4'
  const userAgent = `PicGo;${version};null;null`

  if (isV4) {
    return {
      method: 'POST',
      url: `http://${area}.file.myqcloud.com/files/v2/${signature.appId}/${signature.bucket}/${encodeURI(path)}${fileName}`,
      headers: {
        Host: `${area}.file.myqcloud.com`,
        Authorization: signature.signature,
        contentType: 'multipart/form-data',
        'User-Agent': userAgent,
      },
      formData: { op: 'upload', filecontent: image },
      resolveWithFullResponse: true,
    }
  }

  const defaultEndpoint = `cos.${area}.myqcloud.com`
  const host = `${bucket}.${endpoint || defaultEndpoint}`
  return {
    method: 'PUT',
    url: `http://${host}/${encodePath(`${path}${fileName}`)}`,
    headers: {
      Host: host,
      Authorization: `q-sign-algorithm=sha1&q-ak=${secretId}&q-sign-time=${signature.signTime}&q-key-time=${signature.signTime}&q-header-list=host&q-url-param-list=&q-signature=${signature.signature}`,
      contentType: mime.getType(fileName) || 'application/octet-stream',
      'User-Agent': userAgent,
    },
    body: image,
    resolveWithFullResponse: true,
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo | boolean> => {
  const tcYunOptions = getAndCheckConfig<ITcyunConfig>(ctx, 'picBed.tcyun', [])

  try {
    const customUrl = (tcYunOptions.customUrl || '').replace(/\/$/, '')
    const path = formatPathHelper({ path: tcYunOptions.path })
    const webPath = formatPathHelper({ path: tcYunOptions.webPath })
    tcYunOptions.path = path
    const useV4 = !tcYunOptions.version || tcYunOptions.version === 'v4'

    for (const img of ctx.output) {
      if (!img.fileName) continue
      const imageBuffer = getImageBuffer(img)
      if (!imageBuffer) continue

      const signature = generateSignature(tcYunOptions, img.fileName)
      const options = postOptions(tcYunOptions, img.fileName, signature, imageBuffer, ctx.GUI_VERSION || ctx.VERSION)
      const res = await ctx.request(options).catch((err: Error) => ({
        statusCode: 400,
        body: { msg: ctx.i18n.translate<ILocalesKey>('AUTH_FAILED'), err },
      }))
      const body = useV4 && typeof res === 'string' ? JSON.parse(res) : res
      if (body.statusCode === 400) {
        throw body?.body?.err || new Error(body?.body?.msg || body?.body?.message)
      }
      const optionUrl = tcYunOptions.options || ''
      const slim = !!tcYunOptions.slim
      delete img.base64Image
      delete img.buffer
      if (useV4 && body.message === 'SUCCESS') {
        img.imgUrl = customUrl
          ? `${customUrl}/${encodePath(`${webPath || path}${img.fileName}`)}${optionUrl}`
          : `${body.data.source_url}${optionUrl}`
      } else if (!useV4 && body?.statusCode === 200) {
        if (customUrl) {
          img.imgUrl = `${customUrl}/${encodePath(`${webPath || path}${img.fileName}`)}${optionUrl}`
        } else {
          const endpoint = tcYunOptions.endpoint || `cos.${tcYunOptions.area}.myqcloud.com`
          img.imgUrl = `https://${tcYunOptions.bucket}.${endpoint}/${encodePath(`${path}${img.fileName}`)}${optionUrl}`
        }
      } else {
        throw new Error((res as any).body?.msg || 'Upload failed')
      }

      if (slim) {
        img.imgUrl += optionUrl ? '&imageSlim' : '?imageSlim'
      }
    }
    return ctx
  } catch (err: any) {
    if ((!tcYunOptions.version || tcYunOptions.version === 'v4') && err.error) {
      try {
        const body = JSON.parse(err.error)
        ctx.emit(IBuildInEvent.NOTIFICATION, {
          title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
          body: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED_REASON', { code: body.code }),
          text: 'https://cloud.tencent.com/document/product/436/8432',
        })
      } catch (_e) {
        /* empty */
      }
    }
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<ITcyunConfig>('picBed.tcyun') || {}

  return [
    createField(ctx, 'TENCENTCLOUD', 'version', 'list', 'v5', false, undefined, { choices: ['v4', 'v5'] }),
    createField(ctx, 'TENCENTCLOUD', 'secretId', 'input', userConfig.secretId || '', true),
    createField(ctx, 'TENCENTCLOUD', 'secretKey', 'input', userConfig.secretKey || '', true),
    createField(ctx, 'TENCENTCLOUD', 'bucket', 'input', userConfig.bucket || '', true),
    createField(ctx, 'TENCENTCLOUD', 'appId', 'input', userConfig.appId || '', true, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD_MESSAGE_APPID')
      },
    }),
    createField(ctx, 'TENCENTCLOUD', 'area', 'input', userConfig.area || '', true, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD_MESSAGE_AREA')
      },
    }),
    createField(ctx, 'TENCENTCLOUD', 'endpoint', 'input', userConfig.endpoint || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD_MESSAGE_ENDPOINT')
      },
    }),
    createField(ctx, 'TENCENTCLOUD', 'path', 'input', userConfig.path || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD_MESSAGE_PATH')
      },
    }),
    createField(ctx, 'TENCENTCLOUD', 'webPath', 'input', userConfig.webPath || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD_MESSAGE_WEBPATH')
      },
    }),
    createField(ctx, 'TENCENTCLOUD', 'customUrl', 'input', userConfig.customUrl || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD_MESSAGE_CUSTOMURL')
      },
    }),
    createField(ctx, 'TENCENTCLOUD', 'options', 'input', userConfig.options || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD_MESSAGE_OPTIONS')
      },
    }),
    createField(ctx, 'TENCENTCLOUD', 'slim', 'confirm', !!userConfig.slim, false, undefined, {
      get confirmText() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD_SLIM_CONFIRM')
      },
      get cancelText() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD_SLIM_CANCEL')
      },
      get tips() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD_SLIM_TIP')
      },
    }),
  ]
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.tcyun, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD')
    },
    handle,
    config,
  })
}
