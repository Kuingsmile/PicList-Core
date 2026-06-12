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

const jpegExifHeader = Buffer.from('Exif\0\0', 'binary')
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const riffHeader = 'RIFF'
const webpHeader = 'WEBP'

interface BmffBox {
  type: string
  start: number
  size: number
  headerSize: number
  dataStart: number
  end: number
}

interface BmffInterval {
  start: number
  end: number
}

interface IlocExtent {
  index: number
  offset: number
  length: number
}

interface IlocEntry {
  itemId: number
  constructionMethod: number
  constructionMethodField: number
  dataReferenceIndex: number
  baseOffset: number
  extents: IlocExtent[]
}

interface IlocParseResult {
  version: number
  flags: Buffer
  offsetSize: number
  lengthSize: number
  baseOffsetSize: number
  indexSize: number
  entries: IlocEntry[]
}

interface IinfParseResult {
  version: number
  flags: Buffer
  countSize: number
  keptEntries: Buffer[]
  exifItemIds: Set<number>
}

interface HeifMetaRemovalPlan {
  removedIntervals: BmffInterval[]
  buildMeta: (shiftPosition: (position: number) => number) => Buffer | undefined
}

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

function isJpegStandaloneMarker(marker: number): boolean {
  return marker === 0x01 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)
}

function stripJpegExif(img: Buffer): Buffer {
  if (img.length < 4 || img[0] !== 0xff || img[1] !== 0xd8) return img

  const chunks: Buffer[] = [img.subarray(0, 2)]
  let offset = 2
  let removed = false

  while (offset < img.length) {
    if (img[offset] !== 0xff) return img

    const markerStart = offset
    while (offset < img.length && img[offset] === 0xff) {
      offset++
    }
    if (offset >= img.length) return img

    const marker = img[offset]
    offset++

    if (marker === 0xda) {
      chunks.push(img.subarray(markerStart))
      return removed ? Buffer.concat(chunks) : img
    }

    if (isJpegStandaloneMarker(marker)) {
      chunks.push(img.subarray(markerStart, offset))
      if (marker === 0xd9) {
        if (offset < img.length) chunks.push(img.subarray(offset))
        return removed ? Buffer.concat(chunks) : img
      }
      continue
    }

    if (offset + 2 > img.length) return img

    const segmentLength = img.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > img.length) return img

    const segmentEnd = offset + segmentLength
    const payloadStart = offset + 2
    const hasExifHeader =
      marker === 0xe1 &&
      payloadStart + jpegExifHeader.length <= segmentEnd &&
      img.subarray(payloadStart, payloadStart + jpegExifHeader.length).equals(jpegExifHeader)

    if (hasExifHeader) {
      removed = true
    } else {
      chunks.push(img.subarray(markerStart, segmentEnd))
    }

    offset = segmentEnd
  }

  return removed ? Buffer.concat(chunks) : img
}

function stripPngExif(img: Buffer): Buffer {
  if (img.length < pngSignature.length + 12 || !img.subarray(0, pngSignature.length).equals(pngSignature)) return img

  const chunks: Buffer[] = [img.subarray(0, pngSignature.length)]
  let offset = pngSignature.length
  let removed = false

  while (offset + 12 <= img.length) {
    const chunkStart = offset
    const length = img.readUInt32BE(offset)
    const typeStart = offset + 4
    const dataStart = offset + 8
    const chunkEnd = dataStart + length + 4

    if (chunkEnd > img.length) return img

    const chunkType = img.subarray(typeStart, dataStart).toString('ascii')
    if (chunkType === 'eXIf') {
      removed = true
    } else {
      chunks.push(img.subarray(chunkStart, chunkEnd))
    }

    offset = chunkEnd
    if (chunkType === 'IEND') {
      if (offset < img.length) chunks.push(img.subarray(offset))
      return removed ? Buffer.concat(chunks) : img
    }
  }

  return img
}

function stripWebpExif(img: Buffer): Buffer {
  if (
    img.length < 12 ||
    img.subarray(0, 4).toString('ascii') !== riffHeader ||
    img.subarray(8, 12).toString('ascii') !== webpHeader
  ) {
    return img
  }

  const chunks: Buffer[] = [Buffer.from(img.subarray(0, 12))]
  let offset = 12
  let removed = false

  while (offset + 8 <= img.length) {
    const chunkStart = offset
    const chunkType = img.subarray(offset, offset + 4).toString('ascii')
    const chunkSize = img.readUInt32LE(offset + 4)
    const chunkDataStart = offset + 8
    const chunkEnd = chunkDataStart + chunkSize
    const paddedChunkEnd = chunkEnd + (chunkSize % 2)

    if (chunkEnd > img.length || paddedChunkEnd > img.length) return img

    if (chunkType === 'EXIF') {
      removed = true
    } else {
      chunks.push(img.subarray(chunkStart, paddedChunkEnd))
    }

    offset = paddedChunkEnd
  }

  if (!removed || offset !== img.length) return img

  const output = Buffer.concat(chunks)
  output.writeUInt32LE(output.length - 8, 4)
  return output
}

function readUIntOfSize(buffer: Buffer, offset: number, size: number): number | undefined {
  if (size === 0) return 0
  if (size < 0 || size > 8 || offset + size > buffer.length) return undefined

  let value = 0n
  for (let index = 0; index < size; index++) {
    value = (value << 8n) + BigInt(buffer[offset + index])
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return undefined
  return Number(value)
}

function writeUIntOfSize(buffer: Buffer, offset: number, size: number, value: number): boolean {
  if (size === 0) return true
  if (size < 0 || size > 8 || offset + size > buffer.length || value < 0 || !Number.isSafeInteger(value)) return false

  const maxValue = 1n << (BigInt(size) * 8n)
  let remaining = BigInt(value)
  if (remaining >= maxValue) return false

  for (let index = size - 1; index >= 0; index--) {
    buffer[offset + index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
  return true
}

function readBmffBox(buffer: Buffer, offset: number, limit = buffer.length): BmffBox | undefined {
  if (offset + 8 > limit) return undefined

  let size = buffer.readUInt32BE(offset)
  let headerSize = 8
  if (size === 1) {
    const largeSize = readUIntOfSize(buffer, offset + 8, 8)
    if (!largeSize) return undefined
    size = largeSize
    headerSize = 16
  } else if (size === 0) {
    size = limit - offset
  }

  if (size < headerSize || offset + size > limit) return undefined

  return {
    type: buffer.subarray(offset + 4, offset + 8).toString('ascii'),
    start: offset,
    size,
    headerSize,
    dataStart: offset + headerSize,
    end: offset + size,
  }
}

function parseBmffBoxes(buffer: Buffer, start: number, end: number): BmffBox[] | undefined {
  const boxes: BmffBox[] = []
  let offset = start

  while (offset < end) {
    const box = readBmffBox(buffer, offset, end)
    if (!box) return undefined
    boxes.push(box)
    offset = box.end
  }

  return offset === end ? boxes : undefined
}

function buildBmffBox(type: string, payload: Buffer): Buffer {
  const output = Buffer.alloc(8 + payload.length)
  output.writeUInt32BE(output.length, 0)
  output.write(type, 4, 4, 'ascii')
  payload.copy(output, 8)
  return output
}

function parseInfeExifItemId(entry: Buffer): number | undefined {
  const box = readBmffBox(entry, 0)
  if (!box || box.type !== 'infe' || box.end !== entry.length || box.dataStart + 12 > entry.length) return undefined

  const version = entry[box.dataStart]
  if (version < 2) return undefined

  const itemIdSize = version === 2 ? 2 : 4
  const itemId = readUIntOfSize(entry, box.dataStart + 4, itemIdSize)
  const itemTypeOffset = box.dataStart + 4 + itemIdSize + 2
  if (itemId === undefined || itemTypeOffset + 4 > entry.length) return undefined

  return entry.subarray(itemTypeOffset, itemTypeOffset + 4).toString('ascii') === 'Exif' ? itemId : undefined
}

function parseIinfForExifRemoval(payload: Buffer): IinfParseResult | undefined {
  if (payload.length < 6) return undefined

  const version = payload[0]
  const countSize = version === 0 ? 2 : 4
  const entryCount = readUIntOfSize(payload, 4, countSize)
  if (entryCount === undefined) return undefined

  const keptEntries: Buffer[] = []
  const exifItemIds = new Set<number>()
  let offset = 4 + countSize
  let parsedEntryCount = 0

  while (offset < payload.length) {
    const entry = readBmffBox(payload, offset)
    if (!entry || entry.end > payload.length) return undefined

    parsedEntryCount++
    const entryBuffer = Buffer.from(payload.subarray(entry.start, entry.end))
    const exifItemId = parseInfeExifItemId(entryBuffer)
    if (exifItemId === undefined) {
      keptEntries.push(entryBuffer)
    } else {
      exifItemIds.add(exifItemId)
    }
    offset = entry.end
  }

  if (parsedEntryCount !== entryCount) return undefined

  return {
    version,
    flags: Buffer.from(payload.subarray(0, 4)),
    countSize,
    keptEntries,
    exifItemIds,
  }
}

function buildIinfBox(plan: IinfParseResult): Buffer | undefined {
  const header = Buffer.alloc(4 + plan.countSize)
  plan.flags.copy(header, 0)
  if (!writeUIntOfSize(header, 4, plan.countSize, plan.keptEntries.length)) return undefined
  return buildBmffBox('iinf', Buffer.concat([header, ...plan.keptEntries]))
}

function parseIloc(payload: Buffer): IlocParseResult | undefined {
  if (payload.length < 8) return undefined

  const version = payload[0]
  const offsetSize = payload[4] >> 4
  const lengthSize = payload[4] & 0x0f
  const baseOffsetSize = payload[5] >> 4
  const indexSize = version === 1 || version === 2 ? payload[5] & 0x0f : 0
  const itemIdSize = version < 2 ? 2 : 4
  const itemCountSize = version < 2 ? 2 : 4
  const itemCount = readUIntOfSize(payload, 6, itemCountSize)
  if (itemCount === undefined) return undefined

  const entries: IlocEntry[] = []
  let offset = 6 + itemCountSize

  for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
    const itemId = readUIntOfSize(payload, offset, itemIdSize)
    if (itemId === undefined) return undefined
    offset += itemIdSize

    let constructionMethod = 0
    let constructionMethodField = 0
    if (version === 1 || version === 2) {
      if (offset + 2 > payload.length) return undefined
      constructionMethodField = payload.readUInt16BE(offset)
      constructionMethod = constructionMethodField & 0x0f
      offset += 2
    }

    if (offset + 2 > payload.length) return undefined
    const dataReferenceIndex = payload.readUInt16BE(offset)
    offset += 2

    const baseOffset = readUIntOfSize(payload, offset, baseOffsetSize)
    if (baseOffset === undefined) return undefined
    offset += baseOffsetSize

    if (offset + 2 > payload.length) return undefined
    const extentCount = payload.readUInt16BE(offset)
    offset += 2

    const extents: IlocExtent[] = []
    for (let extentIndex = 0; extentIndex < extentCount; extentIndex++) {
      const index = readUIntOfSize(payload, offset, indexSize)
      if (index === undefined) return undefined
      offset += indexSize

      const extentOffset = readUIntOfSize(payload, offset, offsetSize)
      if (extentOffset === undefined) return undefined
      offset += offsetSize

      const extentLength = readUIntOfSize(payload, offset, lengthSize)
      if (extentLength === undefined) return undefined
      offset += lengthSize

      extents.push({ index, offset: extentOffset, length: extentLength })
    }

    entries.push({
      itemId,
      constructionMethod,
      constructionMethodField,
      dataReferenceIndex,
      baseOffset,
      extents,
    })
  }

  if (offset !== payload.length) return undefined

  return {
    version,
    flags: Buffer.from(payload.subarray(0, 4)),
    offsetSize,
    lengthSize,
    baseOffsetSize,
    indexSize,
    entries,
  }
}

function getIlocExifIntervals(parsed: IlocParseResult, exifItemIds: Set<number>): BmffInterval[] | undefined {
  if (parsed.lengthSize === 0) return undefined

  const intervals: BmffInterval[] = []
  for (const entry of parsed.entries) {
    if (!exifItemIds.has(entry.itemId)) continue
    if (entry.constructionMethod !== 0 || entry.dataReferenceIndex !== 0) return undefined

    for (const extent of entry.extents) {
      const start = entry.baseOffset + extent.offset
      const end = start + extent.length
      if (end <= start) return undefined
      intervals.push({ start, end })
    }
  }

  return intervals
}

function getShiftedIlocEntry(
  parsed: IlocParseResult,
  entry: IlocEntry,
  shiftPosition: (position: number) => number,
): IlocEntry | undefined {
  if (entry.constructionMethod !== 0 || entry.dataReferenceIndex !== 0) return entry

  if (parsed.offsetSize > 0) {
    const extents = entry.extents.map(extent => ({
      ...extent,
      offset: shiftPosition(entry.baseOffset + extent.offset),
    }))
    return {
      ...entry,
      baseOffset: 0,
      extents,
    }
  }

  if (entry.extents.length !== 1) return undefined

  return {
    ...entry,
    baseOffset: shiftPosition(entry.baseOffset),
    extents: [
      {
        ...entry.extents[0],
        offset: 0,
      },
    ],
  }
}

function buildIlocEntry(parsed: IlocParseResult, entry: IlocEntry): Buffer | undefined {
  const itemIdSize = parsed.version < 2 ? 2 : 4
  const constructionMethodSize = parsed.version === 1 || parsed.version === 2 ? 2 : 0
  const extentSize = parsed.indexSize + parsed.offsetSize + parsed.lengthSize
  const entrySize =
    itemIdSize + constructionMethodSize + 2 + parsed.baseOffsetSize + 2 + entry.extents.length * extentSize
  const output = Buffer.alloc(entrySize)
  let offset = 0

  if (!writeUIntOfSize(output, offset, itemIdSize, entry.itemId)) return undefined
  offset += itemIdSize

  if (constructionMethodSize > 0) {
    output.writeUInt16BE(entry.constructionMethodField, offset)
    offset += constructionMethodSize
  }

  output.writeUInt16BE(entry.dataReferenceIndex, offset)
  offset += 2

  if (!writeUIntOfSize(output, offset, parsed.baseOffsetSize, entry.baseOffset)) return undefined
  offset += parsed.baseOffsetSize

  output.writeUInt16BE(entry.extents.length, offset)
  offset += 2

  for (const extent of entry.extents) {
    if (!writeUIntOfSize(output, offset, parsed.indexSize, extent.index)) return undefined
    offset += parsed.indexSize
    if (!writeUIntOfSize(output, offset, parsed.offsetSize, extent.offset)) return undefined
    offset += parsed.offsetSize
    if (!writeUIntOfSize(output, offset, parsed.lengthSize, extent.length)) return undefined
    offset += parsed.lengthSize
  }

  return output
}

function buildIlocBox(
  parsed: IlocParseResult,
  exifItemIds: Set<number>,
  shiftPosition: (position: number) => number,
): Buffer | undefined {
  const itemCountSize = parsed.version < 2 ? 2 : 4
  const keptEntries = parsed.entries.filter(entry => !exifItemIds.has(entry.itemId))
  const header = Buffer.alloc(6 + itemCountSize)
  parsed.flags.copy(header, 0)
  header[4] = (parsed.offsetSize << 4) | parsed.lengthSize
  header[5] = (parsed.baseOffsetSize << 4) | (parsed.version === 1 || parsed.version === 2 ? parsed.indexSize : 0)
  if (!writeUIntOfSize(header, 6, itemCountSize, keptEntries.length)) return undefined

  const entryBuffers: Buffer[] = []
  for (const entry of keptEntries) {
    const shiftedEntry = getShiftedIlocEntry(parsed, entry, shiftPosition)
    if (!shiftedEntry) return undefined

    const entryBuffer = buildIlocEntry(parsed, shiftedEntry)
    if (!entryBuffer) return undefined
    entryBuffers.push(entryBuffer)
  }

  return buildBmffBox('iloc', Buffer.concat([header, ...entryBuffers]))
}

function buildIrefBox(payload: Buffer, exifItemIds: Set<number>): Buffer | null | undefined {
  if (payload.length < 4) return undefined

  const version = payload[0]
  const itemIdSize = version === 0 ? 2 : 4
  const references = parseBmffBoxes(payload, 4, payload.length)
  if (!references) return undefined

  const keptReferences: Buffer[] = []
  for (const reference of references) {
    let offset = reference.dataStart
    const fromItemId = readUIntOfSize(payload, offset, itemIdSize)
    if (fromItemId === undefined) return undefined
    offset += itemIdSize

    if (offset + 2 > reference.end) return undefined
    const referenceCount = payload.readUInt16BE(offset)
    offset += 2

    const keptToItemIds: number[] = []
    for (let index = 0; index < referenceCount; index++) {
      const toItemId = readUIntOfSize(payload, offset, itemIdSize)
      if (toItemId === undefined) return undefined
      offset += itemIdSize
      if (!exifItemIds.has(toItemId)) keptToItemIds.push(toItemId)
    }

    if (offset !== reference.end) return undefined
    if (exifItemIds.has(fromItemId) || keptToItemIds.length === 0) continue

    const referencePayload = Buffer.alloc(itemIdSize + 2 + keptToItemIds.length * itemIdSize)
    let writeOffset = 0
    if (!writeUIntOfSize(referencePayload, writeOffset, itemIdSize, fromItemId)) return undefined
    writeOffset += itemIdSize
    referencePayload.writeUInt16BE(keptToItemIds.length, writeOffset)
    writeOffset += 2

    for (const toItemId of keptToItemIds) {
      if (!writeUIntOfSize(referencePayload, writeOffset, itemIdSize, toItemId)) return undefined
      writeOffset += itemIdSize
    }

    keptReferences.push(buildBmffBox(reference.type, referencePayload))
  }

  if (keptReferences.length === 0) return null

  return buildBmffBox('iref', Buffer.concat([payload.subarray(0, 4), ...keptReferences]))
}

function buildIpmaBox(payload: Buffer, exifItemIds: Set<number>): Buffer | undefined {
  if (payload.length < 8) return undefined

  const version = payload[0]
  const flags = payload.readUIntBE(1, 3)
  const itemIdSize = version < 1 ? 2 : 4
  const associationSize = (flags & 1) === 1 ? 2 : 1
  const entryCount = payload.readUInt32BE(4)
  const keptEntries: Buffer[] = []
  let offset = 8

  for (let index = 0; index < entryCount; index++) {
    const entryStart = offset
    const itemId = readUIntOfSize(payload, offset, itemIdSize)
    if (itemId === undefined) return undefined
    offset += itemIdSize

    if (offset >= payload.length) return undefined
    const associationCount = payload[offset]
    offset++

    const associationsEnd = offset + associationCount * associationSize
    if (associationsEnd > payload.length) return undefined
    offset = associationsEnd

    if (!exifItemIds.has(itemId)) {
      keptEntries.push(Buffer.from(payload.subarray(entryStart, offset)))
    }
  }

  if (offset !== payload.length) return undefined

  const header = Buffer.alloc(8)
  payload.subarray(0, 4).copy(header, 0)
  header.writeUInt32BE(keptEntries.length, 4)
  return buildBmffBox('ipma', Buffer.concat([header, ...keptEntries]))
}

function buildIprpBox(payload: Buffer, exifItemIds: Set<number>): Buffer | undefined {
  const children = parseBmffBoxes(payload, 0, payload.length)
  if (!children) return undefined

  const childBuffers: Buffer[] = []
  for (const child of children) {
    if (child.type === 'ipma') {
      const ipma = buildIpmaBox(payload.subarray(child.dataStart, child.end), exifItemIds)
      if (!ipma) return undefined
      childBuffers.push(ipma)
    } else {
      childBuffers.push(Buffer.from(payload.subarray(child.start, child.end)))
    }
  }

  return buildBmffBox('iprp', Buffer.concat(childBuffers))
}

function createHeifMetaRemovalPlan(img: Buffer, metaBox: BmffBox): HeifMetaRemovalPlan | undefined {
  const metaPayload = img.subarray(metaBox.dataStart, metaBox.end)
  if (metaPayload.length < 4) return undefined

  const children = parseBmffBoxes(metaPayload, 4, metaPayload.length)
  if (!children) return undefined

  let iinfPlan: IinfParseResult | undefined
  let ilocPlan: IlocParseResult | undefined
  for (const child of children) {
    if (child.type === 'iinf') {
      iinfPlan = parseIinfForExifRemoval(metaPayload.subarray(child.dataStart, child.end))
    } else if (child.type === 'iloc') {
      ilocPlan = parseIloc(metaPayload.subarray(child.dataStart, child.end))
    }
  }

  if (!iinfPlan || iinfPlan.exifItemIds.size === 0 || !ilocPlan) return undefined

  const removedIntervals = getIlocExifIntervals(ilocPlan, iinfPlan.exifItemIds)
  if (!removedIntervals || removedIntervals.length === 0) return undefined

  return {
    removedIntervals,
    buildMeta: (shiftPosition: (position: number) => number): Buffer | undefined => {
      const childBuffers: Buffer[] = []
      for (const child of children) {
        if (child.type === 'iinf') {
          const iinf = buildIinfBox(iinfPlan!)
          if (!iinf) return undefined
          childBuffers.push(iinf)
        } else if (child.type === 'iloc') {
          const iloc = buildIlocBox(ilocPlan!, iinfPlan!.exifItemIds, shiftPosition)
          if (!iloc) return undefined
          childBuffers.push(iloc)
        } else if (child.type === 'iref') {
          const iref = buildIrefBox(metaPayload.subarray(child.dataStart, child.end), iinfPlan!.exifItemIds)
          if (iref === undefined) return undefined
          if (iref) childBuffers.push(iref)
        } else if (child.type === 'iprp') {
          const iprp = buildIprpBox(metaPayload.subarray(child.dataStart, child.end), iinfPlan!.exifItemIds)
          if (!iprp) return undefined
          childBuffers.push(iprp)
        } else {
          childBuffers.push(Buffer.from(metaPayload.subarray(child.start, child.end)))
        }
      }

      return buildBmffBox('meta', Buffer.concat([metaPayload.subarray(0, 4), ...childBuffers]))
    },
  }
}

function normalizeIntervals(intervals: BmffInterval[]): BmffInterval[] | undefined {
  const sortedIntervals = [...intervals].sort((a, b) => a.start - b.start)
  let previousEnd = -1

  for (const interval of sortedIntervals) {
    if (interval.end <= interval.start || interval.start < previousEnd) return undefined
    previousEnd = interval.end
  }

  return sortedIntervals
}

function createHeifPositionShift(
  metaBox: BmffBox,
  metaDelta: number,
  removedIntervals: BmffInterval[],
): (position: number) => number {
  return (position: number): number => {
    let delta = metaBox.start < position ? metaDelta : 0
    for (const interval of removedIntervals) {
      if (interval.end <= position) {
        delta -= interval.end - interval.start
      }
    }
    return position + delta
  }
}

function isIntervalInsideMdat(interval: BmffInterval, mdatBoxes: BmffBox[]): boolean {
  return mdatBoxes.some(mdatBox => interval.start >= mdatBox.dataStart && interval.end <= mdatBox.end)
}

function stripIntervalsFromMdat(img: Buffer, mdatBox: BmffBox, intervals: BmffInterval[]): Buffer {
  const mdatIntervals = intervals.filter(interval => interval.start >= mdatBox.dataStart && interval.end <= mdatBox.end)
  if (mdatIntervals.length === 0) return Buffer.from(img.subarray(mdatBox.start, mdatBox.end))

  const payloadChunks: Buffer[] = []
  let offset = mdatBox.dataStart
  for (const interval of mdatIntervals) {
    if (offset < interval.start) payloadChunks.push(img.subarray(offset, interval.start))
    offset = interval.end
  }
  if (offset < mdatBox.end) payloadChunks.push(img.subarray(offset, mdatBox.end))

  return buildBmffBox('mdat', Buffer.concat(payloadChunks))
}

function stripHeifExif(img: Buffer): Buffer {
  const boxes = parseBmffBoxes(img, 0, img.length)
  if (!boxes) return img

  const metaBox = boxes.find(box => box.type === 'meta')
  if (!metaBox) return img

  const removalPlan = createHeifMetaRemovalPlan(img, metaBox)
  if (!removalPlan) return img

  const removedIntervals = normalizeIntervals(removalPlan.removedIntervals)
  const mdatBoxes = boxes.filter(box => box.type === 'mdat')
  if (!removedIntervals || !removedIntervals.every(interval => isIntervalInsideMdat(interval, mdatBoxes))) return img

  const preliminaryMeta = removalPlan.buildMeta(position => position)
  if (!preliminaryMeta) return img

  const metaDelta = preliminaryMeta.length - metaBox.size
  const shiftPosition = createHeifPositionShift(metaBox, metaDelta, removedIntervals)
  const finalMeta = removalPlan.buildMeta(shiftPosition)
  if (!finalMeta || finalMeta.length !== preliminaryMeta.length) return img

  const outputBoxes = boxes.map(box => {
    if (box.start === metaBox.start) return finalMeta
    if (box.type === 'mdat') return stripIntervalsFromMdat(img, box, removedIntervals)
    return Buffer.from(img.subarray(box.start, box.end))
  })

  return Buffer.concat(outputBoxes)
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

  if (fileExt === 'jpg' || fileExt === 'jpeg') return stripJpegExif(img)
  if (fileExt === 'png') return stripPngExif(img)
  if (fileExt === 'webp') return stripWebpExif(img)
  if (fileExt === 'avif' || fileExt === 'heic' || fileExt === 'heif') return stripHeifExif(img)

  return img
}
