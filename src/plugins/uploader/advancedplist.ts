import { IPicGo, IPluginConfig, IOldReqOptions, IAdvancedPlistConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'
import { buildInUploaderNames } from './utils'

const postOptions = (
  image: Buffer,
  fileName: string,
  endpoint: string,
  method: any,
  headers: Record<string, string>,
  body: Record<string, string>,
  formDataKey: string
): IOldReqOptions => {
  const defaultHeaders = {
    contentType: 'multipart/form-data',
    'User-Agent': 'PicList'
  }
  return {
    method: method.toUpperCase(),
    url: endpoint,
    headers: {
      ...defaultHeaders,
      ...headers
    },
    formData: {
      [formDataKey]: {
        value: image,
        options: {
          filename: fileName
        }
      },
      ...body
    },
    json: true
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const advancedplistConfig = ctx.getConfig<IAdvancedPlistConfig>('picBed.advancedplist')
  if (!advancedplistConfig) throw new Error('Can not find advancedplist config')

  const imgList = ctx.output
  for (const img of imgList) {
    if (img.fileName && img.buffer) {
      let image = img.buffer
      if (!image && img.base64Image) {
        image = Buffer.from(img.base64Image, 'base64')
      }
      const postConfig = postOptions(
        image,
        img.fileName,
        advancedplistConfig.endpoint,
        advancedplistConfig.method,
        JSON.parse(advancedplistConfig.headers || '{}'),
        JSON.parse(advancedplistConfig.body || '{}'),
        advancedplistConfig.formDataKey || 'file'
      )

      let body = (await ctx.request(postConfig)) as any
      body = typeof body === 'string' ? JSON.parse(body) : body
      let imageUrl = body
      const resDataPath = advancedplistConfig.resDataPath || 'data.url'
      for (const key of resDataPath.split('.')) {
        if (imageUrl && typeof imageUrl === 'object' && key in imageUrl) {
          imageUrl = imageUrl[key]
        } else {
          imageUrl = undefined
          break
        }
      }
      if (imageUrl && typeof imageUrl === 'string') {
        delete img.base64Image
        delete img.buffer
        if (advancedplistConfig.customPrefix) {
          img.imgUrl = advancedplistConfig.customPrefix + imageUrl
        } else {
          img.imgUrl = imageUrl
        }
      } else {
        ctx.emit(IBuildInEvent.NOTIFICATION, {
          title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
          body: body.message
        })
        throw new Error(body.message)
      }
    }
  }
  return ctx
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IAdvancedPlistConfig>('picBed.advancedplist') || {}
  const config: IPluginConfig[] = [
    {
      name: 'endpoint',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_ENDPOINT')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_ENDPOINT')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_MESSAGE_ENDPOINT')
      },
      default: userConfig.endpoint || '',
      required: true
    },
    {
      name: 'method',
      type: 'list',
      choices: ['POST', 'PUT', 'GET'],
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_METHOD')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_METHOD')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_MESSAGE_METHOD')
      },
      default: userConfig.method || 'POST',
      required: false
    },
    {
      name: 'formDataKey',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_FORM_DATA_KEY')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_FORM_DATA_KEY')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_MESSAGE_FORM_DATA_KEY')
      },
      default: userConfig.formDataKey || 'file',
      required: false
    },
    {
      name: 'headers',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_HEADERS')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_HEADERS')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_MESSAGE_HEADERS')
      },
      default: userConfig.headers || '{}',
      required: false
    },
    {
      name: 'body',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_BODY')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_BODY')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_MESSAGE_BODY')
      },
      default: userConfig.body || '{}',
      required: false
    },
    {
      name: 'customPrefix',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_CUSTOM_PREFIX')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_CUSTOM_PREFIX')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_MESSAGE_CUSTOM_PREFIX')
      },
      default: userConfig.customPrefix || '',
      required: false
    },
    {
      name: 'resDataPath',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_RES_DATA_PATH')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_RES_DATA_PATH')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST_MESSAGE_RES_DATA_PATH')
      },
      default: userConfig.resDataPath || 'data.url',
      required: false
    }
  ]
  return config
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.advancedplist, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST')
    },
    handle,
    config
  })
}
