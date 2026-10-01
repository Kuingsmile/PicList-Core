import { isIP } from 'node:net'

import mime from 'mime'

import { IOldReqOptionsWithFullResponse, IPicGo, IPicListConfig, IPluginConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { completeUploadFile, createUploadProgressCallback } from '../../utils/uploadProgress'
import { getAndCheckConfig, getImageBuffer } from './helper'
import { buildInUploaderNames } from './utils'

interface PicListUploadResponse {
  success?: boolean
  result?: string[]
  fullResult?: unknown[]
  message?: string
  msg?: string
}

/** Resolves a server base address and encodes the configured upload destination and key. */
const getUploadUrl = (options: IPicListConfig): string => {
  const { host = '127.0.0.1', port = '', picbed = '', configName = 'Default', serverKey = '' } = options
  const address = host.trim()
  const scheme = /^[a-z][\da-z+.-]*:\/\//i
  const value = scheme.test(address) ? address : `http://${address}`
  const invalidHost = new Error('PicList host must be an HTTP(S) base address without credentials, query, or fragment')
  if (!URL.canParse(value)) throw invalidHost
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\\?#]/.test(address)) {
    throw invalidHost
  }

  // Inspect the authority because URL.port omits explicit default ports such as :80 and :443.
  const authority = address.replace(scheme, '').split('/', 1)[0]
  const hasPort = /:\d+$/.test(authority)
  const configuredPort = String(port).trim()
  if (configuredPort) {
    if (!/^\d+$/.test(configuredPort) || Number(configuredPort) < 1 || Number(configuredPort) > 65535) {
      throw new Error('PicList port must be an integer between 1 and 65535')
    }
    url.port = configuredPort
  } else if (!hasPort && isIP(url.hostname.replace(/^\[|\]$/g, ''))) {
    url.port = '36677'
  }

  url.pathname = `${url.pathname}/upload`.replace(/\/+/g, '/')
  const params = new URLSearchParams({ configName })
  if (picbed) params.set('picbed', picbed)
  // Both the desktop and standalone servers currently authenticate through this query parameter.
  if (serverKey) params.set('key', serverKey)
  url.search = params.toString()
  return url.href
}

/** Builds a PicList server upload request with destination/profile selection and optional server key. */
const postOptions = (options: IPicListConfig, fileName: string, image: Buffer): IOldReqOptionsWithFullResponse => {
  return {
    method: 'POST',
    url: getUploadUrl(options),
    headers: {
      'content-type': 'multipart/form-data',
    },
    formData: {
      file: {
        value: image,
        options: {
          filename: fileName,
          contentType: mime.getType(fileName) || 'application/octet-stream',
        },
      },
    },
    resolveWithFullResponse: true,
  }
}

/** Forwards image records to a PicList server and stores its returned URL and optional full result. */
const handle = async (ctx: IPicGo): Promise<IPicGo | boolean> => {
  const piclistOptions = getAndCheckConfig<IPicListConfig>(ctx, 'picBed.piclist', [])

  try {
    for (const img of ctx.output) {
      if (!img.fileName) continue
      const image = getImageBuffer(img)
      if (!image) continue
      const options = postOptions(piclistOptions, img.fileName, image)

      const res = await ctx.request<PicListUploadResponse, IOldReqOptionsWithFullResponse>({
        ...options,
        onUploadProgress: createUploadProgressCallback(ctx, img),
      })
      const imageUrl = res.body?.result?.[0]
      if (res.statusCode === 200 && res.body?.success && typeof imageUrl === 'string' && imageUrl.trim()) {
        delete img.base64Image
        delete img.buffer
        img.imgUrl = imageUrl
        img.fullResult = res.body.fullResult ? res.body.fullResult[0] : ''
      } else {
        throw new Error(res.body?.message || res.body?.msg || 'PicList server did not return an uploaded image URL')
      }

      if (img.imgUrl) completeUploadFile(ctx, img)
    }
    return ctx
  } catch (err: any) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: ctx.i18n.t('UPLOAD_FAILED'),
      body: ctx.i18n.t('CHECK_SETTINGS'),
    })
    throw err
  }
}

/** Builds the PicList server configuration form using saved values and localized field labels. */
const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IPicListConfig>('picBed.piclist') || {}
  const config: IPluginConfig[] = [
    {
      name: 'host',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_PICLIST_HOST')
      },
      get alias() {
        return ctx.i18n.t('PICBED_PICLIST_HOST')
      },
      default: userConfig.host || '127.0.0.1',
      required: true,
    },
    {
      name: 'port',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_PICLIST_PORT')
      },
      get alias() {
        return ctx.i18n.t('PICBED_PICLIST_PORT')
      },
      default: userConfig.port || 36677,
      required: false,
    },
    {
      name: 'picbed',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_PICLIST_PICBED')
      },
      get alias() {
        return ctx.i18n.t('PICBED_PICLIST_PICBED')
      },
      default: userConfig.picbed || '',
      required: false,
    },
    {
      name: 'configName',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_PICLIST_CONFIGNAME')
      },
      get alias() {
        return ctx.i18n.t('PICBED_PICLIST_CONFIGNAME')
      },
      default: userConfig.configName || '',
      required: false,
    },
    {
      name: 'serverKey',
      type: 'input',
      get prefix() {
        return ctx.i18n.t('PICBED_PICLIST_KEY')
      },
      get alias() {
        return ctx.i18n.t('PICBED_PICLIST_KEY')
      },
      default: userConfig.serverKey || '',
      required: false,
    },
  ]
  return config
}

/** Registers the built-in PicList server uploader and its configuration form on the client. */
export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.piclist, {
    get name() {
      return ctx.i18n.t('PICBED_PICLIST')
    },
    handle,
    config,
  })
}
