import { URL } from 'node:url'

import { fileTypeFromBuffer } from 'file-type'
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent'
import mime from 'mime'

import { IImgInfo } from '../../../types'

export async function extractInfo(info: IImgInfo): Promise<{
  body?: Buffer
  contentType?: string
  contentEncoding?: string
}> {
  const result: {
    body?: Buffer
    contentType?: string
    contentEncoding?: string
  } = {}

  if (info.base64Image) {
    const body = info.base64Image.replace(/^data:[/\w]+;base64,/, '')
    result.contentType = info.base64Image.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)?.[0]
    result.body = Buffer.from(body, 'base64')
    result.contentEncoding = 'base64'
  } else {
    if (info.extname) {
      result.contentType = mime.getType(info.extname) || undefined
    }
    result.body = info.buffer
  }

  // fallback to detect from buffer
  if (!result.contentType) {
    const fileType = await fileTypeFromBuffer(result.body!)
    result.contentType = fileType?.mime
  }

  return result
}

function formatHttpProxyURL(url = ''): string {
  if (!url) return ''

  if (!/^https?:\/\//.test(url)) {
    const [host, port] = url.split(':')
    return `http://${host.replace('127.0.0.1', 'localhost')}:${port}`
  }

  try {
    const { protocol, hostname, port } = new URL(url)
    return `${protocol}//${hostname.replace('127.0.0.1', 'localhost')}:${port}`
  } catch (_e) {
    return ''
  }
}

export function getProxyAgent(
  proxy: string | undefined,
  sslEnabled: boolean,
  rejectUnauthorized: boolean,
): HttpProxyAgent | HttpsProxyAgent | undefined {
  const formatedProxy = formatHttpProxyURL(proxy)
  if (!formatedProxy) {
    return undefined
  }

  const Agent = sslEnabled ? HttpsProxyAgent : HttpProxyAgent
  const options = {
    keepAlive: true,
    keepAliveMsecs: 1000,
    scheduling: 'lifo' as 'lifo' | 'fifo' | undefined,
    rejectUnauthorized,
    proxy: formatedProxy,
  }

  return new Agent(options)
}
