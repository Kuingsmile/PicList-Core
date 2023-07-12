import { IPicGo, IPluginConfig, ILocalConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'
import fs from 'fs-extra'
import path from 'path'

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const localConfig = ctx.getConfig<ILocalConfig>('picBed.local')
  if (!localConfig) {
    throw new Error('Can not find local config!')
  }
  const uploadPath = localConfig.path || ''
  let customUrl = localConfig.customUrl || ''
  if (customUrl) {
    customUrl = customUrl.replace(/\/$/, '')
  }
  let webPath = localConfig.webPath || ''
  if (webPath) {
    webPath = webPath.replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, '')
  }
  const imgList = ctx.output
  for (const img of imgList) {
    if (img.fileName && img.buffer) {
      let image = img.buffer
      if (!image && img.base64Image) {
        image = Buffer.from(img.base64Image, 'base64')
      }
      try {
        try {
          fs.ensureDirSync(uploadPath)
          fs.writeFileSync(path.join(uploadPath, img.fileName), image)
          fs.copyFileSync(path.join(uploadPath, img.fileName), path.join(ctx.baseDir, 'imgTemp', img.fileName))
          delete img.base64Image
          delete img.buffer
          if (customUrl) {
            if (webPath) {
              img.imgUrl = `${customUrl}/${encodeURIComponent(webPath)}/${encodeURIComponent(img.fileName)}`.replace(/%2F/g, '/')
            } else {
              img.imgUrl = `${customUrl}/${encodeURIComponent(img.fileName)}`.replace(/%2F/g, '/')
            }
          } else {
            img.imgUrl = path.join(uploadPath, img.fileName)
          }
          img.hash = path.join(uploadPath, img.fileName)
          img.galleryPath = `http://localhost:36699/${encodeURIComponent(img.fileName)}`
        } catch (e: any) {
          ctx.emit(IBuildInEvent.NOTIFICATION, {
            title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
            body: 'failed to upload image'
          })
          throw new Error('failed to upload image')
        }
      } catch (e: any) {
        ctx.log.error(e)
        throw e
      }
    }
  }
  return ctx
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<ILocalConfig>('picBed.local') || {}
  const config: IPluginConfig[] = [
    {
      name: 'path',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_PATH') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_PATH') },
      default: userConfig.path || '',
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_MESSAGE_PATH') },
      required: true
    },
    {
      name: 'customUrl',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_CUSTOMURL') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_CUSTOMURL') },
      default: userConfig.customUrl || '',
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_MESSAGE_CUSTOMURL') },
      required: false
    },
    {
      name: 'webPath',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_WEBPATH') },
      default: userConfig.webPath || '',
      required: false,
      get prefix () { return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_WEBPATH') },
      get message () { return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_MESSAGE_WEBPATH') }
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('local', {
    get name () { return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL') },
    handle,
    config
  })
}
