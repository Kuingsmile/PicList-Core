import { ILocalesKey } from '../../i18n/zh-CN'
import { IOldReqOptions, IPicGo, IPluginConfig, ISmmsConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { buildInUploaderNames, createField } from './utils'

const postOptions = (fileName: string, image: Buffer, apiToken: string, domain = ''): IOldReqOptions => {
  const seeDomain = domain || 's.ee'
  const url = `https://${seeDomain}${seeDomain === 's.ee' ? '/api/v1/file/upload' : '/api/v2/upload'}`
  return {
    method: 'POST',
    url,
    headers: {
      contentType: 'multipart/form-data',
      'User-Agent': 'PicList',
      Authorization: apiToken,
    },
    formData: {
      smfile: {
        value: image,
        options: { filename: fileName },
      },
      ssl: 'true',
    },
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const smmsConfig = ctx.getConfig<ISmmsConfig>('picBed.smms')
  if (!smmsConfig?.token?.trim()) {
    throw new Error('SM.MS token is required!')
  }
  const domain = smmsConfig.backupDomain?.trim()
  const imgList = ctx.output
  for (const img of imgList) {
    if (!img.fileName) continue

    const imageBuffer = img.buffer || (img.base64Image ? Buffer.from(img.base64Image, 'base64') : undefined)
    if (!imageBuffer) continue

    const postConfig = postOptions(img.fileName, imageBuffer, smmsConfig.token, domain)
    const res: string = await ctx.request(postConfig)
    const body = JSON.parse(res)

    if (body.code === 200 || body.message === 'success') {
      img.imgUrl = body.data.url
      img.hash = body.data.hash
    } else {
      const errorMsg = body.message || 'Upload failed'
      ctx.emit(IBuildInEvent.NOTIFICATION, {
        title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
        body: errorMsg,
      })
      throw new Error(errorMsg)
    }

    delete img.base64Image
    delete img.buffer
  }
  return ctx
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<ISmmsConfig>('picBed.smms') || {}
  return [
    createField(ctx, 'SMMS', 'token', 'input', userConfig.token || '', true, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SMMS_MESSAGE_TOKEN')
      },
    }),
    createField(ctx, 'SMMS', 'backupDomain', 'input', userConfig.backupDomain || '', false, undefined, {
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_SMMS_MESSAGE_BACKUP_DOMAIN')
      },
    }),
  ]
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.smms, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_SMMS')
    },
    handle,
    config,
  })
}
