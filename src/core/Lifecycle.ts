import { EventEmitter } from 'events'
import { type IBuildInWaterMarkOptions, type IBuildInCompressOptions, type ILifecyclePlugins, type IPathTransformedImgInfo, type IPicGo, type IPlugin, type Undefinable, type IImgInfo } from '../types'
import { getURLFile, handleUrlEncode, imageProcess, isUrl, needCompress, needAddWatermark, imageAddWaterMark, removeExif, renameFileNameWithCustomString, getConvertedFormat } from '../utils/common'
import { IBuildInEvent } from '../utils/enum'
import { createContext } from '../utils/createContext'
import path from 'path'
import fs from 'fs-extra'
import axios from 'axios'
import { cloneDeep } from 'lodash'
import heicConvert from 'heic-convert'

export class Lifecycle extends EventEmitter {
  private readonly ctx: IPicGo
  private readonly ttfLink: string = 'https://release.piclist.cn/simhei.ttf'
  ttfPath: string

  constructor (ctx: IPicGo) {
    super()
    this.ctx = ctx
    const tempFilePath = path.join(ctx.baseDir, 'piclistTemp')
    const imgFilePath = path.join(ctx.baseDir, 'imgTemp')
    fs.ensureDirSync(imgFilePath)
    fs.emptyDirSync(tempFilePath)
    this.ttfPath = path.join(ctx.baseDir, 'assets', 'simhei.ttf')
  }

  async downloadTTF (): Promise<boolean> {
    const outputDir = path.dirname(this.ttfPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    if (!fs.existsSync(this.ttfPath)) {
      this.ctx.log.info('Download ttf file.')
      try {
        const res = await axios.get(this.ttfLink, { responseType: 'arraybuffer' })
        fs.writeFileSync(this.ttfPath, res.data)
        this.ctx.log.info('Download ttf file success.')
        return true
      } catch (e: any) {
        this.ctx.log.error('Download ttf file failed.')
        return false
      }
    } else {
      return true
    }
  }

  async start (input: any[]): Promise<IPicGo> {
    // ensure every upload process has an unique context
    const ctx = createContext(this.ctx)
    try {
      // images input
      if (!Array.isArray(input)) {
        throw new Error('Input must be an array.')
      }
      ctx.input = input
      ctx.rawInputPath = [] as string[]
      ctx.rawInput = cloneDeep(input)
      ctx.output = [] as IImgInfo[]
      const compressOptions = ctx.getConfig<IBuildInCompressOptions>('buildIn.compress')
      const type = ctx.getConfig<Undefinable<string>>('picBed.uploader') || ctx.getConfig<Undefinable<string>>('picBed.current') || 'smms'
      const uploader = ctx.helper.uploader.get(type)
      if (!uploader && compressOptions) {
        compressOptions.picBed = 'smms'
      } else if (compressOptions) {
        compressOptions.picBed = type
      }
      const watermarkOptions = ctx.getConfig<IBuildInWaterMarkOptions>('buildIn.watermark')
      if (compressOptions || watermarkOptions) {
        const tempFilePath = path.join(ctx.baseDir, 'piclistTemp')
        if (!fs.existsSync(tempFilePath)) {
          fs.mkdirSync(tempFilePath)
        }
        const watermarkMsg = 'Add watermark to image'
        const compressMsg = 'Compress or convert image'
        await Promise.allSettled(ctx.input.map(async (item: string, index: number) => {
          let info: IPathTransformedImgInfo
          if (isUrl(item)) {
            ctx.rawInputPath![index] = item
            info = await getURLFile(item, ctx)
            if (info.success && info.buffer) {
              let transformedBuffer
              let isSkip = false
              if (needAddWatermark(watermarkOptions, info.extname ?? '')) {
                if (!(watermarkOptions?.watermarkFontPath || watermarkOptions?.watermarkType === 'image')) {
                  const downloadTTFRet = await this.downloadTTF()
                  if (!downloadTTFRet) {
                    this.ctx.log.warn('Download ttf file failed, skip add watermark.')
                    isSkip = true
                  }
                }
                if (!isSkip) {
                  ctx.log.info(watermarkMsg)
                  transformedBuffer = await imageAddWaterMark(info.buffer, watermarkOptions, this.ttfPath, ctx.log)
                }
              }
              if (needCompress(compressOptions, info.extname ?? '')) {
                ctx.log.info(compressMsg)
                transformedBuffer = await imageProcess(transformedBuffer ?? info.buffer, compressOptions, info.extname ?? '', ctx.log)
              }
              if (!transformedBuffer && compressOptions?.isRemoveExif) {
                ctx.log.info('Remove exif info.')
                transformedBuffer = await removeExif(info.buffer, info.extname ?? '')
              }
              if (transformedBuffer) {
                let newExt
                if (compressOptions?.isConvert) {
                  newExt = getConvertedFormat(compressOptions, info.extname ?? '')
                } else {
                  newExt = info.extname ?? ''
                }
                newExt = newExt.startsWith('.') ? newExt : `.${newExt}`
                const tempFile = path.join(tempFilePath, `${info.fileName
                  ? `${path.basename(info.fileName, path.extname(info.fileName))}${newExt}`
                  : new Date().getTime()}${newExt}`)
                ctx.rawInputPath![index] = path.join(path.dirname(item), path.basename(tempFile))
                fs.writeFileSync(tempFile, transformedBuffer)
                ctx.input[index] = tempFile
              }
            } else {
              throw new Error(info.reason)
            }
          } else {
            let transformedBuffer
            ctx.rawInputPath![index] = item
            let isSkip = false
            if (needAddWatermark(watermarkOptions, path.extname(item))) {
              if (!(watermarkOptions?.watermarkFontPath || watermarkOptions?.watermarkType === 'image')) {
                const downloadTTFRet = await this.downloadTTF()
                if (!downloadTTFRet) {
                  this.ctx.log.warn('Download ttf file failed, skip add watermark.')
                  isSkip = true
                }
              }
              if (!isSkip) {
                ctx.log.info(watermarkMsg)
                transformedBuffer = await imageAddWaterMark(fs.readFileSync(item), watermarkOptions, this.ttfPath, ctx.log)
              }
            }
            if (needCompress(compressOptions, path.extname(item))) {
              ctx.log.info(compressMsg)
              if (path.extname(item) === '.heic' || path.extname(item) === '.heif') {
                const heicBuffer = fs.readFileSync(item)
                const heicResult = await heicConvert({
                  buffer: heicBuffer,
                  format: 'JPEG',
                  quality: 1
                })
                const tempHeicConvertFile = path.join(tempFilePath, `${path.basename(item, path.extname(item))}.jpg`)
                fs.writeFileSync(tempHeicConvertFile, Buffer.from(heicResult))
                transformedBuffer = await imageProcess(fs.readFileSync(tempHeicConvertFile), compressOptions, '.jpg', ctx.log)
              } else {
                transformedBuffer = await imageProcess(transformedBuffer ?? fs.readFileSync(item), compressOptions, path.extname(item), ctx.log)
              }
            }
            if (!transformedBuffer && compressOptions?.isRemoveExif) {
              ctx.log.info('Remove exif info.')
              transformedBuffer = await removeExif(fs.readFileSync(item), path.extname(item))
            }
            if (transformedBuffer) {
              let newExt
              if (compressOptions?.isConvert) {
                newExt = getConvertedFormat(compressOptions, path.extname(item))
              } else {
                newExt = path.extname(item)
              }
              newExt = newExt.startsWith('.') ? newExt : `.${newExt}`
              const tempFile = path.join(tempFilePath, `${path.basename(item, path.extname(item))}${newExt}`)
              ctx.rawInputPath![index] = path.join(path.dirname(item), `${path.basename(item, path.extname(item))}${newExt}`)
              fs.writeFileSync(tempFile, transformedBuffer)
              ctx.input[index] = tempFile
            }
          }
        }))
      } else {
        for (const item of ctx.input) {
          ctx.rawInputPath.push(item)
        }
      }
      // lifecycle main
      await this.beforeTransform(ctx)
      await this.doTransform(ctx)
      const renameConfig = ctx.getConfig<any>('buildIn.rename') || {}
      if (renameConfig.enable) {
        const format = renameConfig.format || '{filename}'
        ctx.output = ctx.output.map((item: IImgInfo, index: number) => {
          let fileName = item.fileName
          if (format) {
            fileName = renameFileNameWithCustomString(ctx.rawInputPath![index], format, undefined, item.base64Image ? item.base64Image : item.buffer)
            fileName = fileName.replace(/\/+/g, '/')
            if (fileName.slice(-1) === '/') {
              fileName = fileName + index.toString()
            }
          }
          item.fileName = fileName
          return item
        })
      }
      await this.beforeUpload(ctx)
      await this.doUpload(ctx)
      ctx.input = ctx.rawInput
      await this.afterUpload(ctx)
      return ctx
    } catch (e: any) {
      ctx.log.warn(IBuildInEvent.FAILED)
      ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, -1)
      ctx.emit(IBuildInEvent.FAILED, e)
      ctx.log.error(e)
      if (ctx.getConfig<Undefinable<string>>('debug')) {
        throw e
      }
      return ctx
    }
  }

  private async beforeTransform (ctx: IPicGo): Promise<IPicGo> {
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 0)
    ctx.emit(IBuildInEvent.BEFORE_TRANSFORM, ctx)
    ctx.log.info('Before transform')
    await this.handlePlugins(ctx.helper.beforeTransformPlugins, ctx)
    return ctx
  }

  private async doTransform (ctx: IPicGo): Promise<IPicGo> {
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 30)
    const type = ctx.getConfig<Undefinable<string>>('picBed.transformer') || 'path'
    let currentTransformer = type
    let transformer = ctx.helper.transformer.get(type)
    if (!transformer) {
      transformer = ctx.helper.transformer.get('path')
      currentTransformer = 'path'
      ctx.log.warn(`Can't find transformer - ${type}, switch to default transformer - path`)
    }
    ctx.log.info(`Transforming... Current transformer is [${currentTransformer}]`)
    await transformer?.handle(ctx)
    return ctx
  }

  private async beforeUpload (ctx: IPicGo): Promise<IPicGo> {
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 60)
    ctx.log.info('Before upload')
    ctx.emit(IBuildInEvent.BEFORE_UPLOAD, ctx)
    await this.handlePlugins(ctx.helper.beforeUploadPlugins, ctx)
    return ctx
  }

  private async doUpload (ctx: IPicGo): Promise<IPicGo> {
    let type = ctx.getConfig<Undefinable<string>>('picBed.uploader') || ctx.getConfig<Undefinable<string>>('picBed.current') || 'smms'
    let uploader = ctx.helper.uploader.get(type)
    let currentTransformer = type
    if (!uploader) {
      ctx.log.warn(`Can't find uploader - ${type}, switch to default uploader - smms`)
      type = 'smms'
      currentTransformer = 'smms'
      uploader = ctx.helper.uploader.get('smms')
    }
    ctx.log.info(`Uploading... Current uploader is [${currentTransformer}]`)
    await uploader?.handle(ctx)
    for (const outputImg of ctx.output) {
      outputImg.type = type
    }
    return ctx
  }

  private async afterUpload (ctx: IPicGo): Promise<IPicGo> {
    ctx.emit(IBuildInEvent.AFTER_UPLOAD, ctx)
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 100)
    await this.handlePlugins(ctx.helper.afterUploadPlugins, ctx)
    let msg = ''
    const length = ctx.output.length
    const isEncodeOutputURL = ctx.getConfig<Undefinable<boolean>>('settings.encodeOutputURL') === true
    for (let i = 0; i < length; i++) {
      if (typeof ctx.output[i].imgUrl !== 'undefined') {
        msg += isEncodeOutputURL ? handleUrlEncode(ctx.output[i].imgUrl!) : ctx.output[i].imgUrl!
        if (i !== length - 1) {
          msg += '\n'
        }
      }
      delete ctx.output[i].base64Image
      delete ctx.output[i].buffer
    }
    ctx.emit(IBuildInEvent.FINISHED, ctx)
    ctx.log.success(`\n${msg}`)
    return ctx
  }

  private async handlePlugins (lifeCyclePlugins: ILifecyclePlugins, ctx: IPicGo): Promise<IPicGo> {
    const plugins = lifeCyclePlugins.getList()
    const pluginNames = lifeCyclePlugins.getIdList()
    const lifeCycleName = lifeCyclePlugins.getName()
    await Promise.all(plugins.map(async (plugin: IPlugin, index: number) => {
      try {
        ctx.log.info(`${lifeCycleName}: ${pluginNames[index]} running`)
        await plugin.handle(ctx)
      } catch (e) {
        ctx.log.error(`${lifeCycleName}: ${pluginNames[index]} error`)
        throw e
      }
    }))
    return ctx
  }
}

export default Lifecycle
