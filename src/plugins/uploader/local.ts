import path from 'node:path'

import fs from 'fs-extra'
import { ensureDirSync } from 'fs-extra/esm'

import { ILocalesKey } from '../../i18n/zh-CN'
import { ILocalConfig, IPicGo, IPluginConfig } from '../../types'
import { getSha256 } from '../../utils/common/hash'
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

/** Stages on the target filesystem so a failed write or rename leaves the existing file intact. */
const replaceFile = (ctx: IPicGo, filePath: string, write: (stagedPath: string) => void): void => {
  const directory = path.dirname(filePath)
  // Recursive mkdir on an existing Windows drive root can fail with EPERM.
  if (!fs.existsSync(directory)) ensureDirSync(directory)
  const stagingDirectory = fs.mkdtempSync(path.join(directory, '.piclist-upload-'))
  const stagedPath = path.join(stagingDirectory, 'image')
  try {
    write(stagedPath)
    fs.renameSync(stagedPath, filePath)
  } finally {
    try {
      fs.removeSync(stagingDirectory)
    } catch (_error) {
      // Cleanup must not turn a committed replacement into an upload failure or hide its cause.
      ctx.log.warn('Failed to clean up local upload staging files.')
    }
  }
}

/**
 * Atomically replaces destination images, returning local paths or custom public URLs. The gallery
 * cache is best effort: failures log a warning and omit galleryPath without failing the upload.
 */
const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const localConfig = getAndCheckConfig<ILocalConfig>(ctx, 'picBed.local', [])

  const uploadPath = localConfig.path || ''
  const customUrl = (localConfig.customUrl || '').replace(/\/$/, '')
  const webPath = formatPathHelper({
    path: localConfig.webPath?.replace(/\\/g, '/'),
  })
  // Isolate same-named previews by destination, including configurations without a profile ID.
  const destinationKey = getSha256(path.resolve(uploadPath))
  const imgTempPath = path.join(ctx.baseDir, 'imgTemp', 'local', destinationKey)
  for (const img of ctx.output) {
    if (!img.fileName) continue
    const imageBuffer = getImageBuffer(img)
    if (!imageBuffer) continue
    try {
      const fileName = img.fileName.replace(/\\/g, '/')
      const fileImgTempPath = getFilePathWithinRoot(imgTempPath, fileName)
      const fileUploadPath = getFilePathWithinRoot(uploadPath, fileName)
      // Finish potentially fallible URL encoding before committing the destination.
      const imgUrl = customUrl ? `${customUrl}/${encodePath(`${webPath}${fileName}`)}` : fileUploadPath
      const galleryPath = `http://localhost:36699/local/${destinationKey}/${encodePath(fileName)}`
      replaceFile(ctx, fileUploadPath, stagedPath => fs.writeFileSync(stagedPath, imageBuffer))
      delete img.base64Image
      delete img.buffer
      img.imgUrl = imgUrl
      img.hash = fileUploadPath
      delete img.galleryPath
      try {
        replaceFile(ctx, fileImgTempPath, stagedPath => fs.copyFileSync(fileUploadPath, stagedPath))
        img.galleryPath = galleryPath
      } catch (_error) {
        ctx.log.warn('Local upload succeeded, but the gallery cache could not be updated.')
      }
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
