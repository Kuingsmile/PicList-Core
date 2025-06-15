import { ILocalesKey } from '../../i18n/zh-CN'
import { IAdvancedPlistConfig,IOldReqOptions, IPicGo, IPluginConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { buildInUploaderNames } from './utils'

const postOptions = (
  image: Buffer,
  fileName: string,
  endpoint: string,
  method: string,
  headers: Record<string, string>,
  body: Record<string, string>,
  formDataKey: string
): IOldReqOptions => ({
  method: method.toUpperCase() as any,
  url: endpoint,
  headers: {
    contentType: 'multipart/form-data',
    'User-Agent': 'PicList',
    ...headers
  },
  formData: {
    [formDataKey]: {
      value: image,
      options: { filename: fileName }
    },
    ...body
  },
  json: true
})

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const advancedplistConfig = ctx.getConfig<IAdvancedPlistConfig>('picBed.advancedplist')
  if (!advancedplistConfig) throw new Error('Can not find advancedplist config')

  const imgList = ctx.output
  for (const img of imgList) {
    if (img.fileName && img.buffer) {
      const image = img.buffer || (img.base64Image ? Buffer.from(img.base64Image, 'base64') : null)
      if (!image) continue

      const postConfig = postOptions(
        image,
        img.fileName,
        advancedplistConfig.endpoint,
        advancedplistConfig.method || 'POST',
        JSON.parse(advancedplistConfig.headers || '{}'),
        JSON.parse(advancedplistConfig.body || '{}'),
        advancedplistConfig.formDataKey || 'file'
      )

      let body = (await ctx.request(postConfig)) as any
      body = typeof body === 'string' ? JSON.parse(body) : body

      // Extract image URL from response using resDataPath
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
        if (advancedplistConfig.webPath) {
          const fileName = imageUrl.split('/').pop() || imageUrl
          const webPath = advancedplistConfig.webPath.endsWith('/')
            ? advancedplistConfig.webPath
            : advancedplistConfig.webPath + '/'
          imageUrl = webPath + fileName
        }
        img.imgUrl = advancedplistConfig.customPrefix ? advancedplistConfig.customPrefix + imageUrl : imageUrl
      } else {
        ctx.emit(IBuildInEvent.NOTIFICATION, {
          title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
          body: body.message
        })
        console.error('AdvancedPlist upload failed:', body)
        throw new Error(body.message)
      }
    }
  }
  return ctx
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IAdvancedPlistConfig>('picBed.advancedplist') || {}

  const createConfigField = (
    name: string,
    type: string,
    defaultValue: any,
    required: boolean = false,
    extras?: any
  ) => ({
    name,
    type,
    get prefix() {
      return ctx.i18n.translate<ILocalesKey>(`PICBED_ADVANCEDPLIST_${name.toUpperCase()}` as ILocalesKey)
    },
    get alias() {
      return ctx.i18n.translate<ILocalesKey>(`PICBED_ADVANCEDPLIST_${name.toUpperCase()}` as ILocalesKey)
    },
    get message() {
      return ctx.i18n.translate<ILocalesKey>(`PICBED_ADVANCEDPLIST_MESSAGE_${name.toUpperCase()}` as ILocalesKey)
    },
    default: userConfig[name as keyof IAdvancedPlistConfig] || defaultValue,
    required,
    ...extras
  })

  return [
    createConfigField('endpoint', 'input', '', true),
    createConfigField('method', 'list', 'POST', false, { choices: ['POST', 'PUT', 'GET'] }),
    createConfigField('formDataKey', 'input', 'file'),
    createConfigField('headers', 'input', '{}'),
    createConfigField('body', 'input', '{}'),
    createConfigField('customPrefix', 'input', ''),
    createConfigField('webPath', 'input', ''),
    createConfigField('resDataPath', 'input', 'data.url')
  ]
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
