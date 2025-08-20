import crypto from 'node:crypto'

import mime from 'mime'

import { ILocalesKey } from '../../i18n/zh-CN'
import { IAliyunConfig, IOldReqOptionsWithFullResponse, IPicGo, IPluginConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { buildInUploaderNames, createField, encodePath, formatPathHelper } from './utils'

const getCurrentUTCDate = (): string => new Date().toUTCString()

// generate OSS signature
const generateSignature = (options: IAliyunConfig, fileName: string): string => {
  const date = getCurrentUTCDate()
  const mimeType = mime.getType(fileName) || 'application/octet-stream'
  const signString = `PUT\n\n${mimeType}\n${date}\n/${options.bucket}/${options.path}${fileName}`
  const signature = crypto.createHmac('sha1', options.accessKeySecret).update(signString).digest('base64')
  return `OSS ${options.accessKeyId}:${signature}`
}

const postOptions = (
  options: IAliyunConfig,
  fileName: string,
  signature: string,
  image: Buffer
): IOldReqOptionsWithFullResponse => ({
  method: 'PUT',
  url: `https://${options.bucket}.${options.area}.aliyuncs.com/${encodePath(`${options.path}${fileName}`)}`,
  headers: {
    Host: `${options.bucket}.${options.area}.aliyuncs.com`,
    Authorization: signature,
    Date: getCurrentUTCDate(),
    'Content-Type': mime.getType(fileName) || 'application/octet-stream'
  },
  body: image,
  resolveWithFullResponse: true
})

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const aliYunOptions = ctx.getConfig<IAliyunConfig>('picBed.aliyun')
  if (!aliYunOptions) throw new Error("Can't find aliYun OSS config")

  aliYunOptions.path = formatPathHelper({ path: aliYunOptions.path })
  const webPath = formatPathHelper({ path: aliYunOptions.webPath })

  try {
    const { output: imgList } = ctx
    const customUrl = (aliYunOptions.customUrl || '').replace(/\/$/, '')
    const { path, bucket, area, options: urlOptions = '' } = aliYunOptions

    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        const signature = generateSignature(aliYunOptions, img.fileName)
        const image = img.buffer || Buffer.from(img.base64Image!, 'base64')
        const options = postOptions(aliYunOptions, img.fileName, signature, image)
        const body = await ctx.request(options)

        if (body.statusCode === 200) {
          delete img.base64Image
          delete img.buffer
          const encodedPath = encodePath(`${webPath || path}${img.fileName}`)
          img.imgUrl = customUrl
            ? `${customUrl}/${encodedPath}${urlOptions}`
            : `https://${bucket}.${area}.aliyuncs.com/${encodedPath}${urlOptions}`
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
  const userConfig = ctx.getConfig<IAliyunConfig>('picBed.aliyun') || {}
  return [
    createField(ctx, 'alicloud', 'accessKeyId', 'input', userConfig.accessKeyId || '', true),
    createField(ctx, 'alicloud', 'accessKeySecret', 'input', userConfig.accessKeySecret || '', true),
    createField(ctx, 'alicloud', 'bucket', 'input', userConfig.bucket || '', true),
    createField(ctx, 'alicloud', 'area', 'input', userConfig.area || '', true, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_MESSAGE_AREA')
      }
    }),
    createField(ctx, 'alicloud', 'path', 'input', userConfig.path || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_MESSAGE_PATH')
      }
    }),
    createField(ctx, 'alicloud', 'webPath', 'input', userConfig.webPath || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_MESSAGE_WEBPATH')
      }
    }),
    createField(ctx, 'alicloud', 'customUrl', 'input', userConfig.customUrl || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_MESSAGE_CUSTOMURL')
      }
    }),
    createField(ctx, 'alicloud', 'options', 'input', userConfig.options || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_MESSAGE_OPTIONS')
      }
    })
  ]
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.aliyun, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD')
    },
    handle,
    config
  })
}
