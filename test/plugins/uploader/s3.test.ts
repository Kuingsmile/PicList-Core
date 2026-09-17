import { GetObjectCommand, ObjectCannedACL, PutObjectCommandOutput, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import uploader from '../../../src/plugins/uploader/s3/uploader'

const bucketName = 'test-bucket'
const path = 'images/photo + #?.png'
const versionId = 'test/version+id='
const eTag = '"test-etag"'

describe('S3 download URLs', () => {
  let client: S3Client
  const send = vi.fn<() => Promise<PutObjectCommandOutput>>()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    client = new S3Client({
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'synthetic-access-key',
        secretAccessKey: 'synthetic-secret-key',
        sessionToken: 'synthetic-session-token',
      },
      requestHandler: {
        handle: async () => {
          throw new Error('Unexpected network request')
        },
      },
    })
    send.mockReset().mockResolvedValue({ $metadata: {}, ETag: eTag, VersionId: versionId })
    vi.spyOn(client, 'send').mockImplementation(send)
  })

  afterEach(() => {
    client.destroy()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function upload(overrides: Partial<Parameters<typeof uploader.createUploadTask>[0]> = {}) {
    return uploader.createUploadTask({
      client,
      bucketName,
      path,
      item: { buffer: Buffer.from('synthetic-image'), extname: '.png' },
      acl: 'private',
      options: '',
      ...overrides,
    })
  }

  it('returns a browser-usable private URL with its signature, session token and object version intact', async () => {
    const result = await upload()
    const downloadUrl = new URL(result.url)

    expect(downloadUrl.searchParams.has('X-Amz-Signature')).toBe(true)
    expect(downloadUrl.searchParams.get('X-Amz-Security-Token')).toBe('synthetic-session-token')
    expect(downloadUrl.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(downloadUrl.searchParams.get('versionId')).toBe(versionId)
    expect(downloadUrl.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(decodeURIComponent(downloadUrl.pathname)).toBe(`/${path}`)
    expect(result.imgURL).toBe(result.url)
    expect(result.versionId).toBe(versionId)
    expect(result.eTag).toBe(eTag)
  })

  it('preserves the signature for an unversioned private object', async () => {
    send.mockResolvedValue({ $metadata: {}, ETag: eTag })

    const result = await upload()
    const expectedUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucketName, Key: path }), {
      expiresIn: 3600,
    })

    expect(result.url).toBe(expectedUrl)
    expect(new URL(result.url).searchParams.has('versionId')).toBe(false)
  })

  it.each<ObjectCannedACL | undefined>([
    undefined,
    'authenticated-read',
    'aws-exec-read',
    'bucket-owner-read',
    'bucket-owner-full-control',
  ])('keeps authorization for the non-public ACL %s', async acl => {
    const result = await upload({ acl })

    expect(new URL(result.url).searchParams.has('X-Amz-Signature')).toBe(true)
  })

  it.each(['', '?'])('signs private URL options with the optional prefix "%s"', async prefix => {
    const disposition = 'inline; filename="photo + ~.png"'
    const result = await upload({
      options: `${prefix}response-content-disposition=${encodeURIComponent(disposition)}`,
    })
    const expectedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucketName,
        Key: path,
        VersionId: versionId,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: 3600 },
    )

    expect(result.url).toBe(expectedUrl)
    expect(new URL(result.url).searchParams.get('response-content-disposition')).toBe(disposition)
  })

  it.each<ObjectCannedACL>(['public-read', 'public-read-write'])(
    'keeps %s URLs unsigned while preserving the uploaded version',
    async acl => {
      const result = await upload({ acl })
      const downloadUrl = new URL(result.url)

      expect([...downloadUrl.searchParams]).toEqual([['versionId', versionId]])
      expect(decodeURIComponent(downloadUrl.pathname)).toBe(`/${path}`)
    },
  )

  it('keeps unversioned public URLs free of signing parameters', async () => {
    send.mockResolvedValue({ $metadata: {}, ETag: eTag })

    const result = await upload({ acl: 'public-read' })

    expect(new URL(result.url).search).toBe('')
  })

  it('appends public URL options alongside the object version', async () => {
    const result = await upload({ acl: 'public-read', options: '?width=100&format=webp' })

    expect([...new URL(result.url).searchParams]).toEqual([
      ['versionId', versionId],
      ['width', '100'],
      ['format', 'webp'],
    ])
  })

  it.each(['', '?width=100', 'width=100'])('preserves custom URL prefixes with options "%s"', async options => {
    const result = await upload({ path: 'photo.png', urlPrefix: 'https://cdn.example.invalid/images', options })

    expect(result.url).toBe(`https://cdn.example.invalid/images/photo.png${options ? '?width=100' : ''}`)
    expect(result.imgURL).toBe(result.url)
  })
})
