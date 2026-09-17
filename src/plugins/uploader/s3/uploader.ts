import url from 'node:url'

import {
  GetObjectCommand,
  ObjectCannedACL,
  PutObjectCommand,
  PutObjectCommandOutput,
  S3Client,
  S3ClientConfig,
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
    httpHandlerOpts.httpsAgent = getProxyAgent(opts.proxy, true, !!opts.rejectUnauthorized) as HttpsProxyAgent
  } else {
    httpHandlerOpts.httpAgent = getProxyAgent(opts.proxy, false, !!opts.rejectUnauthorized) as HttpProxyAgent
  }

  const clientOptions: S3ClientConfig = {
    region: opts.region || 'auto',
    endpoint: opts.endpoint || undefined,
    credentials: {
      accessKeyId: opts.accessKeyID,
      secretAccessKey: opts.secretAccessKey,
    },
    tls: sslEnabled,
    forcePathStyle: opts.pathStyleAccess,
    requestHandler: new NodeHttpHandler(httpHandlerOpts),
  }

  return new S3Client(clientOptions)
}

interface ICreateUploadTaskOpts {
  client: any
  bucketName: string
  path: string
  item: IImgInfo
  acl?: ObjectCannedACL
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
      ContentEncoding: contentEncoding,
    })

    const output: PutObjectCommandOutput = await opts.client.send(command)

    let url: string
    if (!opts.urlPrefix) {
      url = await getFileURL(opts, output.VersionId)
    } else {
      url = appendUrlOptions(`${opts.urlPrefix}/${opts.path}`, opts.options)
    }

    return {
      key: opts.path,
      url,
      imgURL: url,
      versionId: output.VersionId,
      eTag: output.ETag,
    }
  } catch (err) {
    return Promise.reject(err)
  }
}

function appendUrlOptions(fileUrl: string, options: string): string {
  if (!options) return fileUrl
  return `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}${options.replace(/^\?/, '')}`
}

async function getFileURL(opts: ICreateUploadTaskOpts, versionId?: string): Promise<string> {
  const isPublic = opts.acl === 'public-read' || opts.acl === 'public-read-write'
  const command = new GetObjectCommand({
    Bucket: opts.bucketName,
    Key: opts.path,
    VersionId: versionId,
  })

  if (!isPublic && opts.options) {
    const options = new url.URLSearchParams(opts.options)
    const query = Object.fromEntries(Array.from(options.keys(), key => [key, options.getAll(key)]))
    // Include URL options before signing so they do not invalidate the signature.
    command.middlewareStack.add(
      next => async args => {
        const request = args.request as { query?: Record<string, string | string[] | null> }
        request.query = { ...query, ...request.query }
        return next(args)
      },
      { step: 'build', name: 'downloadUrlOptions' },
    )
  }

  const signedUrl = await getSignedUrl(opts.client, command, { expiresIn: 3600 })
  if (!isPublic) return signedUrl

  // Public links do not need expiring credentials, but must retain the object version.
  const urlObject = new url.URL(signedUrl)
  urlObject.search = ''
  if (versionId !== undefined) urlObject.searchParams.set('versionId', versionId)
  return appendUrlOptions(urlObject.href, opts.options)
}

export default {
  createS3Client,
  createUploadTask,
}
