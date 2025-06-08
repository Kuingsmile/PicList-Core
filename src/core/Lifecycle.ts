import axios from 'axios'
import { EventEmitter } from 'events'
import fs, { emptyDirSync, ensureDirSync } from 'fs-extra'
import heicConvert from 'heic-convert'
import { cloneDeep } from 'lodash'
import path from 'path'

import {
  IBuildInWaterMarkOptions,
  IBuildInCompressOptions,
  ILifecyclePlugins,
  IPathTransformedImgInfo,
  IPicGo,
  IPlugin,
  Undefinable,
  IImgInfo,
  IBuildInSkipProcessOptions
} from '../types'
import {
  getURLFile,
  handleUrlEncode,
  imageCompress,
  isUrl,
  isNeedCompress,
  isNeedAddWatermark,
  imageAddWaterMark,
  removeExif,
  renameFileNameWithCustomString,
  getConvertedFormat
} from '../utils/common'
import { IBuildInEvent } from '../utils/enum'
import { createContext } from '../utils/createContext'

const watermarkMsg = 'Add watermark to image'
const compressMsg = 'Compress or convert image'

const ttfFileLink = 'https://release.piclist.cn/simhei.ttf'

export class Lifecycle extends EventEmitter {
  private readonly ctx: IPicGo
  ttfPath: string

  constructor(ctx: IPicGo) {
    super()
    this.ctx = ctx
    this.ttfPath = path.join(ctx.baseDir, 'assets', 'simhei.ttf')
    ensureDirSync(path.join(ctx.baseDir, 'imgTemp'))
    const enableSecondUploader = ctx.getConfig<Undefinable<boolean>>('settings.enableSecondUploader') || false
    if (!enableSecondUploader) {
      emptyDirSync(path.join(ctx.baseDir, 'piclistTemp'))
    }
  }

  private async downloadTTF(): Promise<boolean> {
    try {
      ensureDirSync(path.dirname(this.ttfPath))
      if (fs.existsSync(this.ttfPath) && fs.statSync(this.ttfPath).size > 0) return true
      this.ctx.log.info('Download ttf file.')
      const res = await axios.get(ttfFileLink, { responseType: 'arraybuffer' })
      fs.writeFileSync(this.ttfPath, res.data)
      this.ctx.log.info('Download ttf file successfully.')
      return true
    } catch (e: any) {
      this.ctx.log.error('Download ttf file failed.')
      return false
    }
  }

  private helpGetOption(ctx: IPicGo): {
    compressOptions: Undefinable<IBuildInCompressOptions>
    watermarkOptions: Undefinable<IBuildInWaterMarkOptions>
  } {
    const compressOptions = ctx.getConfig<Undefinable<IBuildInCompressOptions>>('buildIn.compress')
    const watermarkOptions = ctx.getConfig<Undefinable<IBuildInWaterMarkOptions>>('buildIn.watermark')
    const type =
      ctx.getConfig<Undefinable<string>>('picBed.uploader') ||
      ctx.getConfig<Undefinable<string>>('picBed.current') ||
      'smms'
    const uploader = ctx.helper.uploader.get(type)
    if (!uploader && compressOptions) {
      compressOptions.picBed = 'smms'
    } else if (compressOptions) {
      compressOptions.picBed = type
    }
    return {
      compressOptions,
      watermarkOptions
    }
  }

  async start(input: any[], skipProcess = false): Promise<IPicGo> {
    // ensure every upload process has an unique context
    const ctx = createContext(this.ctx)
    try {
      if (!Array.isArray(input)) throw new Error('Input must be an array.')
      ctx.input = input
      ctx.output = [] as IImgInfo[]
      ctx.rawInputPath = [] as string[]
      ctx.rawInput = cloneDeep(input)
      if (skipProcess) {
        ctx.log.info('Skip process.')
        ctx.output = input
        await this.doUpload(ctx)
        ctx.input = ctx.rawInput
        await this.afterUpload(ctx)
        return ctx
      }
      // lifecycle main
      await this.preprocess(ctx)
      await this.beforeTransform(ctx)
      await this.doTransform(ctx)
      await this.buildInRename(ctx)
      await this.beforeUpload(ctx)
      ctx.processedInput = cloneDeep(ctx.output)
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

  private async preprocess(ctx: IPicGo): Promise<IPicGo> {
    const { compressOptions, watermarkOptions } = this.helpGetOption(ctx)
    const skipProcess = ctx.getConfig<Undefinable<IBuildInSkipProcessOptions>>('buildIn.skipProcess') || {}
    const skipProcessExtList = skipProcess.skipProcessExtList
      ? skipProcess.skipProcessExtList.split(',').map((item: string) => item.trim())
      : ['zip', 'rar', '7z', 'tar', 'gz', 'tar.gz', 'tar.bz2', 'tar.xz']

    const normalizedSkipSet = new Set(
      skipProcessExtList.map((item: string) => {
        const formattedItem = item.trim().toLowerCase()
        return formattedItem.startsWith('.') ? formattedItem : `.${formattedItem}`
      })
    )

    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 0)
    ctx.emit(IBuildInEvent.BEFORE_TRANSFORM, ctx)
    ctx.log.info('Before transform')
    if (compressOptions || watermarkOptions) {
      const tempFilePath = path.join(ctx.baseDir, 'piclistTemp')

      await Promise.allSettled(
        ctx.input.map(async (item: string, index: number) => {
          const itemIsUrl = isUrl(item)
          const info: IPathTransformedImgInfo = itemIsUrl ? await getURLFile(item, ctx) : { success: false }
          if (itemIsUrl && (!info.success || !info.buffer)) return

          let transformedBuffer: Undefinable<Buffer>
          let isSkip = false
          ctx.rawInputPath![index] = item
          const extension = itemIsUrl ? info.extname || '' : path.extname(item)
          const normalizedExtension = extension.toLowerCase()

          // Early check: if extension is in skip list, skip all processing
          const shouldSkipExtension = normalizedSkipSet.has(normalizedExtension)

          const fileBuffer: Buffer = itemIsUrl ? info.buffer! : fs.readFileSync(item)

          if (isNeedAddWatermark(watermarkOptions, extension) && !shouldSkipExtension) {
            if (!(watermarkOptions?.watermarkFontPath || watermarkOptions?.watermarkType === 'image')) {
              const downloadTTFRet = await this.downloadTTF()
              if (!downloadTTFRet) {
                this.ctx.log.warn('Download ttf file failed, skip add watermark.')
                isSkip = true
              }
            }
            if (!isSkip) {
              ctx.log.info(watermarkMsg)
              transformedBuffer = await imageAddWaterMark(fileBuffer, watermarkOptions!, this.ttfPath, ctx.log)
            }
          }

          if (isNeedCompress(compressOptions, extension) && !shouldSkipExtension) {
            ctx.log.info(compressMsg)
            if (!itemIsUrl && (normalizedExtension === '.heic' || normalizedExtension === '.heif')) {
              const heicResult = await heicConvert({
                buffer: fileBuffer,
                format: 'JPEG',
                quality: 1
              })
              const tempHeicConvertFile = path.join(tempFilePath, `${path.basename(item, extension)}.jpg`)
              fs.writeFileSync(tempHeicConvertFile, Buffer.from(heicResult))
              transformedBuffer = await imageCompress(
                fs.readFileSync(tempHeicConvertFile),
                compressOptions!,
                '.jpg',
                ctx.log
              )
            } else {
              transformedBuffer = await imageCompress(
                transformedBuffer ?? fileBuffer,
                compressOptions!,
                extension,
                ctx.log
              )
            }
          }

          if (!transformedBuffer && compressOptions?.isRemoveExif && !shouldSkipExtension) {
            ctx.log.info('Remove exif info.')
            transformedBuffer = await removeExif(fileBuffer, extension)
          }

          if (transformedBuffer) {
            let newExt = compressOptions?.isConvert ? getConvertedFormat(compressOptions, extension) : extension
            newExt = newExt.startsWith('.') ? newExt : `.${newExt}`
            const tempFile = itemIsUrl
              ? path.join(
                  tempFilePath,
                  `${
                    info.fileName
                      ? `${path.basename(info.fileName, path.extname(info.fileName))}`
                      : new Date().getTime()
                  }${newExt}`
                )
              : path.join(tempFilePath, `${path.basename(item, extension)}${newExt}`)
            ctx.rawInputPath![index] = path.join(
              path.dirname(item),
              itemIsUrl ? path.basename(tempFile) : `${path.basename(item, extension)}${newExt}`
            )
            fs.writeFileSync(tempFile, transformedBuffer)
            ctx.input[index] = tempFile
          }
        })
      )
    } else {
      for (const item of ctx.input) {
        ctx.rawInputPath!.push(item)
      }
    }
    return ctx
  }

  private async buildInRename(ctx: IPicGo): Promise<IPicGo> {
    const renameConfig = ctx.getConfig<any>('buildIn.rename') || {}
    if (renameConfig.enable) {
      const format = renameConfig.format || '{filename}'
      ctx.output = ctx.output.map((item: IImgInfo, index: number) => {
        let fileName = item.fileName
        if (format) {
          fileName = renameFileNameWithCustomString(
            ctx.rawInputPath![index],
            format,
            undefined,
            item.base64Image ? item.base64Image : item.buffer
          )
          fileName = fileName.replace(/\/+/g, '/')
          if (fileName.slice(-1) === '/') {
            fileName = fileName + index.toString()
          }
        }
        item.fileName = fileName
        return item
      })
    }
    return ctx
  }

  private async beforeTransform(ctx: IPicGo): Promise<IPicGo> {
    await this.handlePlugins(ctx.helper.beforeTransformPlugins, ctx)
    return ctx
  }

  private async doTransform(ctx: IPicGo): Promise<IPicGo> {
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

  private async beforeUpload(ctx: IPicGo): Promise<IPicGo> {
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, 60)
    ctx.log.info('Before upload')
    ctx.emit(IBuildInEvent.BEFORE_UPLOAD, ctx)
    await this.handlePlugins(ctx.helper.beforeUploadPlugins, ctx)
    return ctx
  }

  private async doUpload(ctx: IPicGo): Promise<IPicGo> {
    let type =
      ctx.getConfig<Undefinable<string>>('picBed.uploader') ||
      ctx.getConfig<Undefinable<string>>('picBed.current') ||
      'smms'
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

  private async afterUpload(ctx: IPicGo): Promise<IPicGo> {
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

  private async handlePlugins(lifeCyclePlugins: ILifecyclePlugins, ctx: IPicGo): Promise<IPicGo> {
    const plugins = lifeCyclePlugins.getList()
    const pluginNames = lifeCyclePlugins.getIdList()
    const lifeCycleName = lifeCyclePlugins.getName()
    await Promise.all(
      plugins.map(async (plugin: IPlugin, index: number) => {
        try {
          ctx.log.info(`${lifeCycleName}: ${pluginNames[index]} running`)
          await plugin.handle(ctx)
        } catch (e) {
          ctx.log.error(`${lifeCycleName}: ${pluginNames[index]} error`)
          throw e
        }
      })
    )
    return ctx
  }
}

export default Lifecycle
