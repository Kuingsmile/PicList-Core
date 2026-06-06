import path from 'node:path'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  forceNumber,
  getImageTypeByMagicNumber,
  getPluginNameType,
  handleCompletePluginName,
  handleStreamlinePluginName,
  handleUnixStylePath,
  handleUrlEncode,
  imageCompress,
  isConfigKeyInBlackList,
  isInputConfigValid,
  isUrl,
  isUrlEncode,
  randomStringGenerator,
  removePluginVersion,
  renameFileNameWithCustomString,
  renameFileNameWithRandomString,
  renameFileNameWithTimestamp,
  safeParse,
} from '../../src/utils/common'

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
