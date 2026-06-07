import path from 'node:path'
import { URL } from 'node:url'

import fs from 'fs-extra'
import { imageSize } from 'image-size'
import mime from 'mime'

import type { IImgSize, IPathTransformedImgInfo, IPicGo } from '../../types'
import { handleUrlEncode } from './url'

export const getImageSize = (file: Buffer): IImgSize => {
  try {
    const { width = 0, height = 0, type } = imageSize(file)
    const extname = type ? `.${type}` : '.png'
    return {
      real: true,
      width,
      height,
      extname,
    }
  } catch (_e) {
    return {
      real: false,
      width: 200,
      height: 200,
      extname: '.png',
    }
  }
}

export const getFSFile = async (filePath: string): Promise<IPathTransformedImgInfo> => {
  try {
    return {
      extname: path.extname(filePath),
      fileName: path.basename(filePath),
      filePath,
      buffer: await fs.readFile(filePath),
      success: true,
    }
  } catch {
    return {
      reason: `read file ${filePath} error`,
      success: false,
    }
  }
}

function getImageExtensionFromMime(contentType: string): string {
  if (!contentType) return ''
  const pureMime = contentType.toLocaleLowerCase().split(';')[0].trim()
  if (!pureMime.startsWith('image/')) return ''
  const ext = mime.getExtension(pureMime)
  return ext ? `.${ext}` : ''
}

export function getImageTypeByMagicNumber(buffer: Buffer | Uint8Array): string {
  if (!buffer || buffer.length < 4) return ''

  const getHex = (start: number, end: number) =>
    Array.from(buffer.subarray(start, end))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()

  const hex4 = getHex(0, 4)
  const hex3 = getHex(0, 3)
  const hex2 = getHex(0, 2)

  if (hex3 === 'FFD8FF') return '.jpg'
  if (hex4 === '89504E47') return '.png'
  if (hex4 === '47494638') return '.gif'
  if (hex2 === '424D') return '.bmp'

  if (hex4 === '52494646') {
    const webpHeader = getHex(8, 12)
    if (webpHeader === '57454250') {
      return '.webp'
    }
  }
  return ''
}

export const getURLFile = async (url: string, ctx: IPicGo): Promise<IPathTransformedImgInfo> => {
  url = handleUrlEncode(url)
  let timeoutId: NodeJS.Timeout
  const requestFn = new Promise<IPathTransformedImgInfo>((resolve, reject) => {
    ;(async () => {
      try {
        const { res, headers } = await ctx
          .request({
            method: 'get',
            url,
            resolveWithFullResponse: true,
            responseType: 'arraybuffer',
          })
          .then(resp => {
            return { res: resp.data as Buffer, headers: resp.headers }
          })
        clearTimeout(timeoutId)
        const urlPath = new URL(url).pathname
        let extname = ''
        try {
          const urlParams = new URL(url).searchParams
          extname = urlParams.get('wx_fmt') || path.extname(urlPath) || ''
        } catch (_e) {
          extname = path.extname(urlPath) || ''
        }
        const contentType = headers['content-type'] || headers['Content-Type'] || ''
        if (!extname && contentType) {
          extname = getImageExtensionFromMime(String(contentType))
        }
        if (!extname) {
          extname = getImageTypeByMagicNumber(res)
        }
        if (!extname.startsWith('.') && extname) {
          extname = `.${extname}`
        }
        resolve({
          buffer: res,
          fileName: path.basename(urlPath),
          extname,
          success: true,
        })
      } catch (error: any) {
        clearTimeout(timeoutId)
        resolve({
          success: false,
          reason: `request ${url} error, ${error?.message ?? ''}`,
        })
      }
    })().catch(reject)
  })
  const timeoutPromise = new Promise<IPathTransformedImgInfo>((resolve): void => {
    timeoutId = setTimeout(() => {
      resolve({
        success: false,
        reason: `request ${url} timeout`,
      })
    }, 30000)
  })
  return Promise.race([requestFn, timeoutPromise])
}
