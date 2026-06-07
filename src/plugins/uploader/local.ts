import path from 'node:path'

import fs from 'fs-extra'
import { ensureDirSync } from 'fs-extra/esm'

import { ILocalesKey } from '../../i18n/zh-CN'
import { ILocalConfig, IPicGo, IPluginConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { getAndCheckConfig, getImageBuffer } from './helper'
import { buildInUploaderNames, createField, encodePath, formatPathHelper } from './utils'

const messageGetter = (ctx: IPicGo, key: ILocalesKey) => ({
  get message() {
    return ctx.i18n.translate<ILocalesKey>(key)
  },
})

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
    createField(
      ctx,
      'local',
      'path',
      'input',
      userConfig.path || '',
      true,
      undefined,
      messageGetter(ctx, 'PICBED_LOCAL_MESSAGE_PATH'),
    ),
    createField(
      ctx,
      'local',
      'customUrl',
      'input',
      userConfig.customUrl || '',
      false,
      undefined,
      messageGetter(ctx, 'PICBED_LOCAL_MESSAGE_CUSTOMURL'),
    ),
    createField(
      ctx,
      'local',
      'webPath',
      'input',
      userConfig.webPath || '',
      false,
      undefined,
      messageGetter(ctx, 'PICBED_LOCAL_MESSAGE_WEBPATH'),
    ),
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
