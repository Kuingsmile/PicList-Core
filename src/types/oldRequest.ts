export type IMethod =
  | 'get'
  | 'GET'
  | 'delete'
  | 'DELETE'
  | 'head'
  | 'HEAD'
  | 'options'
  | 'OPTIONS'
  | 'post'
  | 'POST'
  | 'put'
  | 'PUT'
  | 'patch'
  | 'PATCH'
  | 'purge'
  | 'PURGE'
  | 'link'
  | 'LINK'
  | 'unlink'
  | 'UNLINK'

export type IHeaders = Record<string, any>

/** Legacy request-promise option shape translated by the HTTP compatibility adapter. */
export interface IRequestPromiseOptions {
  baseUrl?: string | undefined
  url?: string
  method?: IMethod
  /** Multipart fields, optionally using value/options descriptors for file uploads. */
  formData?: Record<string, any> | undefined
  /** Query values mapped to Axios params. */
  qs?: any
  json?: boolean
  /** Request payload mapped to Axios data. */
  body?: any
  /** Selects the full response with statusCode and body compatibility aliases. */
  resolveWithFullResponse?: boolean
  headers?: IHeaders
  proxy?: any
  /** Request timeout in milliseconds. */
  timeout?: number
}
