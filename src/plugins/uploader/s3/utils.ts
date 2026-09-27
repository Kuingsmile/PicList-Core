import { URL } from 'node:url'

import { fileTypeFromBuffer } from 'file-type'
import { HttpProxyAgent, HttpsProxyAgent, type ProxyAgentRequestOptions } from 'hpagent'
import mime from 'mime'

import { IImgInfo } from '../../../types'

/**
 * Resolves upload bytes and MIME metadata from base64 or buffer input, detecting file type when
 * needed.
 */
export async function extractInfo(info: IImgInfo): Promise<{
  body?: Buffer
  contentType?: string
}> {
  const result: {
    body?: Buffer
    contentType?: string
  } = {}

  if (info.base64Image) {
    const dataUri = /^data:([^;,]*)(?:;[^;,]*)*;base64,/i.exec(info.base64Image)
    const body = dataUri ? info.base64Image.slice(dataUri[0].length) : info.base64Image
    result.contentType = dataUri?.[1] || undefined
    // Base64 is only the input representation; the uploaded bytes have no content encoding.
    result.body = Buffer.from(body, 'base64')
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

/** Parses HTTP(S) proxy URLs, retaining credentials and accepting bare hosts with an HTTP default. */
function normalizeHttpProxyURL(url = ''): URL | undefined {
  url = url.trim()
  if (!url) return undefined

  try {
    const proxyURL = new URL(url.includes('://') ? url : `http://${url}`)
    if (proxyURL.protocol !== 'http:' && proxyURL.protocol !== 'https:') return undefined

    // Match Request's credential validation, but leave decoding for hpagent's CONNECT request.
    decodeURIComponent(proxyURL.username)
    decodeURIComponent(proxyURL.password)
    return proxyURL
  } catch {
    // URL parser errors can contain credentials; never log or propagate them.
    return undefined
  }
}

/**
 * Creates a keep-alive HTTP or HTTPS proxy agent, returning undefined when no usable proxy is
 * configured.
 */
export function getProxyAgent(
  proxy: string | undefined,
  sslEnabled: boolean,
  rejectUnauthorized: boolean,
): HttpProxyAgent | HttpsProxyAgent | undefined {
  const formattedProxy = normalizeHttpProxyURL(proxy)
  if (!formattedProxy) {
    return undefined
  }

  const Agent = sslEnabled ? HttpsProxyAgent : HttpProxyAgent
  // hpagent copies URL.hostname into host, but Node requires unbracketed IPv6 in request options.
  // The hostname option takes precedence over host without changing the original proxy URL.
  const proxyRequestOptions: ProxyAgentRequestOptions & { hostname: string } = {
    hostname: formattedProxy.hostname.replace(/^\[|\]$/g, ''),
  }
  const options = {
    keepAlive: true,
    keepAliveMsecs: 1000,
    scheduling: 'lifo' as 'lifo' | 'fifo' | undefined,
    rejectUnauthorized,
    proxy: formattedProxy,
    proxyRequestOptions,
  }

  return new Agent(options)
}
