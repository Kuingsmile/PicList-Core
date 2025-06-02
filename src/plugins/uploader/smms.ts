import axios from 'axios'
import { IPicGo, IPluginConfig, ISmmsConfig, IOldReqOptions } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'
import { buildInUploaderNames } from './utils'

const postOptions = (fileName: string, image: Buffer, apiToken: string, backupDomain = ''): IOldReqOptions => {
  let domain = backupDomain || 'sm.ms'
  domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return {
    method: 'POST',
    url: `https://${domain}/api/v2/upload`,
    headers: {
      contentType: 'multipart/form-data',
      'User-Agent': 'PicList',
      Authorization: apiToken
    },
    formData: {
      smfile: {
        value: image,
        options: {
          filename: fileName
        }
      },
      ssl: 'true'
    }
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const smmsConfig = ctx.getConfig<ISmmsConfig>('picBed.smms')
  if (!smmsConfig) throw new Error('Can not find smms config!')
  if (!smmsConfig.token || smmsConfig.token.trim() === '') throw new Error('SM.MS token is required!')

  const imgList = ctx.output
  for (const img of imgList) {
    if (img.fileName && img.buffer) {
      let image = img.buffer
      if (!image && img.base64Image) {
        image = Buffer.from(img.base64Image, 'base64')
      }
      const postConfig = postOptions(img.fileName, image, smmsConfig?.token, smmsConfig?.backupDomain)

      const res: string = await ctx.request(postConfig)
      const body = JSON.parse(res)
      if (body.code === 'success') {
        delete img.base64Image
        delete img.buffer
        img.imgUrl = body.data.url
        img.hash = body.data.hash
      } else if (body.code === 'image_repeated' && typeof body.images === 'string') {
        // do extra check since this error return is not documented at https://doc.sm.ms/#api-Image-Upload
        delete img.base64Image
        delete img.buffer
        img.imgUrl = body.images
        const uploadHistory = await axios.get('https://sm.ms/api/v2/upload_history', {
          headers: {
            Authorization: smmsConfig.token
          }
        })
        if (uploadHistory.data.code === 'success') {
          const images = uploadHistory.data.data
          for (const image of images) {
            if (image.url === body.images) {
              img.hash = image.hash
              break
            }
          }
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
  const userConfig = ctx.getConfig<ISmmsConfig>('picBed.smms') || {}
  const config: IPluginConfig[] = [
    {
      name: 'token',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SMMS_TOKEN')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SMMS_TOKEN')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SMMS_MESSAGE_TOKEN')
      },
      default: userConfig.token || '',
      required: true
    },
    {
      name: 'backupDomain',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SMMS_BACKUP_DOMAIN')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SMMS_BACKUP_DOMAIN')
      },
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SMMS_MESSAGE_BACKUP_DOMAIN')
      },
      default: userConfig.backupDomain || '',
      required: false
    }
  ]
  return config
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.smms, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_SMMS')
    },
    handle,
    config
  })
}
