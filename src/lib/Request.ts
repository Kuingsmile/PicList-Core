import https from 'node:https'
import { URL } from 'node:url'

import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import axios from 'axios'
import FormData from 'form-data'
import { httpsOverHttp } from 'tunnel'

import type {
  IConfig,
  IConfigChangePayload,
  IFullResponse,
  IOldReqOptions,
  IPicGo,
  IRequest,
  IRequestConfig,
  IResponse,
  Undefinable,
} from '../types'
import { IBusEvent } from '../utils/enum'
import { eventBus } from '../utils/eventBus'

/** Default compatibility agent restricted to TLS 1.2 with certificate verification disabled. */
const httpsAgent = new https.Agent({
  maxVersion: 'TLSv1.2',
  minVersion: 'TLSv1.2',
  rejectUnauthorized: false,
})

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
function requestInterceptor(options: IOldReqOptions | AxiosRequestConfig): AxiosRequestConfig & {
  __isOldOptions?: boolean
} {
  let __isOldOptions = false
  const opt: AxiosRequestConfig<any> & {
    __isOldOptions?: boolean
  } = {
    ...options,
    url: (options.url as string) || '',
    headers: options.headers || {},
  }
  // user request config proxy
  if (options.proxy) {
    let proxyOptions = options.proxy
    if (typeof proxyOptions === 'string') {
      try {
        proxyOptions = new URL(options.proxy)
      } catch (e) {
        proxyOptions = false
        opt.proxy = false
        console.error(e)
      }
      __isOldOptions = true
    }
    if (proxyOptions) {
      if (options.url?.startsWith('https://')) {
        opt.proxy = false
        opt.httpsAgent = httpsOverHttp({
          proxy: {
            host: proxyOptions?.hostname,
            port: parseInt(proxyOptions?.port, 10),
          },
        })
      } else {
        opt.proxy = {
          host: proxyOptions.hostname,
          port: parseInt(proxyOptions.port, 10),
          protocol: 'http',
        }
      }
    }
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
  /** Cached proxy setting updated by configuration-change events. */
  private proxy: Undefinable<string> = ''
  /** Mutable Axios defaults applied to each request before call-specific options are merged. */
  options: AxiosRequestConfig<any> = {}
  /** Loads proxy settings and subscribes to later configuration changes. */
  constructor(ctx: IPicGo) {
    this.ctx = ctx
    this.init()
    eventBus.on(IBusEvent.CONFIG_CHANGE, (data: IConfigChangePayload<string | IConfig['picBed']>) => {
      switch (data.configName) {
        case 'picBed':
          if ((data.value as IConfig['picBed'])?.proxy) {
            this.proxy = (data.value as IConfig['picBed']).proxy
          }
          break
        case 'picBed.proxy':
          this.proxy = data.value as string
          break
      }
    })
  }

  /** Seeds the cached proxy from the client configuration. */
  private init(): void {
    const proxy = this.ctx.getConfig<Undefinable<string>>('picBed.proxy')
    if (proxy) {
      this.proxy = proxy
    }
  }

  /**
   * Converts the configured proxy URL to Axios options, or disables proxying for an absent or invalid
   * URL.
   */
  private handleProxy(): AxiosRequestConfig['proxy'] | false {
    if (this.proxy) {
      try {
        const proxyOptions = new URL(this.proxy)
        return {
          host: proxyOptions.hostname,
          port: parseInt(proxyOptions.port || '0', 10),
          protocol: proxyOptions.protocol,
        }
      } catch (_e) {
        /* empty */
      }
    }
    return false
  }

  // #64 dynamic get proxy value
  /**
   * Executes a request using current proxy settings and legacy-option compatibility.
   *
   * @param options - Axios or legacy request options; resolveWithFullResponse selects response
   * metadata.
   * @returns The response body or full response according to the supplied options.
   * @remarks
   * Legacy requests without a json option stringify the response body. Failures reject with normalized
   * request metadata rather than the original Axios error.
   */
  request<
    T,
    U extends (IRequestConfig<U> extends IOldReqOptions
      ? IOldReqOptions
      : IRequestConfig<U> extends AxiosRequestConfig
        ? AxiosRequestConfig
        : never),
  >(options: U): Promise<IResponse<T, U>> {
    this.options.proxy = this.handleProxy()
    this.options.headers = options.headers || {}
    this.options.maxBodyLength = Infinity
    this.options.maxContentLength = Infinity
    if (this.options.proxy && options.url?.startsWith('https://')) {
      this.options.httpsAgent = httpsOverHttp({
        proxy: {
          host: this.options.proxy.host,
          port: this.options.proxy.port,
        },
      })
      this.options.proxy = false
    } else {
      this.options.httpsAgent = httpsAgent
    }
    // !NOTICE this.options !== options
    // this.options is the default options
    const instance = axios.create(this.options)
    instance.interceptors.response.use(responseInterceptor, responseErrorHandler)

    // compatible with old request options to new options
    const opt = requestInterceptor(options)

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
        if (opt.__isOldOptions) {
          if ('json' in options) {
            if (options.json) {
              return res.data
            }
          } else {
            return JSON.stringify(res.data)
          }
        } else {
          return res.data
        }
      }) as Promise<IResponse<T, U>>
    }
  }
}

export default Request
