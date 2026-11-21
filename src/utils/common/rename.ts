import path from 'node:path'

import { ulid } from 'ulid'
import { v4 as uuidv4 } from 'uuid'

import { getMd5, getSha1, getSha256 } from './hash'

/** Six-bit mask used to draw candidate indexes into the alphanumeric alphabet. */
const mask = 0b111111
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Generates an alphanumeric filename fragment with Math.random, rejecting unused six-bit values.
 *
 * @remarks
 * Intended for filenames, not cryptographic tokens.
 */
export function randomStringGenerator(length: number): string {
  const out = new Array(length)
  let i = 0
  /** Buffered random bits consumed six at a time to choose candidate characters. */
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

/** Builds a seconds-based timestamp plus random suffix while preserving the original extension. */
export function renameFileNameWithTimestamp(oldName: string): string {
  return `${Math.floor(Date.now() / 1000)}${randomStringGenerator(5)}${path.extname(oldName)}`
}

/** Replaces the basename with an alphanumeric fragment and preserves the original extension. */
export function renameFileNameWithRandomString(oldName: string, length: number = 5): string {
  return `${randomStringGenerator(length)}${path.extname(oldName)}`
}

function formatHelper(num: number): string {
  return num.toString().length === 1 ? `0${num}` : num.toString()
}

/**
 * Expands filename, date, hash, identifier, random-string, and parent-folder placeholders.
 *
 * @param oldName - Source path supplying the original basename, extension, and parent folders.
 * @param customFormat - Placeholder template. Unrecognized templates use the original basename.
 * @param affixFileName - Optional alternate source for the filename placeholder.
 * @param fileBuffer - Content to hash; omitted to hash the original basename.
 * @returns The expanded name with the source extension appended.
 */
export function renameFileNameWithCustomString(
  oldName: string,
  customFormat: string,
  affixFileName?: string,
  fileBuffer?: Parameters<typeof getMd5>[0],
): string {
  const now = new Date()
  const year = now.getFullYear().toString()
  const { base, name: filebasename, ext } = path.parse(oldName)
  /** Lazy replacements for fixed tokens, evaluated once per token before global substitution. */
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
    '{ulid}': () => ulid(),
    '{timestampS}': () => Math.floor(now.getTime() / 1000).toString(),
    '{timestamp}': () => now.getTime().toString(),
  }
  const strRegex = /{str-(\d+)}/gi
  const sha256Regex = /{sha256-(\d+)}/gi
  const sha1Regex = /{sha1-(\d+)}/gi
  const localFolderRegex = /{localFolder:?(\d+)?}/gi
  const fixedTokens = Object.keys(conversionMap)
  if (
    !customFormat ||
    (!fixedTokens.some(token => customFormat.includes(token)) &&
      ![strRegex, sha256Regex, sha1Regex, localFolderRegex].some(pattern => customFormat.search(pattern) !== -1))
  ) {
    return base
  }
  let newName = customFormat
  for (const token of fixedTokens) {
    if (newName.includes(token)) {
      const replacement = conversionMap[token]()
      newName = newName.replaceAll(token, () => replacement)
    }
  }
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
  newName = newName.replace(localFolderRegex, (_, count) => {
    const { dir, root } = path.parse(path.normalize(oldName))
    const folders = dir
      .slice(root.length)
      .split(path.sep)
      .filter(folder => folder && folder !== '..')
    const depth = Math.max(1, Number(count) || 1)
    return folders.slice(-depth).join('/').replace(/:/g, '') || '.'
  })
  return newName === '.' ? base : newName + ext
}
