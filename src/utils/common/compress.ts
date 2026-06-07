import sharp from 'sharp'

import type { IBuildInCompressOptions, IBuildInWaterMarkOptions, ILogger } from '../../types'
import { forceNumber, safeParse } from './config'

const validParam = (...params: any[]): boolean => {
  return params.every(param => {
    if (param === undefined || param === null) return false
    if (typeof param === 'string') return param !== ''
    if (typeof param === 'number') return param > 0
    if (typeof param === 'object') return Object.keys(param).length > 0
    return true
  })
}

const availableConvertFormatList = [
  'avif',
  'dz',
  'fits',
  'gif',
  'heif',
  'input',
  'jpeg',
  'jpg',
  'jp2',
  'jxl',
  'magick',
  'openslide',
  'pdf',
  'png',
  'ppm',
  'raw',
  'svg',
  'tiff',
  'tif',
  'v',
  'webp',
]

const imageFormatList = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'bmp',
  'tiff',
  'tif',
  'svg',
  'ico',
  'avif',
  'heif',
  'heic',
  'gif',
]

const validOutputFormat = (format: string): boolean => availableConvertFormatList.includes(format)

function formatOptions(options: IBuildInCompressOptions): IBuildInCompressOptions {
  const formatConvertObj =
    typeof options.formatConvertObj === 'string' ? safeParse(options.formatConvertObj) : options.formatConvertObj
  return {
    quality: forceNumber(options.quality),
    isConvert: options.isConvert || false,
    convertFormat: options.convertFormat || 'jpg',
    isReSize: options.isReSize || false,
    reSizeHeight: forceNumber(options.reSizeHeight),
    reSizeWidth: forceNumber(options.reSizeWidth),
    skipReSizeOfSmallImg: options.skipReSizeOfSmallImg || false,
    isReSizeByPercent: options.isReSizeByPercent || false,
    longEdgeAsHeight: options.longEdgeAsHeight || false,
    reSizePercent: forceNumber(options.reSizePercent),
    isRotate: options.isRotate || false,
    isFlip: options.isFlip || false,
    isFlop: options.isFlop || false,
    rotateDegree: forceNumber(options.rotateDegree),
    picBed: options.picBed || 'smms',
    formatConvertObj: formatConvertObj || {},
  }
}

type SharpFormatOptions = NonNullable<Parameters<sharp.Sharp['toFormat']>[1]>

function getSharpFormatOptions(format: string, quality: number): SharpFormatOptions {
  if (format === 'heif') {
    return {
      quality,
      compression: 'av1',
    }
  }
  return {
    quality,
    mozjpeg: true,
  }
}

function getOutputQuality(qualityOption: number | undefined): number {
  if (validParam(qualityOption) && qualityOption! < 100) {
    return Math.min(Math.max(Math.round(qualityOption!), 1), 100)
  }
  return 100
}

async function applyPercentResize(image: sharp.Sharp, options: IBuildInCompressOptions): Promise<sharp.Sharp> {
  if (!options.isReSizeByPercent || !validParam(options.reSizePercent)) return image

  const { width, height } = await image.metadata()
  if (!width || !height) return image

  return image.resize(
    Math.round((width * options.reSizePercent!) / 100),
    Math.round((height * options.reSizePercent!) / 100),
    {
      fit: 'inside',
    },
  )
}

async function applyDimensionResize(image: sharp.Sharp, options: IBuildInCompressOptions): Promise<sharp.Sharp> {
  if (options.isReSizeByPercent || !options.isReSize) return image

  const hasHeight = typeof options.reSizeHeight === 'number' && options.reSizeHeight > 0
  const hasWidth = typeof options.reSizeWidth === 'number' && options.reSizeWidth > 0

  if (hasHeight && hasWidth) {
    return image.resize(options.reSizeWidth, options.reSizeHeight, {
      fit: 'fill',
    })
  }

  const isHeightOnly = hasHeight && (typeof options.reSizeWidth !== 'number' || options.reSizeWidth === 0)
  const isWidthOnly = hasWidth && (typeof options.reSizeHeight !== 'number' || options.reSizeHeight === 0)
  if (!isHeightOnly && !isWidthOnly) return image

  const { width, height } = await image.metadata()
  if (!width || !height) return image

  if (isHeightOnly) {
    const targetEdge = options.longEdgeAsHeight && width > height ? width : height
    if (!options.skipReSizeOfSmallImg || (options.skipReSizeOfSmallImg && options.reSizeHeight! < targetEdge)) {
      const scaleRatio = options.reSizeHeight! / targetEdge
      return image.resize(Math.round(width * scaleRatio), Math.round(height * scaleRatio), {
        fit: 'inside',
      })
    }
  }

  if (
    isWidthOnly &&
    (!options.skipReSizeOfSmallImg || (options.skipReSizeOfSmallImg && options.reSizeWidth! < width))
  ) {
    const scaleRatio = options.reSizeWidth! / width
    return image.resize(options.reSizeWidth, Math.round(height * scaleRatio), {
      fit: 'inside',
    })
  }

  return image
}

async function applyResizeOptions(image: sharp.Sharp, options: IBuildInCompressOptions): Promise<sharp.Sharp> {
  return options.isReSizeByPercent ? applyPercentResize(image, options) : applyDimensionResize(image, options)
}

function applyTransformOptions(image: sharp.Sharp, options: IBuildInCompressOptions): sharp.Sharp {
  if (options.isRotate && options.rotateDegree) {
    image = image.rotate(options.rotateDegree, {
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
  }
  if (options.isFlip) {
    image = image.flip()
  }
  if (options.isFlop) {
    image = image.flop()
  }
  return image
}

function applyOutputFormat(
  image: sharp.Sharp,
  options: IBuildInCompressOptions,
  rawFormat: string,
  quality: number,
): sharp.Sharp {
  if (options.isConvert) {
    const newFormat = getConvertedFormat(options, rawFormat) as any
    return newFormat !== rawFormat ? image.toFormat(newFormat, getSharpFormatOptions(newFormat, quality)) : image
  }

  if (rawFormat && validOutputFormat(rawFormat)) {
    return image.toFormat(rawFormat as any, getSharpFormatOptions(rawFormat, quality))
  }

  return image.toFormat('jpg', {
    quality,
    mozjpeg: true,
  })
}

export async function imageCompress(
  img: Buffer,
  options: IBuildInCompressOptions,
  rawFormat: string,
  logger: ILogger,
): Promise<Buffer> {
  options = formatOptions(options)
  try {
    rawFormat = normalizeImageExt(rawFormat)
    if (!imageFormatList.includes(rawFormat) || rawFormat === 'gif') return img
    let image: sharp.Sharp = sharp(img, { animated: true })
    const quality = getOutputQuality(options.quality)
    image = await applyResizeOptions(image, options)
    image = applyTransformOptions(image, options)
    image = applyOutputFormat(image, options, rawFormat, quality)
    return await image.toBuffer()
  } catch (error: any) {
    logger.error(`Image process error: ${error}`)
    return img
  }
}

const normalizeImageExt = (ext: string): string => {
  return ext.toLowerCase().replace('.', '')
}

export function getConvertedFormat(options: IBuildInCompressOptions | undefined, rawFormat: string): string {
  options = formatOptions(options || {})
  rawFormat = normalizeImageExt(rawFormat)
  if (rawFormat === 'gif') return 'gif'
  let newFormat = options?.convertFormat || 'jpg'
  if (options?.formatConvertObj && Object.keys(options.formatConvertObj).length > 0) {
    const formatConvertObj = options.formatConvertObj
    const formatConvertObjKeys = Object.keys(formatConvertObj)
    if (formatConvertObjKeys.includes(rawFormat)) {
      newFormat = formatConvertObj[rawFormat]
      if (!validOutputFormat(newFormat)) {
        newFormat = 'jpg'
      }
    }
  }
  if (options?.picBed === 'imgur' && newFormat === 'webp') {
    newFormat = 'jpg'
  }
  return newFormat
}

export const isNeedAddWatermark = (
  watermarkOptions: IBuildInWaterMarkOptions | undefined,
  fileExt: string,
): boolean => {
  fileExt = normalizeImageExt(fileExt)
  return (
    !!watermarkOptions && !!watermarkOptions.isAddWatermark && imageFormatList.includes(fileExt) && fileExt !== 'svg'
  )
}

export const isNeedCompress = (compressOptions: IBuildInCompressOptions | undefined, fileExt: string): boolean => {
  if (!imageFormatList.includes(normalizeImageExt(fileExt)) || !compressOptions) return false

  const {
    quality,
    isReSizeByPercent,
    reSizePercent,
    isReSize,
    reSizeHeight,
    reSizeWidth,
    isRotate,
    rotateDegree,
    isConvert,
    convertFormat,
    isFlip,
    isFlop,
  } = formatOptions(compressOptions)

  if (validParam(quality) && quality! < 100) return true
  if (isReSizeByPercent && validParam(reSizePercent)) return true
  if (
    isReSize &&
    ((typeof reSizeHeight === 'number' && reSizeHeight > 0) || (typeof reSizeWidth === 'number' && reSizeWidth > 0))
  ) {
    return true
  }
  if (isRotate && rotateDegree) return true
  if (isFlip || isFlop) return true
  if (isConvert) {
    const newFormat = convertFormat || 'jpg'
    return normalizeImageExt(fileExt) !== normalizeImageExt(newFormat)
  }
  return false
}

export const removeExif = async (img: Buffer, fileExt: string): Promise<Buffer> => {
  fileExt = normalizeImageExt(fileExt)
  if (!imageFormatList.includes(fileExt) || fileExt === 'svg') return img
  return await sharp(img, {
    animated: true,
  }).toBuffer()
}
