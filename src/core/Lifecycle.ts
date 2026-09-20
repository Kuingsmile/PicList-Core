import { EventEmitter } from 'node:events'
import path from 'node:path'

import axios from 'axios'
import fs from 'fs-extra'
import { emptyDirSync, ensureDirSync } from 'fs-extra/esm'
import heicConvert from 'heic-convert'
import { cloneDeep } from 'lodash-es'
import sharp from 'sharp'

import {
  IBuildInCompressOptions,
  IBuildInListItem,
  IBuildInSkipProcessOptions,
  IBuildInWaterMarkOptions,
  IImgInfo,
  ILifecyclePlugins,
  IPathTransformedImgInfo,
  IPicGo,
  IPlugin,
  IStringKeyMap,
  Undefinable,
} from '../types'
import {
  getConvertedFormat,
  getImageTypeByMagicNumber,
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
import { ScriptHandler } from '../utils/runScripts'

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

/** Lifecycle progress percentages, with a negative sentinel indicating failure. */
const PROGRESS = {
  START: 0,
  TRANSFORM: 30,
  UPLOAD: 60,
  COMPLETE: 100,
  FAILED: -1,
} as const

/** Archive extensions excluded from image processing unless a configured list overrides them. */
const DEFAULT_SKIP_EXTENSIONS = ['zip', 'rar', '7z', 'tar', 'gz', 'tar.gz', 'tar.bz2', 'tar.xz']
const TTF_FILE_URL = 'https://release.piclist.cn/simhei.ttf'
const DEFAULT_UPLOADER = 'smms'

const getBuildInListItem = (buildInList: IBuildInListItem[], id: string): IBuildInListItem | undefined =>
  buildInList.find(item => item.id === id)

/** Selects uploader-specific exclusions before global exclusions, falling back to archive defaults. */
const resolveSkipProcessExtList = (idSpecificExtList?: string, globalExtList?: string): string[] => {
  if (idSpecificExtList) return idSpecificExtList.split(',').map((item: string) => item.trim())
  if (globalExtList) return globalExtList.split(',').map((item: string) => item.trim())
  return DEFAULT_SKIP_EXTENSIONS
}

/** Normalizes configured extensions into lowercase, dot-prefixed values for exact membership checks. */
const createSkipExtensionSet = (extensions: string[]): Set<string> =>
  new Set(
    extensions.map((item: string) => {
      const formattedItem = item.trim().toLowerCase()
      return formattedItem.startsWith('.') ? formattedItem : `.${formattedItem}`
    }),
  )

/** Uses the filename extension when present, otherwise identifies supported image bytes. */
const getLocalFileExtension = (filePath: string, fileBuffer: Buffer): string => {
  const extFromPath = path.extname(filePath)
  if (extFromPath) return extFromPath
  return getImageTypeByMagicNumber(fileBuffer) || extFromPath
}

/** Coordinates preprocessing, plugin stages, upload events, and temporary-file ownership. */
export class Lifecycle extends EventEmitter {
  private readonly ctx: IPicGo
  ttfPath: string

  /** Binds the lifecycle to its client and prepares image-processing directories. */
  constructor(ctx: IPicGo) {
    super()
    this.ctx = ctx
    this.ttfPath = path.join(ctx.baseDir, 'assets', 'simhei.ttf')
    this.initializeDirs()
  }

  /** Creates image staging directories and clears processed files when secondary uploads are disabled. */
  private initializeDirs(): void {
    ensureDirSync(path.join(this.ctx.baseDir, 'imgTemp'))
    const enableSecondUploader = this.ctx.getConfig<Undefinable<boolean>>('settings.enableSecondUploader') || false
    if (!enableSecondUploader) {
      emptyDirSync(path.join(this.ctx.baseDir, 'piclistTemp'))
    }
  }

  /** Ensures the default watermark font exists, returning false and logging when download fails. */
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

  /**
   * Combines global and uploader-profile processing options and normalizes format-conversion mappings.
   */
  private getProcessingOptions(ctx: IPicGo): {
    compressOptions: Undefinable<IBuildInCompressOptions>
    watermarkOptions: Undefinable<IBuildInWaterMarkOptions>
  } {
    const compressOptionsGlobal = ctx.getConfig<Undefinable<IBuildInCompressOptions>>('buildIn.compress')
    const watermarkOptionsGlobal = ctx.getConfig<Undefinable<IBuildInWaterMarkOptions>>('buildIn.watermark')
    const buildInList = ctx.getConfig<Undefinable<IBuildInListItem[]>>('buildIn.list') || ([] as IBuildInListItem[])

    const uploaderType = this.getUploaderType(ctx)
    const buildInListItem = getBuildInListItem(buildInList, uploaderType.id)
    const idSpecificCompressConfig = buildInListItem?.compress || {}
    const idSpecificWatermarkConfig = buildInListItem?.watermark || {}

    if (compressOptionsGlobal) {
      compressOptionsGlobal.picBed = uploaderType.picBed
      compressOptionsGlobal.id = uploaderType.id
      const formatConvertObj =
        typeof compressOptionsGlobal.formatConvertObj === 'string'
          ? safeParse(compressOptionsGlobal.formatConvertObj)
          : compressOptionsGlobal.formatConvertObj
      compressOptionsGlobal.formatConvertObj = formatConvertObj
    }

    if (watermarkOptionsGlobal) {
      watermarkOptionsGlobal.picBed = uploaderType.picBed
      watermarkOptionsGlobal.id = uploaderType.id
    }

    const treatedCompressOptions = getTreatedCompressOptions(
      compressOptionsGlobal,
      idSpecificCompressConfig,
      uploaderType.picBed,
      uploaderType.id,
    )
    const treatedWatermarkOptions = getTreatedWaterMarkOptions(
      watermarkOptionsGlobal,
      idSpecificWatermarkConfig,
      uploaderType.picBed,
      uploaderType.id,
    )

    return { compressOptions: treatedCompressOptions, watermarkOptions: treatedWatermarkOptions }
  }

  /** Resolves the selected uploader and profile, falling back to the legacy selector and then SM.MS. */
  getUploaderType(ctx: IPicGo): {
    picBed: string
    id: string
    config?: IStringKeyMap<any>
  } {
    const picBed =
      ctx.getConfig<Undefinable<string>>('picBed.uploader') ||
      ctx.getConfig<Undefinable<string>>('picBed.current') ||
      DEFAULT_UPLOADER
    const picBedConfig = ctx.getConfig<Undefinable<IStringKeyMap<string>>>(`picBed.${picBed}`) || {}
    const id = picBedConfig._id || ''
    return { picBed, id, config: picBedConfig }
  }

  /** Builds the effective image-processing exclusion set for the selected uploader profile. */
  private getSkipExtensions(ctx: IPicGo): Set<string> {
    const skipProcessGlobal = ctx.getConfig<Undefinable<IBuildInSkipProcessOptions>>('buildIn.skipProcess') || {}
    const buildInList = ctx.getConfig<Undefinable<IBuildInListItem[]>>('buildIn.list') || ([] as IBuildInListItem[])
    const uploaderType = this.getUploaderType(ctx)
    const idSpecificSkipProcessConfig = getBuildInListItem(buildInList, uploaderType.id)?.skipProcess || {}
    const skipProcessExtList = resolveSkipProcessExtList(
      idSpecificSkipProcessConfig.skipProcessExtList,
      skipProcessGlobal.skipProcessExtList,
    )

    return createSkipExtensionSet(skipProcessExtList)
  }

  // Main lifecycle methods
  /**
   * Runs an action and removes its registered temporary directories even when it fails.
   *
   * @param action - Receives a mutable directory list; append only directories owned by this
   * operation.
   * @returns The action result; cleanup failures are logged without replacing it.
   */
  async withTempFileCleanup<T>(action: (tempDirs: string[]) => Promise<T>): Promise<T> {
    const tempDirs: string[] = []
    try {
      return await action(tempDirs)
    } finally {
      await Promise.all(
        tempDirs.map(async tempDir => {
          try {
            await fs.remove(tempDir)
          } catch (_error) {
            this.ctx.log.warn('Failed to clean up processed upload files')
          }
        }),
      )
    }
  }

  /**
   * Runs an upload lifecycle using a derived context and returns its resulting state.
   *
   * @param input - Inputs for the configured transformer, or processed image records when skipping
   * processing.
   * @param skipProcess - Reuses processed records and runs only upload and after-upload stages.
   * @param tempDirs - Optional shared directory list whose caller owns cleanup; omitted for automatic
   * cleanup.
   * @returns The derived context, including partial output on failure unless debug mode rethrows.
   */
  async start(input: any[], skipProcess = false, tempDirs?: string[]): Promise<IPicGo> {
    // Secondary uploads share ownership until all upload hooks and scripts finish.
    if (!tempDirs) return this.withTempFileCleanup(dirs => this.start(input, skipProcess, dirs))

    const ctx = createContext(this.ctx)
    try {
      if (!Array.isArray(input)) throw new Error('Input must be an array.')

      this.initializeContext(ctx, input)

      if (skipProcess) {
        return await this.handleSkipProcess(ctx)
      }

      return await this.executeLifecycle(ctx, tempDirs)
    } catch (e: any) {
      return this.handleError(ctx, e)
    }
  }

  /** Resets per-upload arrays and snapshots original inputs on a derived context. */
  private initializeContext(ctx: IPicGo, input: any[]): void {
    ctx.input = [...input]
    ctx.output = [] as IImgInfo[]
    ctx.processedInput = [] as any[]
    ctx.rawInputPath = [] as string[]
    ctx.rawInput = cloneDeep(input)
  }

  /** Uploads already processed records and runs upload and after-upload scripts and hooks. */
  private async handleSkipProcess(ctx: IPicGo): Promise<IPicGo> {
    const handler = new ScriptHandler(ctx)
    await handler.refreshCache()
    ctx.output = ctx.input
    await this.doUpload(ctx)
    await handler.runStage('upload')
    ctx.input = ctx.rawInput
    await this.afterUpload(ctx)
    await handler.runStage('afterUpload')
    return ctx
  }

  /** Runs processing, transformation, renaming, upload, and corresponding script stages in order. */
  private async executeLifecycle(ctx: IPicGo, tempDirs: string[]): Promise<IPicGo> {
    const handler = new ScriptHandler(ctx)
    await handler.refreshCache()
    await this.preprocess(ctx, tempDirs)
    await handler.runStage('preProcess')
    await this.beforeTransform(ctx)
    await handler.runStage('beforeTransform')
    await this.doTransform(ctx)
    await handler.runStage('transform')
    await this.buildInRename(ctx)
    await this.beforeUpload(ctx)
    await handler.runStage('beforeUpload')
    ctx.processedInput = cloneDeep(ctx.output)
    await this.doUpload(ctx)
    await handler.runStage('upload')
    ctx.input = ctx.rawInput
    await this.afterUpload(ctx)
    await handler.runStage('afterUpload')
    return ctx
  }

  /** Emits failure events and logs the error, rethrowing only when debug mode is enabled. */
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
  /** Resolves processing settings, announces progress, and prepares processed files or source paths. */
  private async preprocess(ctx: IPicGo, tempDirs: string[]): Promise<IPicGo> {
    const { compressOptions, watermarkOptions } = this.getProcessingOptions(ctx)
    const skipExtensions = this.getSkipExtensions(ctx)

    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, PROGRESS.START)
    ctx.emit(IBuildInEvent.BEFORE_TRANSFORM, ctx)
    ctx.log.info('Pre-processing images, please wait...')

    if (compressOptions || watermarkOptions) {
      const tempFilePath = path.join(ctx.baseDir, 'piclistTemp')
      await this.processImages(ctx, tempFilePath, compressOptions, watermarkOptions, skipExtensions, tempDirs)
    } else {
      this.initializeRawInputPaths(ctx)
    }
    return ctx
  }

  /** Retains original input paths when no image-processing pass is required. */
  private initializeRawInputPaths(ctx: IPicGo): void {
    for (const item of ctx.input) {
      ctx.rawInputPath.push(item)
    }
  }

  /** Processes inputs concurrently in isolated temporary directories and logs individual failures. */
  private async processImages(
    ctx: IPicGo,
    tempFilePath: string,
    compressOptions: Undefinable<IBuildInCompressOptions>,
    watermarkOptions: Undefinable<IBuildInWaterMarkOptions>,
    skipExtensions: Set<string>,
    tempDirs: string[],
  ): Promise<void> {
    await fs.ensureDir(tempFilePath)
    const uploadTempPath = await fs.mkdtemp(path.join(tempFilePath, 'upload-'))
    tempDirs.push(uploadTempPath)
    const res = await Promise.allSettled(
      ctx.input.map(async (item: string, index: number) => {
        // Isolate each input while preserving its basename for transformers and uploaders.
        const inputTempPath = path.join(uploadTempPath, index.toString())
        await fs.ensureDir(inputTempPath)
        await this.processImage(item, index, ctx, inputTempPath, compressOptions, watermarkOptions, skipExtensions)
      }),
    )
    for (const item of res) {
      if (item.status === 'rejected') {
        ctx.log.error('Error processing image:', item.reason)
      }
    }
  }

  /**
   * Loads a local or remote input, applies eligible processing, and replaces its path when bytes
   * change.
   */
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

    ctx.rawInputPath[index] = item
    const localFileBuffer = itemIsUrl ? undefined : fs.readFileSync(item)
    const extension = itemIsUrl ? info.extname || '' : getLocalFileExtension(item, localFileBuffer!)
    const shouldSkipExtension = skipExtensions.has(extension.toLowerCase())

    const fileBuffer: Buffer = itemIsUrl ? info.buffer! : localFileBuffer!
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

  /**
   * Applies compression before watermarking, or strips EXIF when no prior step produced output.
   *
   * @returns Processed bytes, or undefined when processing produced no replacement.
   */
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
      transformedBuffer = await this.addWatermark(transformedBuffer ?? fileBuffer, watermarkOptions!, ctx)
    }

    // Remove EXIF if needed
    if (!transformedBuffer && compressOptions?.isRemoveExif && !shouldSkipExtension) {
      ctx.log.info(MESSAGES.REMOVE_EXIF)
      transformedBuffer = await removeExif(fileBuffer, extension)
    }

    return transformedBuffer
  }

  /** Ensures a font is available for text watermarks and returns undefined if font setup fails. */
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

  /** Compresses or converts an image, routing local HEIC and HEIF files through JPEG conversion. */
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

  /** Converts HEIC bytes to JPEG, stages the intermediate file, and applies compression settings. */
  private async convertHeicAndCompress(
    fileBuffer: Buffer,
    item: string,
    extension: string,
    tempFilePath: string,
    compressOptions: IBuildInCompressOptions,
    ctx: IPicGo,
  ): Promise<Buffer> {
    const convertedBuffer = await this.convertHeicToJpegBuffer(fileBuffer)
    const tempHeicConvertFile = path.join(tempFilePath, `${path.basename(item, extension)}.jpg`)
    fs.writeFileSync(tempHeicConvertFile, convertedBuffer)
    return await imageCompress(convertedBuffer, compressOptions, '.jpg', ctx.log)
  }

  /** Converts HEIC to JPEG with Sharp, falling back to heic-convert if Sharp fails. */
  private async convertHeicToJpegBuffer(fileBuffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(fileBuffer, { animated: true })
        .jpeg({
          quality: 100,
        })
        .toBuffer()
    } catch (_sharpError) {
      const heicResult = await heicConvert({
        buffer: fileBuffer,
        format: 'JPEG',
        quality: 1,
      })
      return Buffer.from(heicResult)
    }
  }

  /** Writes processed bytes under the converted filename and updates lifecycle input and source paths. */
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

    const fileName = itemIsUrl ? `${this.getFileBaseName(info)}${newExt}` : `${path.basename(item, extension)}${newExt}`
    const tempFile = path.join(tempFilePath, fileName)

    ctx.rawInputPath[index] = path.join(path.dirname(item), fileName)

    fs.writeFileSync(tempFile, transformedBuffer)
    ctx.input[index] = tempFile
  }

  /** Derives a remote image basename, falling back to the current timestamp when none is available. */
  private getFileBaseName(info: IPathTransformedImgInfo): string {
    return info.fileName ? path.basename(info.fileName, path.extname(info.fileName)) : new Date().getTime().toString()
  }

  // Rename functionality
  /** Applies merged rename rules while preserving the association with each original input. */
  private async buildInRename(ctx: IPicGo): Promise<IPicGo> {
    const uploaderType = this.getUploaderType(ctx)
    const globalRenameConfig = ctx.getConfig<any>('buildIn.rename') || {}
    const buildInList = ctx.getConfig<Undefinable<IBuildInListItem[]>>('buildIn.list') || ([] as IBuildInListItem[])
    const idSpecificRenameConfig = buildInList.find(item => item.id === uploaderType.id)?.rename || {}
    const renameConfig = {
      ...globalRenameConfig,
      ...idSpecificRenameConfig,
    }
    if (!renameConfig.enable) return ctx

    const format = renameConfig.format || '{filename}'
    ctx.output = ctx.output.map((item: IImgInfo, index: number) => {
      let fileName = item.fileName
      if (format) {
        fileName = renameFileNameWithCustomString(
          ctx.rawInputPath[item.inputIndex ?? index],
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

  /** Awaits all registered hooks that prepare inputs before transformation. */
  private async beforeTransform(ctx: IPicGo): Promise<IPicGo> {
    await this.handlePlugins(ctx.helper.beforeTransformPlugins, ctx)
    return ctx
  }

  /** Runs the selected transformer, falling back to the built-in path transformer if unavailable. */
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

  /** Announces upload preparation and awaits all before-upload hooks. */
  private async beforeUpload(ctx: IPicGo): Promise<IPicGo> {
    ctx.emit(IBuildInEvent.UPLOAD_PROGRESS, PROGRESS.UPLOAD)
    ctx.log.info('Before upload')
    ctx.emit(IBuildInEvent.BEFORE_UPLOAD, ctx)
    await this.handlePlugins(ctx.helper.beforeUploadPlugins, ctx)
    return ctx
  }

  /** Runs the selected uploader or SM.MS fallback and records its type on each output image. */
  private async doUpload(ctx: IPicGo): Promise<IPicGo> {
    const uploaderType = this.getUploaderType(ctx)
    let uploader = ctx.helper.uploader.get(uploaderType.picBed)
    let currentUploader = uploaderType.picBed
    if (!uploader) {
      ctx.log.warn(`Can't find uploader - ${currentUploader}, switch to default uploader - ${DEFAULT_UPLOADER}`)
      currentUploader = DEFAULT_UPLOADER
      uploader = ctx.helper.uploader.get(DEFAULT_UPLOADER)
    }

    ctx.log.info(
      `Uploading... Current uploader is [${currentUploader}] with config id [${uploaderType.id || 'default'}]`,
    )
    await uploader?.handle(ctx)

    for (const outputImg of ctx.output) {
      outputImg.type = currentUploader
    }
    return ctx
  }

  /** Runs final hooks, removes image payloads, emits completion, and logs uploaded URLs. */
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
  /**
   * Runs a lifecycle stage's hooks concurrently and waits for every hook before rethrowing the first
   * failure.
   */
  private async handlePlugins(lifeCyclePlugins: ILifecyclePlugins, ctx: IPicGo): Promise<IPicGo> {
    const plugins = lifeCyclePlugins.getList()
    const pluginNames = lifeCyclePlugins.getIdList()
    const lifeCycleName = lifeCyclePlugins.getName()

    const results = await Promise.allSettled(
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
    // All hooks must stop using processed files before the upload can clean them up.
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    return ctx
  }
}

export default Lifecycle
