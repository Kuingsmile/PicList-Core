import path from 'node:path'

import fs from 'fs-extra'
import { ensureDirSync } from 'fs-extra/esm'

import { ILocalesKey } from '../../i18n/zh-CN'
import { ILocalConfig, IPicGo, IPluginConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { getAndCheckConfig, getImageBuffer } from './helper'
import { buildInUploaderNames, createField, encodePath, formatPathHelper } from './utils'

/** Creates a lazy message getter so configuration help follows the current language. */
const messageGetter = (ctx: IPicGo, key: Extract<ILocalesKey, `PICBED_LOCAL_MESSAGE_${string}`>) => ({
  get message() {
    return ctx.i18n.t(key)
  },
})

/** Validates containment while preserving relative configured paths in the returned filename. */
const getFilePathWithinRoot = (root: string, fileName: string): string => {
  const filePath = path.join(root, fileName)
  const relativePath = path.relative(path.resolve(root), path.resolve(filePath))
  // Reject rooted names on every platform, including Windows drive-relative names such as C:photo.png.
  if (
    path.win32.parse(fileName).root ||
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('Image filename must resolve to a file within the configured directory')
  }
  return filePath
}

/**
 * Writes images to the configured directory and gallery cache, returning local paths or custom public
 * URLs.
 */
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
      const fileName = img.fileName.replace(/\\/g, '/')
      const imgTempPath = path.join(ctx.baseDir, 'imgTemp', 'local')
      const fileImgTempPath = getFilePathWithinRoot(imgTempPath, fileName)
      const fileUploadPath = getFilePathWithinRoot(uploadPath, fileName)
      const uploadDir = path.dirname(fileUploadPath)
      // Recursive mkdir on an existing Windows drive root can fail with EPERM.
      if (!fs.existsSync(uploadDir)) ensureDirSync(uploadDir)
      ensureDirSync(path.dirname(fileImgTempPath))
      fs.writeFileSync(fileUploadPath, imageBuffer)
      fs.copyFileSync(fileUploadPath, fileImgTempPath)
      delete img.base64Image
      delete img.buffer
      if (customUrl) {
        img.imgUrl = `${customUrl}/${encodePath(`${webPath}${fileName}`)}`
      } else {
        img.imgUrl = fileUploadPath
      }
      img.hash = fileUploadPath
      img.galleryPath = `http://localhost:36699/local/${encodePath(fileName).replace(/^\//, '')}`
    } catch (e: any) {
      ctx.emit(IBuildInEvent.NOTIFICATION, {
        title: ctx.i18n.t('UPLOAD_FAILED'),
        body: 'failed to upload image',
      })
      throw new Error(`Failed to upload image: ${e}`, { cause: e })
    }
  }
  return ctx
}

/** Builds the local filesystem configuration form using saved values and localized field labels. */
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

/** Registers the built-in local filesystem uploader and its configuration form on the client. */
export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.local, {
    get name() {
      return ctx.i18n.t('PICBED_LOCAL')
    },
    handle,
    config,
  })
}
