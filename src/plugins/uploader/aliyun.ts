import { type IPicGo, type IPluginConfig, type IAliyunConfig, type IOldReqOptionsWithFullResponse } from '../../types'
import crypto from 'crypto'
import mime from 'mime-types'
import { IBuildInEvent } from '../../utils/enum'
import { type ILocalesKey } from '../../i18n/zh-CN'

const getCurrentUTCDate = (): string => new Date().toUTCString()

// generate OSS signature
const generateSignature = (options: IAliyunConfig, fileName: string): string => {
  const date = getCurrentUTCDate()
  const mimeType = mime.lookup(fileName) || 'application/octet-stream'
  const signString = `PUT\n\n${mimeType}\n${date}\n/${options.bucket}/${options.path}${fileName}`
  const signature = crypto.createHmac('sha1', options.accessKeySecret).update(signString).digest('base64')
  return `OSS ${options.accessKeyId}:${signature}`
}

const postOptions = (options: IAliyunConfig, fileName: string, signature: string, image: Buffer): IOldReqOptionsWithFullResponse => {
  return {
    method: 'PUT',
    url: `https://${options.bucket}.${options.area}.aliyuncs.com/${encodeURIComponent(options.path)}${encodeURIComponent(fileName)}`.replace(/%2F/g, '/'),
    headers: {
      Host: `${options.bucket}.${options.area}.aliyuncs.com`,
      Authorization: signature,
      Date: getCurrentUTCDate(),
      'Content-Type': mime.lookup(fileName)
    },
    body: image,
    resolveWithFullResponse: true
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const aliYunOptions = ctx.getConfig<IAliyunConfig>('picBed.aliyun')
  if (!aliYunOptions) {
    throw new Error('Can\'t find aliYun OSS config')
  }
  aliYunOptions.path = aliYunOptions.path.replace(/\/*$/, '').replace(/^\/*/, '') + '/'
  if (aliYunOptions.path === '/') {
    aliYunOptions.path = ''
  }
  try {
    const imgList = ctx.output
    const customUrl = aliYunOptions.customUrl
    const path = aliYunOptions.path ?? ''
    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        const signature = generateSignature(aliYunOptions, img.fileName)
        let image = img.buffer
        if (!image && img.base64Image) {
          image = Buffer.from(img.base64Image, 'base64')
        }
        const options = postOptions(aliYunOptions, img.fileName, signature, image)
        const body = await ctx.request(options)
        if (body.statusCode === 200) {
          delete img.base64Image
          delete img.buffer
          const optionUrl = aliYunOptions.options || ''
          if (customUrl) {
            img.imgUrl = `${customUrl}/${encodeURIComponent(path)}${encodeURIComponent(img.fileName)}${optionUrl}`.replace(/%2F/g, '/')
          } else {
            img.imgUrl = `https://${aliYunOptions.bucket}.${aliYunOptions.area}.aliyuncs.com/${encodeURIComponent(path)}${encodeURIComponent(img.fileName)}${optionUrl}`.replace(/%2F/g, '/')
          }
        } else {
          throw new Error('Upload failed')
        }
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
  const userConfig = ctx.getConfig<IAliyunConfig>('picBed.aliyun') || {}
  const config: IPluginConfig[] = [
    {
      name: 'accessKeyId',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_ACCESSKEYID') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_ACCESSKEYID') },
      default: userConfig.accessKeyId || '',
      required: true
    },
    {
      name: 'accessKeySecret',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_ACCESSKEYSECRET') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_ACCESSKEYSECRET') },
      default: userConfig.accessKeySecret || '',
      required: true
    },
    {
      name: 'bucket',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_BUCKET') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_BUCKET') },
      default: userConfig.bucket || '',
      required: true
    },
    {
      name: 'area',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_AREA') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_AREA') },
      default: userConfig.area || '',
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_MESSAGE_AREA') },
      required: true
    },
    {
      name: 'path',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_PATH') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_PATH') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_MESSAGE_PATH') },
      default: userConfig.path || '',
      required: false
    },
    {
      name: 'customUrl',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_CUSTOMURL') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_CUSTOMURL') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_MESSAGE_CUSTOMURL') },
      default: userConfig.customUrl || '',
      required: false
    },
    {
      name: 'options',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_OPTIONS') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_OPTIONS') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD_MESSAGE_OPTIONS') },
      default: userConfig.options || '',
      required: false
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('aliyun', {
    get name () {
      return ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD')
    },
    handle,
    config
  })
}
