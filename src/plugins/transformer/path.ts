import dayjs from 'dayjs'
import mime from 'mime'

import { IImgInfo, IImgSize, IPathTransformedImgInfo, IPicGo } from '../../types'
import { getFSFile, getImageSize, getURLFile, isUrl } from '../../utils/common'
import { takePreprocessedInput } from '../../utils/preprocessedInput'

const TIMESTAMP_FORMAT = 'YYYYMMDDHHmmssSSS'
// Share millisecond reservations across overlapping uploads in this process.
let nextGeneratedTime = 0

const getGeneratedFileName = (extname: string, usedNames: Set<string>): string => {
  let fileName: string
  do {
    if (Date.now() >= nextGeneratedTime) {
      fileName = `${dayjs().format(TIMESTAMP_FORMAT)}${extname}`
      nextGeneratedTime = Date.now() + 1
    } else {
      fileName = `${dayjs(nextGeneratedTime).format(TIMESTAMP_FORMAT)}${extname}`
      nextGeneratedTime++
    }
  } while (usedNames.has(fileName.toLowerCase()))
  usedNames.add(fileName.toLowerCase())
  return fileName
}

/**
 * Loads files, URLs, or buffers into image records concurrently and drops failed inputs.
 *
 * @remarks
 * Each successful record retains its original inputIndex so renaming remains correct after filtering.
 */
const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const results: IImgInfo[] = ctx.output
  const unnamed: { image: IImgInfo; extname: string }[] = []
  await Promise.all(
    ctx.input.map(async (item: string | Buffer, index: number) => {
      let info: IPathTransformedImgInfo
      const cached = takePreprocessedInput(ctx, index, item)
      if (cached) {
        info = cached
      } else if (Buffer.isBuffer(item)) {
        info = {
          success: true,
          buffer: item,
          fileName: '',
          extname: '',
        }
      } else if (isUrl(item)) {
        info = await getURLFile(item, ctx)
      } else {
        info = await getFSFile(item)
      }
      if (info.success && info.buffer) {
        const imgSize = getImgSize(ctx, info.buffer, item)
        const extname = info.extname || imgSize.extname || '.png'
        results[index] = {
          inputIndex: index,
          buffer: info.buffer,
          fileName: info.fileName,
          width: imgSize.width,
          height: imgSize.height,
          filePath: info.filePath,
          extname: info.extname,
          mimeType: mime.getType(extname) || 'application/octet-stream',
        }
        if (!info.fileName) unnamed.push({ image: results[index], extname })
      } else {
        ctx.log.error(info.reason)
      }
    }),
  )
  // remove empty item
  ctx.output = results.filter(item => item)
  if (unnamed.length) {
    // A later input may already own a timestamp filename, including on case-insensitive filesystems.
    const usedNames = new Set(ctx.output.map(image => image.fileName?.toLowerCase() || ''))
    for (const { image, extname } of unnamed) image.fileName = getGeneratedFileName(extname, usedNames)
  }
  return ctx
}

/** Reads image dimensions and logs when the 200×200 fallback must be used. */
const getImgSize = (ctx: IPicGo, file: Buffer, path: string | Buffer): IImgSize => {
  const imageSize = getImageSize(file)
  if (!imageSize.real) {
    if (typeof path === 'string') {
      ctx.log.warn(`can't get ${path}'s image size`)
    } else {
      ctx.log.warn("can't get image size")
    }
    ctx.log.warn('fallback to 200 * 200')
  }
  return imageSize
}

export default {
  handle,
}
