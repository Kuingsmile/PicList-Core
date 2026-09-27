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
