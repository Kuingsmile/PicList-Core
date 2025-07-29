import url from 'node:url'

import {
  GetObjectCommand,
  PutObjectCommand,
  PutObjectCommandOutput,
  S3Client,
  S3ClientConfig
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NodeHttpHandler, NodeHttpHandlerOptions } from '@smithy/node-http-handler'
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent'

import { IAwsS3PListUserConfig, IImgInfo } from '../../../types'
import { extractInfo, getProxyAgent } from './utils'

export interface IUploadResult {
  key: string
  url: string
  imgURL: string
  versionId?: string
  eTag?: string
}

function createS3Client(opts: IAwsS3PListUserConfig): S3Client {
  let sslEnabled = true
  try {
    const u = new url.URL(opts.endpoint!)
    sslEnabled = u.protocol === 'https:'
  } catch {}

  const httpHandlerOpts: NodeHttpHandlerOptions = {}
  if (sslEnabled) {
    httpHandlerOpts.httpsAgent = getProxyAgent(opts.proxy, true, opts.rejectUnauthorized ?? false) as HttpsProxyAgent
  } else {
    httpHandlerOpts.httpAgent = getProxyAgent(opts.proxy, false, opts.rejectUnauthorized ?? false) as HttpProxyAgent
  }

  const clientOptions: S3ClientConfig = {
    region: opts.region || 'auto',
    endpoint: opts.endpoint || undefined,
    credentials: {
      accessKeyId: opts.accessKeyID,
      secretAccessKey: opts.secretAccessKey
    },
    tls: sslEnabled,
    forcePathStyle: opts.pathStyleAccess,
    requestHandler: new NodeHttpHandler(httpHandlerOpts)
  }

  return new S3Client(clientOptions)
}

interface ICreateUploadTaskOpts {
  client: any
  bucketName: string
  path: string
  item: IImgInfo
  acl: string
  urlPrefix?: string
  options: string
}

async function createUploadTask(opts: ICreateUploadTaskOpts): Promise<IUploadResult> {
  if (!opts.item.buffer && !opts.item.base64Image) {
    throw new Error('undefined image')
  }
  try {
    const { body, contentType, contentEncoding } = await extractInfo(opts.item)

    const command = new PutObjectCommand({
      Bucket: opts.bucketName,
      Key: opts.path,
      ACL: opts.acl,
      Body: body,
      ContentType: contentType,
      ContentEncoding: contentEncoding
    })

    const output: PutObjectCommandOutput = await opts.client.send(command)

    let url: string
    if (!opts.urlPrefix) {
      url = await getFileURL(opts, output.ETag!, output.VersionId!)
    } else {
      url = `${opts.urlPrefix}/${opts.path}`
    }

    if (opts.options) {
      url += opts.options.startsWith('?') ? opts.options : `?${opts.options}`
    }

    return {
      key: opts.path,
      url,
      imgURL: url,
      versionId: output.VersionId,
      eTag: output.ETag
    }
  } catch (err) {
    return Promise.reject(err)
  }
}

async function getFileURL(opts: ICreateUploadTaskOpts, eTag: string, versionId: string): Promise<string> {
  const signedUrl = await getSignedUrl(
    opts.client,
    new GetObjectCommand({
      Bucket: opts.bucketName,
      Key: opts.path,
      IfMatch: eTag,
      VersionId: versionId
    }),
    { expiresIn: 3600 }
  )
  const urlObject = new url.URL(signedUrl)
  urlObject.search = ''
  return urlObject.href
}

export default {
  createS3Client,
  createUploadTask
}
