import fs from 'fs-extra'
import path from 'path'
import { imageSize } from 'image-size'
import {
  IImgSize,
  IPathTransformedImgInfo,
  IPluginNameType,
  ILogger,
  IPicGo,
  IBuildInCompressOptions,
  IBuildInWaterMarkOptions
} from '../types'
import { URL } from 'url'
import TextToSVG from 'text-to-svg'
import sharp from 'sharp'

export const isUrl = (url: string): boolean => (/^https?:\/\//).test(url)

export const isUrlEncode = (url: string): boolean => {
  url = url || ''
  try {
    // the whole url encode or decode shold not use encodeURIComponent or decodeURIComponent
    return url !== decodeURI(url)
  } catch (e) {
    // if some error caught, try to let it go
    return true
  }
}
export const handleUrlEncode = (url: string): string => {
  if (!isUrlEncode(url)) {
    url = encodeURI(url)
  }
  return url
}

export const getImageSize = (file: Buffer): IImgSize => {
  try {
    const { width = 0, height = 0 } = imageSize(file)
    return {
      real: true,
      width,
      height
    }
  } catch (e) {
    // fallback to 200 * 200
    return {
      real: false,
      width: 200,
      height: 200
    }
  }
}

export const getFSFile = async (filePath: string): Promise<IPathTransformedImgInfo> => {
  try {
    return {
      extname: path.extname(filePath),
      fileName: path.basename(filePath),
      buffer: await fs.readFile(filePath),
      success: true
    }
  } catch {
    return {
      reason: `read file ${filePath} error`,
      success: false
    }
  }
}

export const getURLFile = async (url: string, ctx: IPicGo): Promise<IPathTransformedImgInfo> => {
  url = handleUrlEncode(url)
  let timeoutId: NodeJS.Timeout
  const requestFn = new Promise<IPathTransformedImgInfo>((resolve, reject) => {
    (async () => {
      try {
        const res = await ctx.request({
          method: 'get',
          url,
          resolveWithFullResponse: true,
          responseType: 'arraybuffer'
        })
          .then((resp) => {
            return resp.data as Buffer
          })
        clearTimeout(timeoutId)
        const urlPath = new URL(url).pathname
        resolve({
          buffer: res,
          fileName: path.basename(urlPath),
          extname: path.extname(urlPath),
          success: true
        })
      } catch (error: any) {
        clearTimeout(timeoutId)
        resolve({
          success: false,
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          reason: `request ${url} error, ${error?.message ?? ''}`
        })
      }
    })().catch(reject)
  })
  const timeoutPromise = new Promise<IPathTransformedImgInfo>((resolve): void => {
    timeoutId = setTimeout(() => {
      resolve({
        success: false,
        reason: `request ${url} timeout`
      })
    }, 30000)
  })
  return Promise.race([requestFn, timeoutPromise])
}

/**
 * detect the input string's type
 * for example
 * 1. @xxx/picgo-plugin-xxx -> scope
 * 2. picgo-plugin-xxx -> normal
 * 3. xxx -> simple
 * 4. not exists or is a path -> unknown
 * @param name
 */
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

/**
 * detect the input string is a simple plugin name or not
 * for example
 * 1. xxx -> true
 * 2. /Usr/xx/xxxx/picgo-plugin-xxx -> false
 * @param name pluginNameOrPath
 */
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

/**
 * streamline the full plugin name to a simple one
 * for example:
 * 1. picgo-plugin-xxx -> xxx
 * 2. @xxx/picgo-plugin-yyy -> yyy
 * @param name pluginFullName
 */
export const handleStreamlinePluginName = (name: string): string => {
  if (/^@[^/]+\/picgo-plugin-/.test(name)) {
    return name.replace(/^@[^/]+\/picgo-plugin-/, '')
  } else {
    return name.replace(/picgo-plugin-/, '')
  }
}

/**
 * complete plugin name to full name
 * for example:
 * 1. xxx -> picgo-plugin-xxx
 * 2. picgo-plugin-xxx -> picgo-plugin-xxx
 * @param name pluginSimpleName
 * @param scope pluginScope
 */
export const handleCompletePluginName = (name: string, scope = ''): string => {
  if (scope) {
    return `@${scope}/picgo-plugin-${name}`
  } else {
    return `picgo-plugin-${name}`
  }
}

/**
 * handle install/uninstall/update plugin name or path
 * for example
 * 1. picgo-plugin-xxx -> picgo-plugin-xxx
 * 2. @xxx/picgo-plugin-xxx -> @xxx/picgo-plugin-xxx
 * 3. xxx -> picgo-plugin-xxx
 * 4. ./xxxx/picgo-plugin-xxx -> /absolutePath/.../xxxx/picgo-plugin-xxx
 * 5. /absolutePath/.../picgo-plugin-xxx -> /absolutePath/.../picgo-plugin-xxx
 * @param nameOrPath pluginName or pluginPath
 */
export const getProcessPluginName = (nameOrPath: string, logger: ILogger | Console = console): string => {
  const pluginNameType = getPluginNameType(nameOrPath)
  switch (pluginNameType) {
    case 'normal':
    case 'scope':
      return nameOrPath
    case 'simple':
      return handleCompletePluginName(nameOrPath)
    default: {
      // now, the pluginNameType is unknow here
      // 1. check if is an absolute path
      let pluginPath = nameOrPath
      if (path.isAbsolute(nameOrPath) && fs.existsSync(nameOrPath)) {
        return handleUnixStylePath(pluginPath)
      }
      // 2. check if is a relative path
      pluginPath = path.join(process.cwd(), nameOrPath)
      if (fs.existsSync(pluginPath)) {
        return handleUnixStylePath(pluginPath)
      }
      // 3. invalid nameOrPath
      logger.warn(`Can't find plugin ${nameOrPath}`)
      return ''
    }
  }
}

/**
 * get the normal plugin name
 * for example:
 * 1. picgo-plugin-xxx -> picgo-plugin-xxx
 * 2. @xxx/picgo-plugin-xxx -> @xxx/picgo-plugin-xxx
 * 3. ./xxxx/picgo-plugin-xxx -> picgo-plugin-xxx
 * 4. /absolutePath/.../picgo-plugin-xxx -> picgo-plugin-xxx
 * 5. an exception: [package.json's name] !== [folder name]
 * then use [package.json's name], usually match the scope package.
 * 6. if plugin name has version: picgo-plugin-xxx@x.x.x then remove the version
 * @param nameOrPath
 */
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
      // now, the nameOrPath must be path
      // the nameOrPath here will be ensured with unix style
      // we need to find the package.json's name cause npm using the name in package.json's name filed
      if (!fs.existsSync(nameOrPath)) {
        logger.warn(`Can't find plugin: ${nameOrPath}`)
        return ''
      }
      const packageJSONPath = path.posix.join(nameOrPath, 'package.json')
      if (!fs.existsSync(packageJSONPath)) {
        logger.warn(`Can't find plugin: ${nameOrPath}`)
        return ''
      } else {
        const pkg = fs.readJSONSync(packageJSONPath) || {}
        if (!pkg.name?.includes('picgo-plugin-')) {
          logger.warn(`The plugin package.json's name filed is ${pkg.name as string || 'empty'}, need to include the prefix: picgo-plugin-`)
          return ''
        }
        return pkg.name
      }
    }
  }
}

/**
 * handle transform the path to unix style
 * for example
 * 1. C:\\xxx\\xxx -> C:/xxx/xxx
 * 2. /xxx/xxx -> /xxx/xxx
 * @param path
 */
export const handleUnixStylePath = (pathStr: string): string => {
  const pathArr = pathStr.split(path.sep)
  return pathArr.join('/')
}

/**
 * remove plugin version when register plugin name
 * 1. picgo-plugin-xxx@1.0.0 -> picgo-plugin-xxx
 * 2. @xxx/picgo-plugin-xxx@1.0.0 -> @xxx/picgo-plugin-xxx
 * @param nameOrPath
 * @param scope
 */
export const removePluginVersion = (nameOrPath: string, scope: boolean = false): string => {
  if (!nameOrPath.includes('@')) {
    return nameOrPath
  } else {
    let reg = /(.+\/)?(picgo-plugin-\w+)(@.+)*/
    // if is a scope pkg
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

/**
 * check the input config is valid
 * config must be object such as { xxx: 'xxx' }
 * && can't be array
 * @param config
 * @returns
 */
export const isInputConfigValid = (config: any): boolean => {
  if (
    typeof config === 'object' &&
    !Array.isArray(config) &&
    Object.keys(config).length > 0
  ) {
    return true
  }
  return false
}

export function safeParse<T> (str: string): T | string {
  try {
    return JSON.parse(str)
  } catch (error) {
    return str
  }
}

// hold...
// export const configWhiteList: RegExp[] = [
//   /^picBed/,
//   /^picgoPlugins/,
//   /^@[^/]+\/picgo-plugin-/,
//   /debug/,
//   /silent/,
//   /configPath/,
//   /^settings/,
// ]

// export const isConfigKeyInWhiteList = (key: string): boolean => {
//   return configWhiteList.some(whiteItem => whiteItem.test(key))
// }

export const forceNumber = (num: string | number = 0): number => {
  return isNaN(Number(num)) ? 0 : Number(num)
}

export const isDev = (): boolean => {
  return process.env.NODE_ENV === 'development'
}

export const isProd = (): boolean => {
  return process.env.NODE_ENV === 'production'
}

async function text2SVG (
  text?: string,
  color?: string,
  fontFamily?: string
): Promise<Buffer> {
  text = !text ? '测试' : text
  fontFamily = !fontFamily ? './assets/simhei.ttf' : fontFamily
  color = !color ? 'rgba(204, 204, 204, 0.45)' : color
  const text2SVG = TextToSVG.loadSync(fontFamily)
  const options: TextToSVG.GenerationOptions = {
    anchor: 'top',
    attributes: {
      fill: color
    }
  }
  const textSVG = text2SVG.getSVG(text, options)
  const svg = Buffer.from(textSVG)
  return svg
}

const defaultWatermarkImagePath = '../assets/piclist.png'
const defaultWatermarkFontPath = '../assets/simhei.ttf'

export async function AddWatermark (
  img: Buffer,
  watermarkType: 'text' | 'image',
  isFullScreenWatermark?: boolean,
  watermarkDegree?: number,
  text?: string,
  watermarkFontPath?: string,
  watermarkScaleRatio?: number,
  watermarkColor?: string,
  watermarkImagePath?: string,
  position?: sharp.Gravity
): Promise<Buffer> {
  watermarkScaleRatio = !watermarkScaleRatio || watermarkScaleRatio < 0 || watermarkScaleRatio > 1 ? 0.15 : watermarkScaleRatio
  const image = sharp(img)
  const { width: imgWidth = 200 } = await image.metadata()
  const watermark = await createWatermark(
    watermarkType,
    watermarkDegree,
    text,
    watermarkFontPath,
    watermarkScaleRatio,
    watermarkColor,
    watermarkImagePath,
    imgWidth
  )
  const composited = await image
    .composite([
      {
        input: watermark,
        gravity: position || 'southeast',
        tile: isFullScreenWatermark
      }
    ])
    .toBuffer()
  return composited
}

async function createWatermark (
  watermarkType: 'text' | 'image',
  watermarkDegree: number = 0,
  text?: string,
  watermarkFontPath?: string,
  watermarkScaleRatio?: number,
  watermarkColor?: string,
  watermarkImagePath?: string,
  imgWidth: number = 200
): Promise<Buffer> {
  let watermark: any
  if (watermarkType === 'image') {
    watermarkImagePath = watermarkImagePath || defaultWatermarkImagePath
    watermark = await sharp(watermarkImagePath).toBuffer()
  } else {
    watermark = await text2SVG(
      text,
      watermarkColor,
      watermarkFontPath || defaultWatermarkFontPath
    )
  }
  const { width: watermarkWidth, height: watermarkHeight } = await getSize(
    watermark
  )
  const watermarkResizeWidth = Math.floor(imgWidth * forceNumber(watermarkScaleRatio))
  const watermarkResizeHeight = Math.floor(
    (watermarkResizeWidth * watermarkHeight) / watermarkWidth
  )
  return await sharp(watermark)
    .resize(watermarkResizeWidth, watermarkResizeHeight, {
      fit: 'inside'
    })
    .rotate(watermarkDegree, { background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer()
}

async function getSize (image: Buffer): Promise<{ width: number, height: number }> {
  const { width, height } = await sharp(image).metadata()
  return { width: width || 200, height: height || 200 }
}

const validParam = (...params: any[]): boolean => {
  return params.every(param => {
    if (param === undefined || param === null) {
      return false
    }
    if (typeof param === 'string') {
      return param !== ''
    }
    if (typeof param === 'number') {
      return param > 0
    }
    if (typeof param === 'object') {
      return Object.keys(param).length > 0
    }
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
  'webp'
]

const validOutputFormat = (format: string): boolean => {
  return availableConvertFormatList.includes(format)
}

const imageExtList = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg', 'ico', 'avif', 'heif', 'heic']

export async function imageAddWaterMark (img: Buffer, options: IBuildInWaterMarkOptions): Promise<Buffer> {
  try {
    let image: sharp.Sharp = sharp(img)
    if (validParam(options.watermarkText)) {
      image = sharp(await AddWatermark(
        img,
        options.watermarkType || 'text',
        options.isFullScreenWatermark,
        forceNumber(options.watermarkDegree),
        options.watermarkText,
        options.watermarkFontPath,
        forceNumber(options.watermarkScaleRatio),
        options.watermarkColor,
        options.watermarkImagePath,
        options.watermarkPosition
      ))
    }
    return await image.toBuffer()
  } catch (error) {
    console.log(error)
    return img
  }
}

function formatOptions (options: IBuildInCompressOptions): IBuildInCompressOptions {
  return {
    quality: forceNumber(options.quality),
    isConvert: options.isConvert || false,
    convertFormat: options.convertFormat || 'jpg',
    isReSize: options.isReSize || false,
    reSizeHeight: forceNumber(options.reSizeHeight),
    reSizeWidth: forceNumber(options.reSizeWidth),
    isReSizeByPercent: options.isReSizeByPercent || false,
    reSizePercent: forceNumber(options.reSizePercent),
    isRotate: options.isRotate || false,
    rotateDegree: forceNumber(options.rotateDegree)
  }
}

export async function imageProcess (img: Buffer, options: IBuildInCompressOptions, rawFormat: string): Promise<Buffer> {
  options = formatOptions(options)
  try {
    rawFormat = rawFormat.toLowerCase().replace('.', '')
    if (!imageExtList.includes(rawFormat)) {
      return img
    }
    let image: sharp.Sharp = sharp(img)
    let quality = 100
    if (validParam(options.quality) && options.quality! < 100) {
      quality = options.quality!
    }
    if (options.isReSize) {
      if (options.isReSizeByPercent) {
        if (validParam(options.reSizePercent) && options.reSizePercent! <= 100) {
          const imageWidth = await image.metadata().then(metadata => metadata.width)
          const imageHeight = await image.metadata().then(metadata => metadata.height)
          if (imageWidth && imageHeight) {
            image = image.resize(
              Math.round(imageWidth * options.reSizePercent! / 100),
              Math.round(imageHeight * options.reSizePercent! / 100),
              {
                fit: 'inside'
              })
          }
        }
      } else if (validParam(options.reSizeHeight, options.reSizeWidth)) {
        image = image.resize(
          options.reSizeWidth,
          options.reSizeHeight,
          {
            fit: 'inside'
          }
        )
      }
    }
    if (options.isRotate && options.rotateDegree) {
      image = image.rotate(options.rotateDegree, { background: { r: 255, g: 255, b: 255, alpha: 0 } })
    }
    if (options.isConvert) {
      const newFormat = options.convertFormat || 'jpg'
      image = image.toFormat(newFormat, {
        quality
      })
    } else {
      if (rawFormat && validOutputFormat(rawFormat)) {
        image = image.toFormat(rawFormat as any, {
          quality
        })
      } else {
        image = image.toFormat('jpg', {
          quality
        })
      }
    }
    return await image.toBuffer()
  } catch (error) {
    console.log(error)
    return img
  }
}

export const needAddWatermark = (watermarkOptions: IBuildInWaterMarkOptions | undefined): boolean => {
  return !!watermarkOptions && !!watermarkOptions.isAddWatermark
}

export const needCompress = (compressOptions: IBuildInCompressOptions | undefined, fileExt: string): boolean => {
  fileExt = fileExt.toLowerCase().replace('.', '')
  if (compressOptions) {
    compressOptions = formatOptions(compressOptions)
    if (validParam(compressOptions.quality) && compressOptions.quality! < 100) {
      return true
    }
    if (compressOptions.isReSize) {
      if (validParam(compressOptions.reSizeHeight, compressOptions.reSizeWidth)) {
        return true
      } else if (compressOptions.isReSizeByPercent) {
        if (validParam(compressOptions.reSizePercent) && compressOptions.reSizePercent! <= 100) {
          return true
        }
      }
    }
    if (compressOptions.isRotate && compressOptions.rotateDegree) {
      return true
    }
    if (compressOptions.isConvert) {
      const newFormat = compressOptions.convertFormat || 'jpg'
      return fileExt !== newFormat
    }
  }
  return false
}
