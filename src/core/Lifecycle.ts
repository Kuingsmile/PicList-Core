import { EventEmitter } from 'node:events'
import path from 'node:path'

import axios from 'axios'
import fs from 'fs-extra'
import { emptyDirSync, ensureDirSync } from 'fs-extra/esm'
import heicConvert from 'heic-convert'
import { cloneDeep } from 'lodash-es'

import {
  IBuildInCompressOptions,
  IBuildInSkipProcessOptions,
  IBuildInWaterMarkOptions,
  IImgInfo,
  ILifecyclePlugins,
  IPathTransformedImgInfo,
  IPicGo,
  IPlugin,
  Undefinable,
} from '../types'
import {
  getConvertedFormat,
  getTreatedCompressOptions,
  getTreatedWaterMarkOptions,
  getURLFile,
  handleUrlEncode,
  imageAddWaterMark,
  imageCompress,
  isNeedAddWatermark,
  isNeedCompress,
  isUrl,
  removeExif,
  renameFileNameWithCustomString,
  safeParse,
} from '../utils/common'
import { createContext } from '../utils/createContext'
import { IBuildInEvent } from '../utils/enum'

// Constants
const MESSAGES = {
  WATERMARK: 'Add watermark to image',
  COMPRESS: 'Compress or convert image',
  REMOVE_EXIF: 'Remove exif info',
  DOWNLOAD_TTF: 'Download ttf file',
  DOWNLOAD_TTF_SUCCESS: 'Download ttf file successfully',
  DOWNLOAD_TTF_FAILED: 'Download ttf file failed',
  DOWNLOAD_TTF_SKIP: 'Download ttf file failed, skip add watermark',
} as const

const PROGRESS = {
  START: 0,
  TRANSFORM: 30,
  UPLOAD: 60,
  COMPLETE: 100,
  FAILED: -1,
} as const

const DEFAULT_SKIP_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz', 'tar.gz', 'tar.bz2', 'tar.xz']
const TTF_FILE_URL = 'https://release.piclist.cn/simhei.ttf'
const DEFAULT_UPLOADER = 'smms'

export class Lifecycle extends EventEmitter {
  private readonly ctx: IPicGo
  ttfPath: string

  constructor(ctx: IPicGo) {
    super()
    this.ctx = ctx
    this.ttfPath = path.join(ctx.baseDir, 'assets', 'simhei.ttf')
    this.initializeDirs()
  }

  private initializeDirs(): void {
    ensureDirSync(path.join(this.ctx.baseDir, 'imgTemp'))
    const enableSecondUploader = this.ctx.getConfig<Undefinable<boolean>>('settings.enableSecondUploader') || false
    if (!enableSecondUploader) {
      emptyDirSync(path.join(this.ctx.baseDir, 'piclistTemp'))
    }
  }

  private async downloadTTF(): Promise<boolean> {
    try {
      ensureDirSync(path.dirname(this.ttfPath))
      if (fs.existsSync(this.ttfPath) && fs.statSync(this.ttfPath).size > 0) return true

      this.ctx.log.info(MESSAGES.DOWNLOAD_TTF)
      const res = await axios.get(TTF_FILE_URL, { responseType: 'arraybuffer' })
      fs.writeFileSync(this.ttfPath, res.data)
      this.ctx.log.info(MESSAGES.DOWNLOAD_TTF_SUCCESS)
      return true
    } catch (_e: any) {
      this.ctx.log.error(MESSAGES.DOWNLOAD_TTF_FAILED)
      return false
    }
  }

  private getProcessingOptions(ctx: IPicGo): {
    compressOptions: Undefinable<IBuildInCompressOptions>
    watermarkOptions: Undefinable<IBuildInWaterMarkOptions>
  } {
    const compressOptions = ctx.getConfig<Undefinable<IBuildInCompressOptions>>('buildIn.compress')
    const watermarkOptions = ctx.getConfig<Undefinable<IBuildInWaterMarkOptions>>('buildIn.watermark')

    const type = this.getUploaderType(ctx)

    if (compressOptions) {
      compressOptions.picBed = type
      const formatConvertObj =
        typeof compressOptions.formatConvertObj === 'string'
          ? safeParse(compressOptions.formatConvertObj)
          : compressOptions.formatConvertObj
      compressOptions.formatConvertObj = formatConvertObj
    }

    if (watermarkOptions) {
      watermarkOptions.picBed = type
    }

    const treatedCompressOptions = getTreatedCompressOptions(compressOptions, type)
    const treatedWatermarkOptions = getTreatedWaterMarkOptions(watermarkOptions, type)

    return { compressOptions: treatedCompressOptions, watermarkOptions: treatedWatermarkOptions }
  }

  private getUploaderType(ctx: IPicGo): string {
    return (
      ctx.getConfig<Undefinable<string>>('picBed.uploader') ||
      ctx.getConfig<Undefinable<string>>('picBed.current') ||
      DEFAULT_UPLOADER
    )
  }

  private getSkipExtensions(ctx: IPicGo): Set<string> {
    const skipProcess = ctx.getConfig<Undefinable<IBuildInSkipProcessOptions>>('buildIn.skipProcess') || {}
    const skipProcessExtList = skipProcess.skipProcessExtList
      ? skipProcess.skipProcessExtList.split(',').map((item: string) => item.trim())
      : DEFAULT_SKIP_EXTENSIONS

    return new Set(
      skipProcessExtList.map((item: string) => {
        const formattedItem = item.trim().toLowerCase()
        return formattedItem.startsWith('.') ? formattedItem : `.${formattedItem}`
      }),
    )
  }

  // Main lifecycle methods
  async start(input: any[], skipProcess = false): Promise<IPicGo> {
    const ctx = createContext(this.ctx)
    try {
      if (!Array.isArray(input)) throw new Error('Input must be an array.')

      this.initializeContext(ctx, input)

      if (skipProcess) {
        return await this.handleSkipProcess(ctx)
      }

      return await this.executeLifecycle(ctx)
    } catch (e: any) {
      return this.handleError(ctx, e)
    }
  }

  private initializeContext(ctx: IPicGo, input: any[]): void {
    ctx.input = input
    ctx.output = [] as IImgInfo[]
    ctx.rawInputPath = [] as string[]
    ctx.rawInput = cloneDeep(input)
  }

  private async handleSkipProcess(ctx: IPicGo): Promise<IPicGo> {
    ctx.log.info('Skip process.')
    ctx.output = ctx.input
    await this.doUpload(ctx)
    ctx.input = ctx.rawInput
    await this.afterUpload(ctx)
    return ctx
  }

  private async executeLifecycle(ctx: IPicGo): Promise<IPicGo> {
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
  }

  private handleError(ctx: IPicGo, error: any): IPicGo {
    ctx.log.warn(IBuildInEvent.FAILED)
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, PROGRESS.FAILED)
    ctx.emit(IBuildInEvent.FAILED, error)
    ctx.log.error(error)

    if (ctx.getConfig<Undefinable<string>>('debug')) {
      throw error
    }
    return ctx
  }

  // Processing methods
  private async preprocess(ctx: IPicGo): Promise<IPicGo> {
    const { compressOptions, watermarkOptions } = this.getProcessingOptions(ctx)
    const skipExtensions = this.getSkipExtensions(ctx)

    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, PROGRESS.START)
    ctx.emit(IBuildInEvent.BEFORE_TRANSFORM, ctx)
    ctx.log.info('Before transform')

    if (compressOptions || watermarkOptions) {
      const tempFilePath = path.join(ctx.baseDir, 'piclistTemp')
      await this.processImages(ctx, tempFilePath, compressOptions, watermarkOptions, skipExtensions)
    } else {
      this.initializeRawInputPaths(ctx)
    }
    return ctx
  }

  private initializeRawInputPaths(ctx: IPicGo): void {
    for (const item of ctx.input) {
      ctx.rawInputPath!.push(item)
    }
  }

  private async processImages(
    ctx: IPicGo,
    tempFilePath: string,
    compressOptions: Undefinable<IBuildInCompressOptions>,
    watermarkOptions: Undefinable<IBuildInWaterMarkOptions>,
    skipExtensions: Set<string>,
  ): Promise<void> {
    await Promise.allSettled(
      ctx.input.map(async (item: string, index: number) => {
        await this.processImage(item, index, ctx, tempFilePath, compressOptions, watermarkOptions, skipExtensions)
      }),
    )
  }

  private async processImage(
    item: string,
    index: number,
    ctx: IPicGo,
    tempFilePath: string,
    compressOptions: Undefinable<IBuildInCompressOptions>,
    watermarkOptions: Undefinable<IBuildInWaterMarkOptions>,
    skipExtensions: Set<string>,
  ): Promise<void> {
    const itemIsUrl = isUrl(item)
    const info: IPathTransformedImgInfo = itemIsUrl ? await getURLFile(item, ctx) : { success: false }

    if (itemIsUrl && (!info.success || !info.buffer)) return

    ctx.rawInputPath![index] = item
    const extension = itemIsUrl ? info.extname || '' : path.extname(item)
    const shouldSkipExtension = skipExtensions.has(extension.toLowerCase())

    const fileBuffer: Buffer = itemIsUrl ? info.buffer! : fs.readFileSync(item)
    const transformedBuffer = await this.applyProcessing(
      fileBuffer,
      extension,
      compressOptions,
      watermarkOptions,
      shouldSkipExtension,
      item,
      tempFilePath,
      ctx,
    )

    if (transformedBuffer) {
      await this.saveProcessedImage(
        item,
        index,
        ctx,
        tempFilePath,
        transformedBuffer,
        extension,
        compressOptions,
        itemIsUrl,
        info,
      )
    }
  }

  private async applyProcessing(
    fileBuffer: Buffer,
    extension: string,
    compressOptions: Undefinable<IBuildInCompressOptions>,
    watermarkOptions: Undefinable<IBuildInWaterMarkOptions>,
    shouldSkipExtension: boolean,
    item: string,
    tempFilePath: string,
    ctx: IPicGo,
  ): Promise<Buffer | undefined> {
    let transformedBuffer: Buffer | undefined

    // Apply compression
    if (isNeedCompress(compressOptions, extension) && !shouldSkipExtension) {
      transformedBuffer = await this.compressImage(
        fileBuffer,
        transformedBuffer,
        extension,
        compressOptions!,
        item,
        tempFilePath,
        ctx,
      )
    }

    // Apply watermark
    if (isNeedAddWatermark(watermarkOptions, extension) && !shouldSkipExtension) {
      transformedBuffer = await this.addWatermark(fileBuffer, watermarkOptions!, ctx)
    }

    // Remove EXIF if needed
    if (!transformedBuffer && compressOptions?.isRemoveExif && !shouldSkipExtension) {
      ctx.log.info(MESSAGES.REMOVE_EXIF)
      transformedBuffer = await removeExif(fileBuffer, extension)
    }

    return transformedBuffer
  }

  private async addWatermark(
    fileBuffer: Buffer,
    watermarkOptions: IBuildInWaterMarkOptions,
    ctx: IPicGo,
  ): Promise<Buffer | undefined> {
    if (!(watermarkOptions?.watermarkFontPath || watermarkOptions?.watermarkType === 'image')) {
      const downloadTTFRet = await this.downloadTTF()
      if (!downloadTTFRet) {
        this.ctx.log.warn(MESSAGES.DOWNLOAD_TTF_SKIP)
        return undefined
      }
    }

    ctx.log.info(MESSAGES.WATERMARK)
    return await imageAddWaterMark(fileBuffer, watermarkOptions, this.ttfPath, ctx.log)
  }

  private async compressImage(
    fileBuffer: Buffer,
    transformedBuffer: Buffer | undefined,
    extension: string,
    compressOptions: IBuildInCompressOptions,
    item: string,
    tempFilePath: string,
    ctx: IPicGo,
  ): Promise<Buffer> {
    ctx.log.info(MESSAGES.COMPRESS)
    const normalizedExtension = extension.toLowerCase()

    if (!isUrl(item) && (normalizedExtension === '.heic' || normalizedExtension === '.heif')) {
      return await this.convertHeicAndCompress(fileBuffer, item, extension, tempFilePath, compressOptions, ctx)
    }

    return await imageCompress(transformedBuffer ?? fileBuffer, compressOptions, extension, ctx.log)
  }

  private async convertHeicAndCompress(
    fileBuffer: Buffer,
    item: string,
    extension: string,
    tempFilePath: string,
    compressOptions: IBuildInCompressOptions,
    ctx: IPicGo,
  ): Promise<Buffer> {
    const heicResult = await heicConvert({
      buffer: fileBuffer.buffer,
      format: 'JPEG',
      quality: 1,
    })
    const tempHeicConvertFile = path.join(tempFilePath, `${path.basename(item, extension)}.jpg`)
    fs.writeFileSync(tempHeicConvertFile, Buffer.from(heicResult))
    return await imageCompress(fs.readFileSync(tempHeicConvertFile), compressOptions, '.jpg', ctx.log)
  }

  private async saveProcessedImage(
    item: string,
    index: number,
    ctx: IPicGo,
    tempFilePath: string,
    transformedBuffer: Buffer,
    extension: string,
    compressOptions: Undefinable<IBuildInCompressOptions>,
    itemIsUrl: boolean,
    info: IPathTransformedImgInfo,
  ): Promise<void> {
    let newExt = compressOptions?.isConvert ? getConvertedFormat(compressOptions, extension) : extension
    newExt = newExt.startsWith('.') ? newExt : `.${newExt}`

    const tempFile = itemIsUrl
      ? path.join(tempFilePath, `${this.getFileBaseName(info)}${newExt}`)
      : path.join(tempFilePath, `${path.basename(item, extension)}${newExt}`)

    ctx.rawInputPath![index] = path.join(
      path.dirname(item),
      itemIsUrl ? path.basename(tempFile) : `${path.basename(item, extension)}${newExt}`,
    )

    fs.writeFileSync(tempFile, transformedBuffer)
    ctx.input[index] = tempFile
  }

  private getFileBaseName(info: IPathTransformedImgInfo): string {
    return info.fileName ? path.basename(info.fileName, path.extname(info.fileName)) : new Date().getTime().toString()
  }

  // Rename functionality
  private async buildInRename(ctx: IPicGo): Promise<IPicGo> {
    const renameConfig = ctx.getConfig<any>('buildIn.rename') || {}
    if (!renameConfig.enable) return ctx

    const format = renameConfig.format || '{filename}'
    ctx.output = ctx.output.map((item: IImgInfo, index: number) => {
      let fileName = item.fileName
      if (format) {
        fileName = renameFileNameWithCustomString(
          ctx.rawInputPath![index],
          format,
          undefined,
          item.base64Image ? item.base64Image : item.buffer,
        )
        fileName = fileName.replace(/\/+/g, '/')
        if (fileName.slice(-1) === '/') {
          fileName = fileName + index.toString()
        }
      }
      item.fileName = fileName
      return item
    })
    return ctx
  }

  private async beforeTransform(ctx: IPicGo): Promise<IPicGo> {
    await this.handlePlugins(ctx.helper.beforeTransformPlugins, ctx)
    return ctx
  }

  private async doTransform(ctx: IPicGo): Promise<IPicGo> {
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, PROGRESS.TRANSFORM)
    const type = ctx.getConfig<Undefinable<string>>('picBed.transformer') || 'path'
    let transformer = ctx.helper.transformer.get(type)
    let currentTransformer = type

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
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, PROGRESS.UPLOAD)
    ctx.log.info('Before upload')
    ctx.emit(IBuildInEvent.BEFORE_UPLOAD, ctx)
    await this.handlePlugins(ctx.helper.beforeUploadPlugins, ctx)
    return ctx
  }

  private async doUpload(ctx: IPicGo): Promise<IPicGo> {
    const type = this.getUploaderType(ctx)
    let uploader = ctx.helper.uploader.get(type)
    let currentUploader = type

    if (!uploader) {
      ctx.log.warn(`Can't find uploader - ${type}, switch to default uploader - ${DEFAULT_UPLOADER}`)
      currentUploader = DEFAULT_UPLOADER
      uploader = ctx.helper.uploader.get(DEFAULT_UPLOADER)
    }

    ctx.log.info(`Uploading... Current uploader is [${currentUploader}]`)
    await uploader?.handle(ctx)

    for (const outputImg of ctx.output) {
      outputImg.type = currentUploader
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

  // Plugin handling
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
      }),
    )
    return ctx
  }
}

export default Lifecycle
