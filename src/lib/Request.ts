import https from 'node:https'
import { URL } from 'node:url'

import type { AxiosProxyConfig, AxiosRequestConfig, AxiosResponse } from 'axios'
import axios from 'axios'
import FormData from 'form-data'
import { httpsOverHttp, httpsOverHttps } from 'tunnel'

import type { IFullResponse, IOldReqOptions, IPicGo, IRequest, IRequestConfig, IResponse, Undefinable } from '../types'

/** Default compatibility agent restricted to TLS 1.2 with certificate verification disabled. */
const httpsAgent = new https.Agent({
  maxVersion: 'TLSv1.2',
  minVersion: 'TLSv1.2',
  rejectUnauthorized: false,
})

/** Converts proxy URLs to Axios options without reinterpreting existing Axios proxy objects. */
function normalizeProxy(proxy: string | URL | AxiosProxyConfig | false | undefined): AxiosProxyConfig | false {
  if (!proxy) return false
  if (typeof proxy !== 'string' && !(proxy instanceof URL)) return proxy

  try {
    const proxyUrl = typeof proxy === 'string' ? new URL(proxy) : proxy
    const result: AxiosProxyConfig = {
      host: proxyUrl.hostname.replace(/^\[|\]$/g, ''),
      port: Number(proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80)),
      protocol: proxyUrl.protocol,
    }
    if (proxyUrl.username || proxyUrl.password) {
      result.auth = {
        username: decodeURIComponent(proxyUrl.username),
        password: decodeURIComponent(proxyUrl.password),
      }
    }
    return result
  } catch {
    return false
  }
}

// thanks for https://github.dev/request/request/blob/master/index.js
/** Appends a multipart value, unpacking legacy value/options descriptors when supplied. */
function appendFormData(form: FormData, key: string, data: any): void {
  if (typeof data === 'object' && 'value' in data && 'options' in data) {
    form.append(key, data.value, data.options)
  } else {
    form.append(key, data)
  }
}

/**
 * Converts legacy proxy, multipart, body, and query options into Axios options and marks legacy
 * requests.
 */
function requestInterceptor(
  options: IOldReqOptions | AxiosRequestConfig,
  defaultProxy: AxiosRequestConfig['proxy'],
): AxiosRequestConfig & {
  __isOldOptions?: boolean
} {
  let __isOldOptions = typeof options.proxy === 'string'
  const proxy = normalizeProxy(options.proxy === undefined ? defaultProxy : options.proxy)
  const opt: AxiosRequestConfig<any> & {
    __isOldOptions?: boolean
  } = {
    ...options,
    proxy,
    url: (options.url as string) || '',
    headers: options.headers || {},
  }
  if (proxy && options.url?.startsWith('https://')) {
    const createTunnel = proxy.protocol === 'https' || proxy.protocol === 'https:' ? httpsOverHttps : httpsOverHttp
    opt.proxy = false
    opt.httpsAgent = createTunnel({
      proxy: {
        host: proxy.host,
        port: proxy.port,
        ...(proxy.auth ? { proxyAuth: `${proxy.auth.username}:${proxy.auth.password}` } : {}),
      },
    })
  }
  if ('formData' in options) {
    const form = new FormData()
    for (const key in options.formData) {
      const data = options.formData[key]
      appendFormData(form, key, data)
    }
    opt.data = form
    opt.headers = Object.assign(opt.headers || {}, form.getHeaders())
    __isOldOptions = true
    // @ts-expect-error this is old option
    delete opt.formData
  }
  if ('body' in options) {
    opt.data = options.body
    __isOldOptions = true
    // @ts-expect-error this is old options
    delete opt.body
  }
  if ('qs' in options) {
    opt.params = options.qs
    __isOldOptions = true
  }
  opt.__isOldOptions = __isOldOptions
  return opt
}

/** Adds request-compatible statusCode and body aliases to an Axios response. */
function responseInterceptor(response: AxiosResponse): IFullResponse {
  return {
    ...response,
    statusCode: response.status,
    body: response.data,
  }
}

/** Rejects with normalized request metadata and a legacy-compatible response body. */
function responseErrorHandler(error: any) {
  const errorObj = {
    method: error?.config?.method?.toUpperCase() || '',
    url: error?.config?.url || '',
    statusCode: error?.response?.status || 0,
    message: error?.message || '',
    stack: error?.stack || {},
    response: {
      status: error?.response?.status || 0,
      statusCode: error?.response?.status || 0,
      body: error?.response?.data || '',
    },
  }
  return Promise.reject(errorObj)
}

/** HTTP adapter that preserves legacy request options while using Axios and live proxy settings. */
export class Request implements IRequest {
  private readonly ctx: IPicGo
  /** Mutable Axios defaults applied to each request before call-specific options are merged. */
  options: AxiosRequestConfig<any> = {}
  /** Retains the client so requests can resolve its active configuration snapshot. */
  constructor(ctx: IPicGo) {
    this.ctx = ctx
  }

  /**
   * Resolves the proxy from the active upload snapshot or client defaults for each request, disabling
   * proxying for an absent or invalid URL.
   */
  private handleProxy(): AxiosRequestConfig['proxy'] | false {
    return normalizeProxy(this.ctx.getConfig<Undefinable<string>>('picBed.proxy'))
  }

  // #64 dynamic get proxy value
  /**
   * Executes a request using current proxy settings and legacy-option compatibility.
   *
   * @param options - Axios or legacy request options; resolveWithFullResponse selects response
   * metadata.
   * @returns The response body or full response according to the supplied options.
   * @remarks
   * Legacy requests return text unless json is true, stringifying non-string response bodies. Failures
   * reject with normalized request metadata rather than the original Axios error.
   */
  request<
    T,
    U extends (IRequestConfig<U> extends IOldReqOptions
      ? IOldReqOptions
      : IRequestConfig<U> extends AxiosRequestConfig
        ? AxiosRequestConfig
        : never),
  >(options: U): Promise<IResponse<T, U>> {
    const opt = requestInterceptor(options, this.handleProxy())
    // Resolve proxy overrides before Axios can merge credentials from different proxy servers.
    this.options.proxy = opt.proxy
    this.options.headers = options.headers || {}
    this.options.maxBodyLength = Infinity
    this.options.maxContentLength = Infinity
    this.options.httpsAgent = httpsAgent
    // !NOTICE this.options !== options
    // this.options is the default options
    const instance = axios.create(this.options)
    instance.interceptors.response.use(responseInterceptor, responseErrorHandler)

    instance.interceptors.request.use(function (obj) {
      // handle Content-Type
      let contentType = ''
      if (obj?.headers?.contentType) {
        contentType = obj.headers.contentType as string
        delete obj.headers.contentType
      } else if (obj?.headers?.ContentType) {
        contentType = obj.headers.ContentType as string
        delete obj.headers.ContentType
      } else if (obj?.headers?.['content-type']) {
        contentType = obj.headers['content-type'] as string
        delete obj.headers['content-type']
      }
      if (contentType !== '' && obj.headers) {
        obj.headers['Content-Type'] = contentType
      }
      return obj
    })
    if ('resolveWithFullResponse' in options && options.resolveWithFullResponse) {
      return instance.request<T, IFullResponse<T, U>>(opt) as Promise<IResponse<T, U>>
    } else {
      return instance.request(opt).then(res => {
        // use old request option format
        if (opt.__isOldOptions && (!('json' in options) || options.json !== true)) {
          return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        }
        return res.data
      }) as Promise<IResponse<T, U>>
    }
  }
}

export default Request
