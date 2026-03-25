import path from 'node:path'

import fs from 'fs-extra'
import { ensureDirSync } from 'fs-extra/esm'

import { ILocalesKey } from '../../i18n/zh-CN'
import { ILocalConfig, IPicGo, IPluginConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { getAndCheckConfig, getImageBuffer } from './helper'
import { buildInUploaderNames, encodePath, formatPathHelper } from './utils'

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const localConfig = getAndCheckConfig<ILocalConfig>(ctx, 'picBed.local', [])

  const uploadPath = localConfig.path || ''
  const customUrl = (localConfig.customUrl || '').replace(/\/$/, '')
  const webPath = formatPathHelper({
    path: localConfig.webPath?.replace(/\\/g, '/'),
  })
  for (const img of ctx.output) {
    if (!img.fileName) continue
    const imageBuffer = getImageBuffer(img)
    if (!imageBuffer) continue
    try {
      const imgTempPath = path.join(ctx.baseDir, 'imgTemp', 'local')
      const fileImgTempPath = path.join(imgTempPath, img.fileName)
      const fileUploadPath = path.join(uploadPath, img.fileName)
      try {
        // simply ensure the directory exists, ignore errors
        ensureDirSync(path.dirname(fileUploadPath))
        ensureDirSync(path.dirname(fileImgTempPath))
      } catch (_e) {}
      fs.writeFileSync(fileUploadPath, imageBuffer)
      fs.copyFileSync(fileUploadPath, fileImgTempPath)
      delete img.base64Image
      delete img.buffer
      if (customUrl) {
        img.imgUrl = `${customUrl}/${encodePath(`${webPath}${img.fileName}`)}`
      } else {
        img.imgUrl = path.join(uploadPath, img.fileName)
      }
      img.hash = path.join(uploadPath, img.fileName)
      img.galleryPath = `http://localhost:36699/local/${encodePath(img.fileName).replace(/^\//, '')}`
    } catch (e: any) {
      ctx.emit(IBuildInEvent.NOTIFICATION, {
        title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
        body: 'failed to upload image',
      })
      throw new Error(`Failed to upload image: ${e}`, { cause: e })
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
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_PATH')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_PATH')
      },
      default: userConfig.path || '',
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_MESSAGE_PATH')
      },
      required: true,
    },
    {
      name: 'customUrl',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_CUSTOMURL')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_CUSTOMURL')
      },
      default: userConfig.customUrl || '',
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_MESSAGE_CUSTOMURL')
      },
      required: false,
    },
    {
      name: 'webPath',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_WEBPATH')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_WEBPATH')
      },
      default: userConfig.webPath || '',
      required: false,
      get message() {
        return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL_MESSAGE_WEBPATH')
      },
    },
  ]
  return config
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.local, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL')
    },
    handle,
    config,
  })
}
