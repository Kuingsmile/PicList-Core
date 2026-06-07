import type { BinaryLike } from 'node:crypto'
import path from 'node:path'

import { ulid } from 'ulid'
import { v4 as uuidv4 } from 'uuid'

import { getMd5, getSha1, getSha256 } from './hash'

const mask = 0b111111
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

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

export function renameFileNameWithCustomString(
  oldName: string,
  customFormat: string,
  affixFileName?: string,
  fileBuffer?: BinaryLike,
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
    '{ulid}': () => ulid(),
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
