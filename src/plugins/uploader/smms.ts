import { ILocalesKey } from '../../i18n/zh-CN'
import { IOldReqOptions, IPicGo, IPluginConfig, ISmmsConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { getAndCheckConfig, getImageBuffer } from './helper'
import { buildInUploaderNames, createField } from './utils'

const postOptions = (fileName: string, image: Buffer, apiToken: string): IOldReqOptions => {
  return {
    method: 'POST',
    url: 'https://s.ee/api/v1/file/upload',
    headers: {
      contentType: 'multipart/form-data',
      'User-Agent': 'PicList',
      Authorization: apiToken.trim(),
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
  const smmsConfig = getAndCheckConfig<ISmmsConfig>(ctx, 'picBed.smms', ['token'])
  for (const img of ctx.output) {
    if (!img.fileName) continue
    const imageBuffer = getImageBuffer(img)
    if (!imageBuffer) continue

    const postConfig = postOptions(img.fileName, imageBuffer, smmsConfig.token)
    const res: string = await ctx.request(postConfig)
    const body = JSON.parse(res)
    if (body.code !== 200 && body.message !== 'success') {
      const errorMsg = body.message || 'Upload failed'
      ctx.emit(IBuildInEvent.NOTIFICATION, {
        title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
        body: errorMsg,
      })
      throw new Error(errorMsg)
    }
    img.imgUrl = body.data.url
    img.hash = body.data.hash
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
