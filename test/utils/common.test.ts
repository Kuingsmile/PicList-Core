import path from 'node:path'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  forceNumber,
  getConvertedFormat,
  getImageTypeByMagicNumber,
  getPluginNameType,
  getTreatedCompressOptions,
  getTreatedWaterMarkOptions,
  handleCompletePluginName,
  handleStreamlinePluginName,
  handleUnixStylePath,
  handleUrlEncode,
  imageCompress,
  isConfigKeyInBlackList,
  isInputConfigValid,
  isNeedCompress,
  isUrl,
  isUrlEncode,
  randomStringGenerator,
  removeExif,
  removePluginVersion,
  renameFileNameWithCustomString,
  renameFileNameWithRandomString,
  renameFileNameWithTimestamp,
  safeParse,
} from '../../src/utils/common'

const createJpegApp1Segment = (payload: Buffer): Buffer => {
  const segment = Buffer.alloc(4)
  segment[0] = 0xff
  segment[1] = 0xe1
  segment.writeUInt16BE(payload.length + 2, 2)
  return Buffer.concat([segment, payload])
}

const createPngChunk = (type: string, data: Buffer): Buffer => {
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write(type, 4, 4, 'ascii')
  data.copy(chunk, 8)
  return chunk
}

const createWebpChunk = (type: string, data: Buffer): Buffer => {
  const padding = data.length % 2
  const chunk = Buffer.alloc(8 + data.length + padding)
  chunk.write(type, 0, 4, 'ascii')
  chunk.writeUInt32LE(data.length, 4)
  data.copy(chunk, 8)
  return chunk
}

// --------------- rename helpers ---------------

describe('randomStringGenerator', () => {
  it('should return a string of the requested length', () => {
    expect(randomStringGenerator(10)).toHaveLength(10)
    expect(randomStringGenerator(0)).toHaveLength(0)
    expect(randomStringGenerator(100)).toHaveLength(100)
  })

  it('should only contain alphanumeric characters', () => {
    const result = randomStringGenerator(200)
    expect(result).toMatch(/^[A-Za-z0-9]*$/)
  })

  it('should produce different strings on successive calls', () => {
    const a = randomStringGenerator(20)
    const b = randomStringGenerator(20)
    expect(a).not.toBe(b)
  })
})

describe('renameFileNameWithTimestamp', () => {
  it('should preserve original extension', () => {
    const result = renameFileNameWithTimestamp('photo.png')
    expect(result).toMatch(/\.png$/)
  })

  it('should start with a unix timestamp', () => {
    const before = Math.floor(Date.now() / 1000)
    const result = renameFileNameWithTimestamp('img.jpg')
    const after = Math.floor(Date.now() / 1000)

    // The first 10 digits should be a valid timestamp
    const ts = parseInt(result.slice(0, 10), 10)
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('should have a 5-char random suffix before the extension', () => {
    const result = renameFileNameWithTimestamp('test.webp')
    const withoutExt = result.replace('.webp', '')
    // 10-digit timestamp + 5 random chars = 15 chars
    expect(withoutExt).toHaveLength(15)
  })
})

describe('renameFileNameWithRandomString', () => {
  it('should produce a name of given random length + extension', () => {
    const result = renameFileNameWithRandomString('photo.png', 8)
    expect(result).toMatch(/^[A-Za-z0-9]{8}\.png$/)
  })

  it('should default to length 5', () => {
    const result = renameFileNameWithRandomString('photo.png')
    expect(result).toMatch(/^[A-Za-z0-9]{5}\.png$/)
  })
})

describe('renameFileNameWithCustomString', () => {
  it('should return original name when customFormat is undefined', () => {
    const result = renameFileNameWithCustomString('photo.png', undefined as any)
    expect(result).toBe('photo.png')
  })

  it('should return original name when customFormat contains no known tokens', () => {
    const result = renameFileNameWithCustomString('photo.png', 'static-name')
    expect(result).toBe('photo.png')
  })

  it('should substitute {Y} with 4-digit year', () => {
    const result = renameFileNameWithCustomString('photo.png', '{Y}')
    expect(result).toMatch(/^\d{4}\.png$/)
  })

  it('should substitute {y} with 2-digit year', () => {
    const result = renameFileNameWithCustomString('photo.png', '{y}')
    expect(result).toMatch(/^\d{2}\.png$/)
  })

  it('should substitute {m} with zero-padded month', () => {
    const result = renameFileNameWithCustomString('photo.png', '{m}')
    expect(result).toMatch(/^(0[1-9]|1[0-2])\.png$/)
  })

  it('should substitute {d} with zero-padded day', () => {
    const result = renameFileNameWithCustomString('photo.png', '{d}')
    expect(result).toMatch(/^(0[1-9]|[12]\d|3[01])\.png$/)
  })

  it('should substitute {timestamp} with epoch ms', () => {
    const before = Date.now()
    const result = renameFileNameWithCustomString('photo.png', '{timestamp}')
    const after = Date.now()
    const ts = parseInt(result.replace('.png', ''), 10)
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('should substitute {uuid}', () => {
    const result = renameFileNameWithCustomString('photo.png', '{uuid}')
    // uuid v4 without dashes = 32 hex chars
    expect(result).toMatch(/^[0-9a-f]{32}\.png$/)
  })

  it('should substitute {ulid}', () => {
    const result = renameFileNameWithCustomString('photo.png', '{ulid}')
    // ULID is 26 chars of Crockford's Base32
    expect(result).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}\.png$/)
  })

  it('should substitute {filename} with the base name', () => {
    const result = renameFileNameWithCustomString('my-image.png', '{filename}')
    expect(result).toBe('my-image.png')
  })

  it('should substitute {filename} with affixFileName when provided', () => {
    const result = renameFileNameWithCustomString('my-image.png', '{filename}', 'other-name.jpg')
    expect(result).toBe('other-name.png')
  })

  it('should substitute {md5} from file buffer when provided', () => {
    const buf = Buffer.from('hello world')
    const result = renameFileNameWithCustomString('photo.png', '{md5}', undefined, buf)
    expect(result).toMatch(/^[0-9a-f]{32}\.png$/)
  })

  it('should substitute {str-N} with random string of length N', () => {
    const result = renameFileNameWithCustomString('photo.png', '{str-12}')
    expect(result).toMatch(/^[A-Za-z0-9]{12}\.png$/)
  })

  it('should handle combined tokens', () => {
    const result = renameFileNameWithCustomString('photo.png', '{Y}/{m}/{d}/{filename}')
    const year = new Date().getFullYear().toString()
    expect(result).toContain(year)
    expect(result).toContain('photo')
    expect(result).toMatch(/\.png$/)
  })
})

// --------------- URL helpers ---------------

describe('isUrl', () => {
  it('should return true for http URLs', () => {
    expect(isUrl('http://example.com')).toBe(true)
  })

  it('should return true for https URLs', () => {
    expect(isUrl('https://example.com/path')).toBe(true)
  })

  it('should return false for non-http strings', () => {
    expect(isUrl('ftp://example.com')).toBe(false)
    expect(isUrl('/local/path')).toBe(false)
    expect(isUrl('')).toBe(false)
  })
})

describe('isUrlEncode', () => {
  it('should return true for encoded URLs', () => {
    expect(isUrlEncode('https://example.com/%E4%B8%AD%E6%96%87')).toBe(true)
  })

  it('should return false for non-encoded URLs', () => {
    expect(isUrlEncode('https://example.com/path')).toBe(false)
  })

  it('should return false for empty string', () => {
    expect(isUrlEncode('')).toBe(false)
  })
})

describe('handleUrlEncode', () => {
  it('should encode a non-encoded URL', () => {
    const url = 'https://example.com/中文'
    const result = handleUrlEncode(url)
    expect(result).toContain('%')
    expect(isUrlEncode(result)).toBe(true)
  })

  it('should not double-encode an already encoded URL', () => {
    const url = 'https://example.com/%E4%B8%AD%E6%96%87'
    expect(handleUrlEncode(url)).toBe(url)
  })
})

// --------------- image helpers ---------------

describe('getImageTypeByMagicNumber', () => {
  it('should detect JPEG', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    expect(getImageTypeByMagicNumber(buf)).toBe('.jpg')
  })

  it('should detect PNG', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    expect(getImageTypeByMagicNumber(buf)).toBe('.png')
  })

  it('should detect GIF', () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38])
    expect(getImageTypeByMagicNumber(buf)).toBe('.gif')
  })

  it('should detect BMP', () => {
    const buf = Buffer.from([0x42, 0x4d, 0x00, 0x00])
    expect(getImageTypeByMagicNumber(buf)).toBe('.bmp')
  })

  it('should detect WebP', () => {
    // RIFF....WEBP
    const buf = Buffer.alloc(12)
    buf.write('RIFF', 0)
    buf.write('WEBP', 8)
    expect(getImageTypeByMagicNumber(buf)).toBe('.webp')
  })

  it('should return empty string for unknown type', () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00])
    expect(getImageTypeByMagicNumber(buf)).toBe('')
  })

  it('should return empty string for buffer too small', () => {
    expect(getImageTypeByMagicNumber(Buffer.from([0xff]))).toBe('')
  })

  it('should return empty string for null/undefined input', () => {
    expect(getImageTypeByMagicNumber(null as any)).toBe('')
    expect(getImageTypeByMagicNumber(undefined as any)).toBe('')
  })
})

describe('imageCompress', () => {
  it('should convert images to HEIF with explicit AV1 compression', async () => {
    const input = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer()
    const errors: string[] = []
    const logger = {
      error: (message: string) => errors.push(message),
    } as any

    const output = await imageCompress(input, { isConvert: true, convertFormat: 'heif', quality: 80 }, '.jpg', logger)
    const metadata = await sharp(output).metadata()

    expect(errors).toHaveLength(0)
    expect(metadata.format).toBe('heif')
    expect(output.subarray(4, 12).toString('ascii')).toBe('ftypavif')
  })

  it('should resize by percent and keep the original format when not converting', async () => {
    const input = await sharp({
      create: {
        width: 10,
        height: 8,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .jpeg()
      .toBuffer()
    const logger = {
      error: () => undefined,
    } as any

    const output = await imageCompress(input, { isReSizeByPercent: true, reSizePercent: 50 }, '.jpg', logger)
    const metadata = await sharp(output).metadata()

    expect(metadata.format).toBe('jpeg')
    expect(metadata.width).toBe(5)
    expect(metadata.height).toBe(4)
  })

  it('should fall back to jpeg output for processable but unsupported output formats', async () => {
    const input = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .png()
      .toBuffer()
    const logger = {
      error: () => undefined,
    } as any

    const output = await imageCompress(input, { quality: 80 }, '.ico', logger)
    const metadata = await sharp(output).metadata()

    expect(metadata.format).toBe('jpeg')
  })
})

describe('removeExif', () => {
  it('should remove JPEG Exif APP1 data without re-encoding image data', async () => {
    const input = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: 255, g: 128, b: 0 },
      },
    })
      .jpeg()
      .toBuffer()
    const exifSegment = createJpegApp1Segment(Buffer.concat([Buffer.from('Exif\0\0', 'binary'), Buffer.from('test')]))
    const inputWithExif = Buffer.concat([input.subarray(0, 2), exifSegment, input.subarray(2)])

    const output = await removeExif(inputWithExif, '.jpg')

    expect(output.equals(input)).toBe(true)
  })

  it('should keep non-Exif JPEG APP1 data unchanged', async () => {
    const input = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 0, g: 128, b: 255 },
      },
    })
      .jpeg()
      .toBuffer()
    const xmpSegment = createJpegApp1Segment(Buffer.from('http://ns.adobe.com/xap/1.0/\0test', 'binary'))
    const inputWithXmp = Buffer.concat([input.subarray(0, 2), xmpSegment, input.subarray(2)])

    const output = await removeExif(inputWithXmp, '.jpg')

    expect(output.equals(inputWithXmp)).toBe(true)
  })

  it('should allow large JPEG Exif removal to reduce size without recompressing scan data', async () => {
    const input = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 95, g: 150, b: 220 },
      },
    })
      .jpeg({ progressive: true })
      .toBuffer()
    const largeExifPayload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), Buffer.alloc(35_000, 0x20)])
    const exifSegment = createJpegApp1Segment(largeExifPayload)
    const xmpSegment = createJpegApp1Segment(Buffer.from('http://ns.adobe.com/xap/1.0/\0test', 'binary'))
    const inputWithMetadata = Buffer.concat([input.subarray(0, 2), exifSegment, xmpSegment, input.subarray(2)])
    const expectedOutput = Buffer.concat([input.subarray(0, 2), xmpSegment, input.subarray(2)])

    const output = await removeExif(inputWithMetadata, '.jpg')

    expect(output.equals(expectedOutput)).toBe(true)
    expect(inputWithMetadata.length - output.length).toBe(exifSegment.length)
  })

  it('should remove PNG eXIf chunks without recompressing the image', async () => {
    const input = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: 20, g: 180, b: 40 },
      },
    })
      .png()
      .toBuffer()
    const ihdrEnd = 8 + 8 + input.readUInt32BE(8) + 4
    const exifChunk = createPngChunk('eXIf', Buffer.from('test'))
    const inputWithExif = Buffer.concat([input.subarray(0, ihdrEnd), exifChunk, input.subarray(ihdrEnd)])

    const output = await removeExif(inputWithExif, '.png')

    expect(output.equals(input)).toBe(true)
  })

  it('should remove WebP EXIF chunks and update RIFF size without recompressing the image', async () => {
    const input = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: 60, g: 70, b: 220 },
      },
    })
      .webp()
      .toBuffer()
    const exifChunk = createWebpChunk('EXIF', Buffer.from('test'))
    const inputWithExif = Buffer.concat([Buffer.from(input.subarray(0, 12)), exifChunk, input.subarray(12)])
    inputWithExif.writeUInt32LE(inputWithExif.length - 8, 4)

    const output = await removeExif(inputWithExif, '.webp')

    expect(output.equals(input)).toBe(true)
  })

  it('should remove AVIF Exif items without recompressing the image', async () => {
    const input = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: 90, g: 70, b: 220 },
      },
    })
      .withExif({ IFD0: { Artist: 'codex' } })
      .avif()
      .toBuffer()

    expect((await sharp(input).metadata()).exif).toBeDefined()

    const output = await removeExif(input, '.avif')
    const metadata = await sharp(output).metadata()

    expect(metadata.exif).toBeUndefined()
    expect(metadata.width).toBe(3)
    expect(metadata.height).toBe(2)
    expect(output.length).toBeLessThan(input.length)
    expect(output.includes(Buffer.from('Exif'))).toBe(false)
  })

  it('should remove HEIF and HEIC Exif items through the same container path', async () => {
    const input = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: 30, g: 120, b: 190 },
      },
    })
      .withExif({ IFD0: { Artist: 'codex' } })
      .heif({ compression: 'av1' })
      .toBuffer()

    const heifOutput = await removeExif(input, '.heif')
    const heicOutput = await removeExif(input, '.heic')

    expect((await sharp(heifOutput).metadata()).exif).toBeUndefined()
    expect((await sharp(heicOutput).metadata()).exif).toBeUndefined()
  })

  it('should keep TIFF unchanged instead of recompressing through sharp', async () => {
    const input = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: 10, g: 120, b: 90 },
      },
    })
      .tiff()
      .toBuffer()

    const output = await removeExif(input, '.tiff')

    expect(output.equals(input)).toBe(true)
  })
})

describe('getTreatedWaterMarkOptions', () => {
  it('should prefer id-specific values, then scoped values, then global values', () => {
    const options = getTreatedWaterMarkOptions(
      {
        isAddWatermark: true,
        isAddWatermarkMap: { qiniu: true },
        watermarkType: 'text',
        watermarkTypeMap: { qiniu: 'image' },
        watermarkDegree: 10,
        watermarkDegreeMap: { qiniu: 20 },
        watermarkText: 'global',
        watermarkTextMap: { qiniu: 'scoped' },
      },
      {
        isAddWatermark: false,
        watermarkText: 'specific',
      },
      'qiniu',
      'config-id',
    )

    expect(options.isAddWatermark).toBe(false)
    expect(options.watermarkType).toBe('image')
    expect(options.watermarkDegree).toBe(20)
    expect(options.watermarkText).toBe('specific')
    expect(options.picBed).toBe('qiniu')
    expect(options.id).toBe('config-id')
  })
})

describe('getTreatedCompressOptions', () => {
  it('should preserve id-specific false values over scoped true values', () => {
    const options = getTreatedCompressOptions(
      {
        quality: 60,
        qualityMap: { qiniu: 70 },
        isConvert: true,
        isConvertMap: { qiniu: true },
        convertFormat: 'jpg',
        convertFormatMap: { qiniu: 'webp' },
        reSizeWidth: 800,
        reSizeWidthMap: { qiniu: 1024 },
      },
      {
        quality: 80,
        isConvert: false,
      },
      'qiniu',
      'config-id',
    )

    expect(options.quality).toBe(80)
    expect(options.isConvert).toBe(false)
    expect(options.convertFormat).toBe('webp')
    expect(options.reSizeWidth).toBe(1024)
    expect(options.picBed).toBe('qiniu')
    expect(options.id).toBe('config-id')
  })
})

describe('getConvertedFormat', () => {
  it('should keep gifs unchanged', () => {
    expect(getConvertedFormat({ isConvert: true, convertFormat: 'webp' }, '.gif')).toBe('gif')
  })

  it('should apply format map overrides and fallback invalid mapped formats to jpg', () => {
    expect(getConvertedFormat({ formatConvertObj: { png: 'avif' } }, '.png')).toBe('avif')
    expect(getConvertedFormat({ convertFormat: 'webp', formatConvertObj: { png: 'invalid' } }, '.png')).toBe('jpg')
  })

  it('should prevent imgur webp conversion', () => {
    expect(getConvertedFormat({ picBed: 'imgur', convertFormat: 'webp' }, '.png')).toBe('jpg')
  })
})

describe('isNeedCompress', () => {
  it('should detect only active compression operations', () => {
    expect(isNeedCompress(undefined, '.jpg')).toBe(false)
    expect(isNeedCompress({ quality: 100 }, '.jpg')).toBe(false)
    expect(isNeedCompress({ quality: 80 }, '.jpg')).toBe(true)
    expect(isNeedCompress({ isConvert: true, convertFormat: 'jpg' }, '.jpg')).toBe(false)
    expect(isNeedCompress({ isConvert: true, convertFormat: 'webp' }, '.jpg')).toBe(true)
    expect(isNeedCompress({ isReSize: true, reSizeWidth: 0, reSizeHeight: 0 }, '.jpg')).toBe(false)
    expect(isNeedCompress({ quality: 80 }, '.zip')).toBe(false)
  })
})

// --------------- plugin name helpers ---------------

describe('getPluginNameType', () => {
  it('should identify scoped plugin names', () => {
    expect(getPluginNameType('@scope/picgo-plugin-test')).toBe('scope')
  })

  it('should identify normal plugin names', () => {
    expect(getPluginNameType('picgo-plugin-test')).toBe('normal')
  })

  it('should identify simple names', () => {
    expect(getPluginNameType('my-plugin')).toBe('simple')
  })
})

describe('handleStreamlinePluginName', () => {
  it('should strip scope and prefix', () => {
    expect(handleStreamlinePluginName('@scope/picgo-plugin-test')).toBe('test')
  })

  it('should strip prefix', () => {
    expect(handleStreamlinePluginName('picgo-plugin-test')).toBe('test')
  })
})

describe('handleCompletePluginName', () => {
  it('should add picgo-plugin- prefix', () => {
    expect(handleCompletePluginName('test')).toBe('picgo-plugin-test')
  })

  it('should add scope when provided', () => {
    expect(handleCompletePluginName('test', 'myorg')).toBe('@myorg/picgo-plugin-test')
  })
})

describe('removePluginVersion', () => {
  it('should return name as-is when no @ version', () => {
    expect(removePluginVersion('picgo-plugin-test')).toBe('picgo-plugin-test')
  })

  it('should strip version from normal plugin', () => {
    expect(removePluginVersion('picgo-plugin-test@1.0.0')).toBe('picgo-plugin-test')
  })
})

describe('handleUnixStylePath', () => {
  it('should convert backslashes to forward slashes', () => {
    // Node path.sep is '\\' on Windows, '/' on POSIX
    if (path.sep === '\\') {
      expect(handleUnixStylePath('C:\\Users\\test\\file.txt')).toBe('C:/Users/test/file.txt')
    } else {
      expect(handleUnixStylePath('/home/user/file.txt')).toBe('/home/user/file.txt')
    }
  })
})

// --------------- config validation ---------------

describe('isConfigKeyInBlackList', () => {
  it('should return false since blacklist is empty', () => {
    expect(isConfigKeyInBlackList('picBed.uploader')).toBe(false)
    expect(isConfigKeyInBlackList('anything')).toBe(false)
  })
})

describe('isInputConfigValid', () => {
  it('should return true for non-empty objects', () => {
    expect(isInputConfigValid({ key: 'value' })).toBe(true)
  })

  it('should return false for empty objects', () => {
    expect(isInputConfigValid({})).toBe(false)
  })

  it('should return false for arrays', () => {
    expect(isInputConfigValid([1, 2, 3])).toBe(false)
  })

  it('should return false for primitives', () => {
    expect(isInputConfigValid('string')).toBe(false)
    expect(isInputConfigValid(42)).toBe(false)
  })

  it('should throw for null/undefined (known behavior)', () => {
    // null: typeof null === 'object', so Object.keys(null) throws
    expect(() => isInputConfigValid(null)).toThrow()
    expect(() => isInputConfigValid(undefined)).not.toThrow()
    expect(isInputConfigValid(undefined)).toBe(false)
  })
})

// --------------- utility functions ---------------

describe('safeParse', () => {
  it('should parse valid JSON', () => {
    expect(safeParse('{"key":"value"}')).toEqual({ key: 'value' })
  })

  it('should return empty object for invalid JSON', () => {
    expect(safeParse('not json')).toEqual({})
  })

  it('should parse arrays', () => {
    expect(safeParse('[1,2,3]')).toEqual([1, 2, 3])
  })
})

describe('forceNumber', () => {
  it('should return the number for valid numeric strings', () => {
    expect(forceNumber('42')).toBe(42)
    expect(forceNumber('3.14')).toBe(3.14)
  })

  it('should return 0 for NaN values', () => {
    expect(forceNumber('abc')).toBe(0)
    expect(forceNumber(NaN)).toBe(0)
  })

  it('should return 0 for undefined', () => {
    expect(forceNumber()).toBe(0)
    expect(forceNumber(undefined)).toBe(0)
  })

  it('should pass through numbers', () => {
    expect(forceNumber(42)).toBe(42)
    expect(forceNumber(0)).toBe(0)
    expect(forceNumber(-1)).toBe(-1)
  })
})
