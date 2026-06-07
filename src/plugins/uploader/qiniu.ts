import mime from 'mime'
import qiniu from 'qiniu'

import { ILocalesKey } from '../../i18n/zh-CN'
import { IOldReqOptions, IPicGo, IPluginConfig, IQiniuConfig } from '../../types'
import { IBuildInEvent } from '../../utils/enum'
import { getAndCheckConfig } from './helper'
import { buildInUploaderNames, createField } from './utils'

const messageGetter = (ctx: IPicGo, key: ILocalesKey) => ({
  get message() {
    return ctx.i18n.translate<ILocalesKey>(key)
  },
})

function postOptions(options: IQiniuConfig, fileName: string, token: string, imgBase64: string): IOldReqOptions {
  const area = selectArea(options.area || 'z0')
  const path = options.path || ''
  const base64FileName = Buffer.from(path + fileName, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return {
    method: 'POST',
    url: `http://upload${area}.qiniup.com/putb64/-1/key/${base64FileName}`,
    headers: {
      Authorization: `UpToken ${token}`,
      'Content-Type': mime.getType(fileName) || 'application/octet-stream',
    },
    body: imgBase64,
  }
}

function selectArea(area: string): string {
  return area === 'z0' ? '' : '-' + area
}

function getToken(qiniuOptions: any): string {
  const accessKey = qiniuOptions.accessKey
  const secretKey = qiniuOptions.secretKey
  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey)
  const options = {
    scope: qiniuOptions.bucket,
  }
  const putPolicy = new qiniu.rs.PutPolicy(options)
  return putPolicy.uploadToken(mac)
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const qiniuOptions = getAndCheckConfig<IQiniuConfig>(ctx, 'picBed.qiniu', [])
  try {
    for (const img of ctx.output) {
      if (!img.fileName) continue
      const base64Image = img.base64Image || (img.buffer ? Buffer.from(img.buffer).toString('base64') : null)
      if (!base64Image) continue
      const options = postOptions(qiniuOptions, img.fileName, getToken(qiniuOptions), base64Image)
      const res = await ctx.request(options)
      const body = JSON.parse(res)
      if (body?.key) {
        delete img.base64Image
        delete img.buffer
        const baseUrl = qiniuOptions.url
        const urlOptions = qiniuOptions.options || ''
        img.imgUrl = `${baseUrl}/${body.key as string}${urlOptions}`
      } else {
        ctx.emit(IBuildInEvent.NOTIFICATION, {
          title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
          body: body.msg,
        })
        ctx.log.error('qiniu error', body)
        throw new Error('Upload failed')
      }
    }
    return ctx
  } catch (err: any) {
    if (err.message !== 'Upload failed') {
      // err.response maybe undefined
      if (err.response) {
        const error = err.response.body
        ctx.emit(IBuildInEvent.NOTIFICATION, {
          title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
          body: error.error,
        })
      }
    }
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IQiniuConfig>('picBed.qiniu') || {}
  const config: IPluginConfig[] = [
    createField(ctx, 'qiniu', 'accessKey', 'input', userConfig.accessKey || '', true),
    createField(ctx, 'qiniu', 'secretKey', 'input', userConfig.secretKey || '', true),
    createField(ctx, 'qiniu', 'bucket', 'input', userConfig.bucket || '', true),
    createField(
      ctx,
      'qiniu',
      'url',
      'input',
      userConfig.url || '',
      true,
      undefined,
      messageGetter(ctx, 'PICBED_QINIU_MESSAGE_URL'),
    ),
    createField(
      ctx,
      'qiniu',
      'area',
      'input',
      userConfig.area || '',
      true,
      undefined,
      messageGetter(ctx, 'PICBED_QINIU_MESSAGE_AREA'),
    ),
    createField(
      ctx,
      'qiniu',
      'options',
      'input',
      userConfig.options || '',
      false,
      undefined,
      messageGetter(ctx, 'PICBED_QINIU_MESSAGE_OPTIONS'),
    ),
    createField(
      ctx,
      'qiniu',
      'path',
      'input',
      userConfig.path || '',
      false,
      undefined,
      messageGetter(ctx, 'PICBED_QINIU_MESSAGE_PATH'),
    ),
  ]
  return config
}

export default function register(ctx: IPicGo): void {
  ctx.helper.uploader.register(buildInUploaderNames.qiniu, {
    get name() {
      return ctx.i18n.translate<ILocalesKey>('PICBED_QINIU')
    },
    handle,
    config,
  })
}
