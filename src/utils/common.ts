import crypto from 'node:crypto'
import path, { dirname } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import fs from 'fs-extra'
import { readJSONSync } from 'fs-extra/esm'
import { imageSize } from 'image-size'
import mime from 'mime'
import sharp from 'sharp'
import TextToSVG from 'text-to-svg'
import { v4 as uuidv4 } from 'uuid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

import type {
  IBuildInCompressOptions,
  IBuildInCompressOptionsTreated,
  IBuildInWaterMarkOptions,
  IBuildInWaterMarkOptionsTreated,
  IImgSize,
  ILogger,
  IPathTransformedImgInfo,
  IPicGo,
  IPluginNameType,
} from '../types'

const mask = 0b111111
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

// --- rename helper ---
export function randomStringGenerator(length: number): string {
  const out = new Array(length)
  let i = 0
  let pool = 0
  let bits = 0
  while (i < length) {
    if (bits < 6) {
      pool = (pool << 30) | ((Math.random() * 0x40000000) >>> 0)
      bits += 30
      continue
    }
    const idx = pool & mask
    pool >>>= 6
    bits -= 6
    if (idx < 62) out[i++] = chars[idx]
  }
  return out.join('')
}

export function renameFileNameWithTimestamp(oldName: string): string {
  return `${Math.floor(Date.now() / 1000)}${randomStringGenerator(5)}${path.extname(oldName)}`
}

export function renameFileNameWithRandomString(oldName: string, length: number = 5): string {
  return `${randomStringGenerator(length)}${path.extname(oldName)}`
}

function formatHelper(num: number): string {
  return num.toString().length === 1 ? `0${num}` : num.toString()
}

export function getMd5(input: crypto.BinaryLike): string {
  return crypto.createHash('md5').update(input).digest('hex')
}

function getSha256(input: crypto.BinaryLike): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function getSha1(input: crypto.BinaryLike): string {
  return crypto.createHash('sha1').update(input).digest('hex')
}

export function renameFileNameWithCustomString(
  oldName: string,
  customFormat: string,
  affixFileName?: string,
  fileBuffer?: crypto.BinaryLike,
): string {
  const now = new Date()
  const year = now.getFullYear().toString()
  const filebasename = path.basename(oldName, path.extname(oldName))
  const conversionMap: Record<string, () => string> = {
    '{Y}': () => year,
    '{y}': () => year.slice(2),
    '{m}': () => formatHelper(now.getMonth() + 1),
    '{d}': () => formatHelper(now.getDate()),
    '{h}': () => formatHelper(now.getHours()),
    '{i}': () => formatHelper(now.getMinutes()),
    '{s}': () => formatHelper(now.getSeconds()),
    '{ms}': () => now.getMilliseconds().toString().padStart(3, '0'),
    '{md5}': () => getMd5(fileBuffer || filebasename),
    '{sha1}': () => getSha1(fileBuffer || filebasename),
    '{sha256}': () => getSha256(fileBuffer || filebasename),
    '{md5-16}': () => getMd5(fileBuffer || filebasename).slice(0, 16),
    '{filename}': () => (affixFileName ? path.basename(affixFileName, path.extname(affixFileName)) : filebasename),
    '{uuid}': () => uuidv4().replace(/-/g, ''),
    '{timestampS}': () => Math.floor(now.getTime() / 1000).toString(),
    '{timestamp}': () => now.getTime().toString(),
  }
  if (
    customFormat === undefined ||
    (!Object.keys(conversionMap).some(item => customFormat.includes(item)) &&
      !customFormat.includes('localFolder:') &&
      !customFormat.includes('str-') &&
      !/{sha256-\d+}/.test(customFormat) &&
      !/{sha1-\d+}/.test(customFormat))
  ) {
    return oldName
  }
  const ext = path.extname(oldName)
  let newName =
    Object.keys(conversionMap).reduce((acc, cur) => {
      return acc.replace(new RegExp(cur, 'g'), conversionMap[cur]())
    }, customFormat) + ext
  const strRegex = /{str-(\d+)}/gi
  const sha256Regex = /{sha256-(\d+)}/gi
  const sha1Regex = /{sha1-(\d+)}/gi
  newName = newName.replace(strRegex, (_, group1) => {
    const length = parseInt(group1, 10)
    return randomStringGenerator(length)
  })
  newName = newName.replace(sha256Regex, (_, group1) => {
    const length = parseInt(group1, 10)
    return getSha256(fileBuffer || filebasename).slice(0, length)
  })
  newName = newName.replace(sha1Regex, (_, group1) => {
    const length = parseInt(group1, 10)
    return getSha1(fileBuffer || filebasename).slice(0, length)
  })
  newName = newName.replace(/{(localFolder:?(\d+)?)}/gi, (_result, key, count) => {
    count = Math.max(1, count || 0)
    const paths = path.dirname(oldName).split(path.sep)
    key = paths.slice(0 - count).reduce((a, b) => `${a}/${b}`)
    return key.replace(/:/g, '')
  })
  return newName
}

// --- url helper ---
export const isUrl = (url: string): boolean => /^https?:\/\//.test(url)

export const isUrlEncode = (url: string): boolean => {
  url = url || ''
  try {
    // the whole url encode or decode should not use encodeURIComponent or decodeURIComponent
    return url !== decodeURI(url)
  } catch (_e) {
    return false
  }
}

export const handleUrlEncode = (url: string): string => {
  if (!isUrlEncode(url)) {
    url = encodeURI(url)
  }
  return url
}

// --- image helper ---
export const getImageSize = (file: Buffer): IImgSize => {
  try {
    const { width = 0, height = 0, type } = imageSize(file)
    const extname = type ? `.${type}` : '.png'
    return {
      real: true,
      width,
      height,
      extname,
    }
  } catch (_e) {
    // fallback to 200 * 200
    return {
      real: false,
      width: 200,
      height: 200,
      extname: '.png',
    }
  }
}

export const getFSFile = async (filePath: string): Promise<IPathTransformedImgInfo> => {
  try {
    return {
      extname: path.extname(filePath),
      fileName: path.basename(filePath),
      filePath,
      buffer: await fs.readFile(filePath),
      success: true,
    }
  } catch {
    return {
      reason: `read file ${filePath} error`,
      success: false,
    }
  }
}

function getImageExtensionFromMime(contentType: string): string {
  if (!contentType) return ''
  const pureMime = contentType.toLocaleLowerCase().split(';')[0].trim()
  if (!pureMime.startsWith('image/')) return ''
  const ext = mime.getExtension(pureMime)
  return ext ? `.${ext}` : ''
}

export function getImageTypeByMagicNumber(buffer: Buffer | Uint8Array): string {
  if (!buffer || buffer.length < 4) return ''

  const getHex = (start: number, end: number) =>
    Array.from(buffer.subarray(start, end))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()

  const hex4 = getHex(0, 4)
  const hex3 = getHex(0, 3)
  const hex2 = getHex(0, 2)

  if (hex3 === 'FFD8FF') return '.jpg'
  if (hex4 === '89504E47') return '.png'
  if (hex4 === '47494638') return '.gif'
  if (hex2 === '424D') return '.bmp'

  if (hex4 === '52494646') {
    const webpHeader = getHex(8, 12)
    if (webpHeader === '57454250') {
      return '.webp'
    }
  }
  return ''
}

export const getURLFile = async (url: string, ctx: IPicGo): Promise<IPathTransformedImgInfo> => {
  url = handleUrlEncode(url)
  let timeoutId: NodeJS.Timeout
  const requestFn = new Promise<IPathTransformedImgInfo>((resolve, reject) => {
    ;(async () => {
      try {
        const { res, headers } = await ctx
          .request({
            method: 'get',
            url,
            resolveWithFullResponse: true,
            responseType: 'arraybuffer',
          })
          .then(resp => {
            return { res: resp.data as Buffer, headers: resp.headers }
          })
        clearTimeout(timeoutId)
        const urlPath = new URL(url).pathname
        let extname = ''
        try {
          const urlParams = new URL(url).searchParams
          extname = urlParams.get('wx_fmt') || path.extname(urlPath) || ''
        } catch (_e) {
          extname = path.extname(urlPath) || ''
        }
        const contentType = headers['content-type'] || headers['Content-Type'] || ''
        if (!extname && contentType) {
          extname = getImageExtensionFromMime(String(contentType))
        }
        if (!extname) {
          extname = getImageTypeByMagicNumber(res)
        }
        if (!extname.startsWith('.') && extname) {
          extname = `.${extname}`
        }
        resolve({
          buffer: res,
          fileName: path.basename(urlPath),
          extname,
          success: true,
        })
      } catch (error: any) {
        clearTimeout(timeoutId)
        resolve({
          success: false,
          reason: `request ${url} error, ${error?.message ?? ''}`,
        })
      }
    })().catch(reject)
  })
  const timeoutPromise = new Promise<IPathTransformedImgInfo>((resolve): void => {
    timeoutId = setTimeout(() => {
      resolve({
        success: false,
        reason: `request ${url} timeout`,
      })
    }, 30000)
  })
  return Promise.race([requestFn, timeoutPromise])
}

// --- plugin helper ---
export const getPluginNameType = (name: string): IPluginNameType => {
  if (/^@[^/]+\/picgo-plugin-/.test(name)) {
    return 'scope'
  } else if (name.startsWith('picgo-plugin-')) {
    return 'normal'
  } else if (isSimpleName(name)) {
    return 'simple'
  }
  return 'unknown'
}

export const isSimpleName = (nameOrPath: string): boolean => {
  if (path.isAbsolute(nameOrPath)) {
    return false
  }
  const pluginPath = path.join(process.cwd(), nameOrPath)
  if (fs.existsSync(pluginPath)) {
    return false
  }
  if (nameOrPath.includes('/') || nameOrPath.includes('\\')) {
    return false
  }
  return true
}

export const handleStreamlinePluginName = (name: string): string => {
  if (/^@[^/]+\/picgo-plugin-/.test(name)) {
    return name.replace(/^@[^/]+\/picgo-plugin-/, '')
  } else {
    return name.replace(/picgo-plugin-/, '')
  }
}

export const handleCompletePluginName = (name: string, scope = ''): string =>
  scope ? `@${scope}/picgo-plugin-${name}` : `picgo-plugin-${name}`

export const getProcessPluginName = (nameOrPath: string, logger: ILogger | Console = console): string => {
  const pluginNameType = getPluginNameType(nameOrPath)
  switch (pluginNameType) {
    case 'normal':
    case 'scope':
      return nameOrPath
    case 'simple':
      return handleCompletePluginName(nameOrPath)
    default: {
      let pluginPath = nameOrPath
      if (path.isAbsolute(nameOrPath) && fs.existsSync(nameOrPath)) {
        return handleUnixStylePath(pluginPath)
      }
      pluginPath = path.join(process.cwd(), nameOrPath)
      if (fs.existsSync(pluginPath)) {
        return handleUnixStylePath(pluginPath)
      }
      logger.warn(`Can't find plugin ${nameOrPath}`)
      return ''
    }
  }
}

export const getNormalPluginName = (nameOrPath: string, logger: ILogger | Console = console): string => {
  const pluginNameType = getPluginNameType(nameOrPath)
  switch (pluginNameType) {
    case 'normal':
      return removePluginVersion(nameOrPath)
    case 'scope':
      return removePluginVersion(nameOrPath, true)
    case 'simple':
      return removePluginVersion(handleCompletePluginName(nameOrPath))
    default: {
      if (!fs.existsSync(nameOrPath)) {
        logger.warn(`Can't find plugin: ${nameOrPath}`)
        return ''
      }
      const packageJSONPath = path.posix.join(nameOrPath, 'package.json')
      if (!fs.existsSync(packageJSONPath)) {
        logger.warn(`Can't find plugin: ${nameOrPath}`)
        return ''
      } else {
        const pkg = readJSONSync(packageJSONPath) || {}
        if (!pkg.name?.includes('picgo-plugin-')) {
          logger.warn(
            `The plugin package.json's name filed is ${(pkg.name as string) || 'empty'}, need to include the prefix: picgo-plugin-`,
          )
          return ''
        }
        return pkg.name
      }
    }
  }
}

export const handleUnixStylePath = (pathStr: string): string => {
  const pathArr = pathStr.split(path.sep)
  return pathArr.join('/')
}

export const removePluginVersion = (nameOrPath: string, scope: boolean = false): string => {
  if (!nameOrPath.includes('@')) {
    return nameOrPath
  } else {
    let reg = /(.+\/)?(picgo-plugin-\w+)(@.+)*/
    if (scope) {
      reg = /(.+\/)?(^@[^/]+\/picgo-plugin-\w+)(@.+)*/
    }
    const matchArr = nameOrPath.match(reg)
    if (!matchArr) {
      console.warn('can not remove plugin version')
      return nameOrPath
    } else {
      return matchArr[2]
    }
  }
}

/**
 * the config black item list which won't be setted
 * only can be got
 */
export const configBlackList = []

/**
 * check some config key is in blackList
 * @param key
 */
export const isConfigKeyInBlackList = (key: string): boolean => {
  return configBlackList.some(blackItem => key.startsWith(blackItem))
}

export const isInputConfigValid = (config: any): boolean => {
  if (typeof config === 'object' && !Array.isArray(config) && Object.keys(config).length > 0) {
    return true
  }
  return false
}

export function safeParse<T>(str: string): T | string {
  try {
    return JSON.parse(str)
  } catch (_e) {
    return JSON.parse('{}')
  }
}

export const forceNumber = (num: string | number = 0): number => {
  return isNaN(Number(num)) ? 0 : Number(num)
}

export const isDev = (): boolean => process.env.NODE_ENV === 'development'

// --- watermark helper ---
async function text2SVG(
  defaultWatermarkFontPath: string,
  text?: string,
  color?: string,
  fontFamily?: string,
): Promise<Buffer> {
  text = !text ? '测试' : text
  fontFamily = !fontFamily ? defaultWatermarkFontPath : fontFamily
  color = !color ? 'rgba(204, 204, 204, 0.45)' : color
  const text2SVG = TextToSVG.loadSync(fontFamily)
  const options: TextToSVG.GenerationOptions = {
    anchor: 'top',
    attributes: {
      fill: color,
    },
  }
  const textSVG = text2SVG.getSVG(text, options)
  return Buffer.from(textSVG)
}

const defaultWatermarkImagePath = path.join(__dirname, 'assets', 'piclist.png')

export async function AddWatermark(
  img: Buffer,
  watermarkType: 'text' | 'image',
  defaultWatermarkFontPath: string,
  isFullScreenWatermark?: boolean,
  watermarkDegree?: number,
  text?: string,
  watermarkFontPath?: string,
  watermarkScaleRatio?: number,
  watermarkColor?: string,
  watermarkImagePath?: string,
  position?: sharp.Gravity,
  watermarkImageOpacity?: number,
): Promise<Buffer> {
  watermarkScaleRatio =
    !watermarkScaleRatio || watermarkScaleRatio < 0 || watermarkScaleRatio > 1 ? 0.15 : watermarkScaleRatio
  const image = sharp(img, { animated: true })
  const { width: imgWidth = 200 } = await image.metadata()
  const watermark = await createWatermark(
    watermarkType,
    defaultWatermarkFontPath,
    text,
    watermarkFontPath,
    watermarkScaleRatio,
    watermarkColor,
    watermarkImagePath,
    imgWidth,
    watermarkDegree,
    watermarkImageOpacity,
  )
  return await image
    .composite([
      {
        input: watermark,
        gravity: position || 'southeast',
        tile: isFullScreenWatermark,
      },
    ])
    .toBuffer()
}

async function createWatermark(
  watermarkType: 'text' | 'image',
  defaultWatermarkFontPath: string,
  text?: string,
  watermarkFontPath?: string,
  watermarkScaleRatio?: number,
  watermarkColor?: string,
  watermarkImagePath?: string,
  imgWidth: number = 200,
  watermarkDegree: number = 0,
  watermarkImageOpacity: number = 255,
): Promise<Buffer> {
  let watermark: any
  if (watermarkType === 'image') {
    watermarkImageOpacity = forceNumber(watermarkImageOpacity)
    watermarkImagePath = watermarkImagePath || defaultWatermarkImagePath
    watermark = await sharp(watermarkImagePath)
      .composite([
        {
          input: Buffer.from([255, 255, 255, watermarkImageOpacity > 255 ? 255 : watermarkImageOpacity]),
          raw: {
            width: 1,
            height: 1,
            channels: 4,
          },
          tile: true,
          blend: 'dest-in',
        },
      ])
      .toBuffer()
  } else {
    watermark = await text2SVG(
      defaultWatermarkFontPath,
      text,
      watermarkColor,
      watermarkFontPath || defaultWatermarkFontPath,
    )
  }
  const { width: watermarkWidth, height: watermarkHeight } = await getSize(watermark)
  const watermarkResizeWidth = Math.floor(imgWidth * forceNumber(watermarkScaleRatio))
  const watermarkResizeHeight = Math.floor((watermarkResizeWidth * watermarkHeight) / watermarkWidth)
  return await sharp(watermark)
    .resize(watermarkResizeWidth, watermarkResizeHeight, {
      fit: 'inside',
    })
    .rotate(watermarkDegree, {
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .toBuffer()
}

async function getSize(image: Buffer): Promise<{ width: number; height: number }> {
  const { width, height } = await sharp(image).metadata()
  return { width: width || 200, height: height || 200 }
}

const validParam = (...params: any[]): boolean => {
  return params.every(param => {
    if (param === undefined || param === null) return false
    if (typeof param === 'string') return param !== ''
    if (typeof param === 'number') return param > 0
    if (typeof param === 'object') return Object.keys(param).length > 0
    return true
  })
}

/**
 * 转换后可以输出的格式列表
 */
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

/**
 * 可以处理的图片格式列表
 */
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

export function getTreatedWaterMarkOptions(
  global: IBuildInWaterMarkOptions | undefined,
  idSpecificConfig: Partial<IBuildInWaterMarkOptions>,
  picBed: string,
  id: string,
): IBuildInWaterMarkOptionsTreated {
  global = global || {}
  const options: IBuildInWaterMarkOptionsTreated = {
    isAddWatermark: !!(idSpecificConfig.isAddWatermark ?? global.isAddWatermarkMap?.[picBed] ?? global.isAddWatermark),
    watermarkType:
      (idSpecificConfig.watermarkType ?? global.watermarkTypeMap?.[picBed] ?? global.watermarkType) || 'text',
    isFullScreenWatermark: !!(
      idSpecificConfig.isFullScreenWatermark ??
      global.isFullScreenWatermarkMap?.[picBed] ??
      global.isFullScreenWatermark
    ),
    watermarkDegree: forceNumber(
      idSpecificConfig.watermarkDegree ?? global.watermarkDegreeMap?.[picBed] ?? global.watermarkDegree,
    ),
    watermarkText: (idSpecificConfig.watermarkText ?? global.watermarkTextMap?.[picBed] ?? global.watermarkText) || '',
    watermarkFontPath: (idSpecificConfig.watermarkFontPath ?? global.watermarkFontPath) || '',
    watermarkScaleRatio: forceNumber(
      idSpecificConfig.watermarkScaleRatio ?? global.watermarkScaleRatioMap?.[picBed] ?? global.watermarkScaleRatio,
    ),
    watermarkColor:
      (idSpecificConfig.watermarkColor ?? global.watermarkColorMap?.[picBed] ?? global.watermarkColor) ||
      'rgba(204, 204, 204, 0.45)',
    watermarkImagePath:
      (idSpecificConfig.watermarkImagePath ?? global.watermarkImagePathMap?.[picBed] ?? global.watermarkImagePath) ||
      '',
    watermarkPosition:
      (idSpecificConfig.watermarkPosition ?? global.watermarkPositionMap?.[picBed] ?? global.watermarkPosition) ||
      'southeast',
    watermarkImageOpacity: forceNumber(
      idSpecificConfig.watermarkImageOpacity ??
        global.watermarkImageOpacityMap?.[picBed] ??
        global.watermarkImageOpacity,
    ),
    picBed,
    id,
  }
  return options
}

export function getTreatedCompressOptions(
  global: IBuildInCompressOptions | undefined,
  idSpecificConfig: Partial<IBuildInCompressOptions>,
  picBed: string,
  id: string,
): IBuildInCompressOptionsTreated {
  global = global || {}
  const options: IBuildInCompressOptionsTreated = {
    quality: forceNumber(idSpecificConfig.quality ?? global.qualityMap?.[picBed] ?? global.quality),
    isConvert: !!(idSpecificConfig.isConvert ?? global.isConvertMap?.[picBed] ?? global.isConvert),
    convertFormat:
      (idSpecificConfig.convertFormat ?? global.convertFormatMap?.[picBed] ?? global.convertFormat) || 'jpg',
    isReSize: !!(idSpecificConfig.isReSize ?? global.isReSizeMap?.[picBed] ?? global.isReSize),
    reSizeHeight: forceNumber(idSpecificConfig.reSizeHeight ?? global.reSizeHeightMap?.[picBed] ?? global.reSizeHeight),
    reSizeWidth: forceNumber(idSpecificConfig.reSizeWidth ?? global.reSizeWidthMap?.[picBed] ?? global.reSizeWidth),
    skipReSizeOfSmallImg: !!(
      idSpecificConfig.skipReSizeOfSmallImg ??
      global.skipReSizeOfSmallImgMap?.[picBed] ??
      global.skipReSizeOfSmallImg
    ),
    isReSizeByPercent: !!(
      idSpecificConfig.isReSizeByPercent ??
      global.isReSizeByPercentMap?.[picBed] ??
      global.isReSizeByPercent
    ),
    reSizePercent: forceNumber(
      idSpecificConfig.reSizePercent ?? global.reSizePercentMap?.[picBed] ?? global.reSizePercent,
    ),
    longEdgeAsHeight: !!(
      idSpecificConfig.longEdgeAsHeight ??
      global.longEdgeAsHeightMap?.[picBed] ??
      global.longEdgeAsHeight
    ),
    isRotate: !!(idSpecificConfig.isRotate ?? global.isRotateMap?.[picBed] ?? global.isRotate),
    rotateDegree: forceNumber(idSpecificConfig.rotateDegree ?? global.rotateDegreeMap?.[picBed] ?? global.rotateDegree),
    isRemoveExif: !!(idSpecificConfig.isRemoveExif ?? global.isRemoveExifMap?.[picBed] ?? global.isRemoveExif),
    isFlip: !!(idSpecificConfig.isFlip ?? global.isFlipMap?.[picBed] ?? global.isFlip),
    isFlop: !!(idSpecificConfig.isFlop ?? global.isFlopMap?.[picBed] ?? global.isFlop),
    formatConvertObj:
      (idSpecificConfig.formatConvertObj ?? global.formatConvertObjMap?.[picBed] ?? global.formatConvertObj) || {},
    picBed,
    id,
  }
  return options
}

export async function imageAddWaterMark(
  img: Buffer,
  options: IBuildInWaterMarkOptions,
  defaultWatermarkFontPath: string,
  logger: ILogger,
): Promise<Buffer> {
  try {
    let image: sharp.Sharp = sharp(img, { animated: true })
    image = sharp(
      await AddWatermark(
        img,
        options.watermarkType || 'text',
        defaultWatermarkFontPath,
        options.isFullScreenWatermark,
        forceNumber(options.watermarkDegree),
        options.watermarkText,
        options.watermarkFontPath,
        forceNumber(options.watermarkScaleRatio),
        options.watermarkColor,
        options.watermarkImagePath,
        options.watermarkPosition,
        forceNumber(options.watermarkImageOpacity),
      ),
      { animated: true },
    )
    return await image.toBuffer()
  } catch (error: any) {
    logger.error(`Image add watermark error: ${error}`)
    return img
  }
}

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
    let quality = 100
    if (validParam(options.quality) && options.quality! < 100) {
      quality = Math.min(Math.max(Math.round(options.quality!), 1), 100)
    }
    if (options.isReSizeByPercent) {
      if (validParam(options.reSizePercent)) {
        const imageWidth = await image.metadata().then(metadata => metadata.width)
        const imageHeight = await image.metadata().then(metadata => metadata.height)
        if (imageWidth && imageHeight) {
          image = image.resize(
            Math.round((imageWidth * options.reSizePercent!) / 100),
            Math.round((imageHeight * options.reSizePercent!) / 100),
            {
              fit: 'inside',
            },
          )
        }
      }
    } else if (options.isReSize) {
      if (
        typeof options.reSizeHeight === 'number' &&
        options.reSizeHeight > 0 &&
        typeof options.reSizeWidth === 'number' &&
        options.reSizeWidth > 0
      ) {
        image = image.resize(options.reSizeWidth, options.reSizeHeight, {
          fit: 'fill',
        })
      } else if (
        typeof options.reSizeHeight === 'number' &&
        options.reSizeHeight > 0 &&
        (typeof options.reSizeWidth !== 'number' || options.reSizeWidth === 0)
      ) {
        const rawImageWidth = await image.metadata().then(metadata => metadata.width)
        const rawImageHeight = await image.metadata().then(metadata => metadata.height)
        if (rawImageWidth && rawImageHeight) {
          if (
            !options.skipReSizeOfSmallImg ||
            (options.skipReSizeOfSmallImg &&
              options.reSizeHeight <
                (options.longEdgeAsHeight && rawImageWidth > rawImageHeight ? rawImageWidth : rawImageHeight))
          ) {
            const scaleRatio =
              options.reSizeHeight /
              (options.longEdgeAsHeight && rawImageWidth > rawImageHeight ? rawImageWidth : rawImageHeight)
            image = image.resize(Math.round(rawImageWidth * scaleRatio), Math.round(rawImageHeight * scaleRatio), {
              fit: 'inside',
            })
          }
        }
      } else if (
        typeof options.reSizeWidth === 'number' &&
        options.reSizeWidth > 0 &&
        (typeof options.reSizeHeight !== 'number' || options.reSizeHeight === 0)
      ) {
        const imageWidth = await image.metadata().then(metadata => metadata.width)
        const imageHeight = await image.metadata().then(metadata => metadata.height)
        if (imageWidth && imageHeight) {
          if (!options.skipReSizeOfSmallImg || (options.skipReSizeOfSmallImg && options.reSizeWidth < imageWidth)) {
            const scaleRatio = options.reSizeWidth / imageWidth
            image = image.resize(options.reSizeWidth, Math.round(imageHeight * scaleRatio), {
              fit: 'inside',
            })
          }
        }
      }
    }
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
    if (options.isConvert) {
      const newFormat = getConvertedFormat(options, rawFormat) as any
      if (newFormat !== rawFormat) {
        image = image.toFormat(newFormat, {
          quality,
          mozjpeg: true,
        })
      }
    } else {
      if (rawFormat && validOutputFormat(rawFormat)) {
        image = image.toFormat(rawFormat as any, {
          quality,
          mozjpeg: true,
        })
      } else {
        image = image.toFormat('jpg', {
          quality,
          mozjpeg: true,
        })
      }
    }
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
    return fileExt !== newFormat
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
