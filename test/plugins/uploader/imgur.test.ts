import { describe, expect, it } from 'vitest'

import registerImgurUploader from '../../../src/plugins/uploader/imgur'
import type { IImgInfo } from '../../../src/types'
import { IBuildInEvent } from '../../../src/utils/enum'
import { createUploader } from '../../helpers/uploader'

const uploadedImage = { link: 'https://images.example.invalid/photo.png', deletehash: 'delete-hash' }
const success = { success: true, data: uploadedImage }

function imgurUploader(config: Record<string, unknown> = { clientId: 'synthetic-client-id' }, output?: IImgInfo[]) {
  return createUploader(registerImgurUploader, 'picBed.imgur', config, output)
}

function expectFailureNotification(ctx: ReturnType<typeof imgurUploader>['ctx']) {
  expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
    title: 'UPLOAD_FAILED',
    body: 'CHECK_SETTINGS_AND_NETWORK',
    text: 'http://docs.imgur.com/api/errno/',
  })
}

describe('Imgur uploader', () => {
  it.each(['json string', 'object'])('uploads buffer content and accepts a %s response', async responseType => {
    const { ctx, upload } = imgurUploader()
    ctx.request.mockResolvedValueOnce(responseType === 'json string' ? JSON.stringify(success) : success)

    await expect(upload()).resolves.toBe(ctx)

    expect(ctx.request).toHaveBeenCalledExactlyOnceWith({
      method: 'POST',
      url: 'https://api.imgur.com/3/image',
      headers: {
        Authorization: 'Client-ID synthetic-client-id',
        'content-type': 'multipart/form-data',
        Host: 'api.imgur.com',
        'User-Agent': 'PicList',
      },
      formData: {
        image: Buffer.from('synthetic-image').toString('base64'),
        type: 'base64',
        name: 'photo.png',
        description: 'Uploaded with PicList',
      },
    })
    expect(ctx.output).toEqual([{ fileName: 'photo.png', imgUrl: uploadedImage.link, hash: uploadedImage.deletehash }])
    expect(ctx.emit).not.toHaveBeenCalled()
  })

  it.each(['synthetic-access-token', 'Bearer synthetic-access-token'])(
    'authorizes account uploads with %s',
    async accessToken => {
      const { ctx, upload } = imgurUploader({ username: 'test-user', accessToken, clientId: 'unused-client' }, [
        { fileName: 'photo.png', base64Image: 'cGhvdG8=', buffer: Buffer.from('other-content') },
      ])
      ctx.request.mockResolvedValueOnce(success)

      await upload()

      expect(ctx.request).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer synthetic-access-token' }),
          formData: expect.objectContaining({ image: 'cGhvdG8=' }),
        }),
      )
      expect(ctx.output[0]).not.toHaveProperty('buffer')
      expect(ctx.output[0]).not.toHaveProperty('base64Image')
    },
  )

  it('finds an album on a later page and applies the proxy to lookup and upload requests', async () => {
    const { ctx, upload } = imgurUploader({
      username: 'test-user',
      accessToken: 'synthetic-access-token',
      album: 'Gallery',
      proxy: 'http://proxy.example.invalid:8080',
    })
    ctx.request.mockImplementation(async options => {
      if (options.method === 'POST') return success
      const page = options.url.split('/').at(-1)
      const data =
        page === '0'
          ? [{ title: 'Other album', id: 'other' }]
          : page === '1'
            ? [{ title: 'Gallery', id: 'gallery-id' }]
            : []
      return { statusCode: 200, body: { success: true, data } }
    })

    await upload()

    expect(ctx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://api.imgur.com/3/account/test-user/albums/1',
        json: true,
        resolveWithFullResponse: true,
        timeout: 10000,
      }),
    )
    expect(ctx.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'POST',
        formData: expect.objectContaining({ album: 'gallery-id' }),
      }),
    )
    for (const [options] of ctx.request.mock.calls) {
      expect(options.proxy).toBe('http://proxy.example.invalid:8080')
      expect(options.headers?.Authorization).toBe('Bearer synthetic-access-token')
    }
    expect(ctx.output[0].imgUrl).toBe(uploadedImage.link)
  })

  it('uploads without an album when the requested album is absent', async () => {
    const { ctx, upload } = imgurUploader({ username: 'test-user', accessToken: 'synthetic-token', album: 'Missing' })
    ctx.request
      .mockResolvedValueOnce({ statusCode: 200, body: { success: true, data: [] } })
      .mockResolvedValueOnce(success)

    await upload()

    const options = ctx.request.mock.calls.at(-1)![0]
    expect(options.method).toBe('POST')
    expect(options.formData).not.toHaveProperty('album')
    expect(options).not.toHaveProperty('proxy')
    expect(ctx.output[0].imgUrl).toBe(uploadedImage.link)
  })

  it('falls back to client authorization and skips album lookup without a complete account', async () => {
    const { ctx, upload } = imgurUploader({
      clientId: 'synthetic-client-id',
      accessToken: 'synthetic-token',
      album: 'Gallery',
    })
    ctx.request.mockResolvedValueOnce(success)

    await upload()

    expect(ctx.request).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Client-ID synthetic-client-id' }),
      }),
    )
    expect(ctx.request.mock.calls[0][0].formData).not.toHaveProperty('album')
  })

  it.each([
    { statusCode: 503, body: { success: true, data: [] } },
    { statusCode: 200, body: { success: false, data: [] } },
  ])('stops before uploading when album lookup fails: %j', async response => {
    const { ctx, upload } = imgurUploader({ username: 'test-user', accessToken: 'synthetic-token', album: 'Gallery' })
    ctx.request.mockResolvedValueOnce(response)

    await expect(upload()).rejects.toThrow('Server error, please try again')

    expect(ctx.request).toHaveBeenCalledTimes(1)
    expect(ctx.output[0].buffer).toBeDefined()
    expectFailureNotification(ctx)
  })

  it('rejects a missing configuration without making a request', async () => {
    const { ctx, upload } = createUploader(registerImgurUploader, 'picBed.imgur', undefined)

    await expect(upload()).rejects.toThrow("Can't find imgur config")

    expect(ctx.request).not.toHaveBeenCalled()
  })

  it.each([{}, { username: 'test-user' }, { accessToken: 'synthetic-token' }])(
    'rejects incomplete credentials: %j',
    async config => {
      const { ctx, upload } = imgurUploader(config)

      await expect(upload()).rejects.toThrow('clientId or accessToken is required')

      expect(ctx.request).not.toHaveBeenCalled()
      expectFailureNotification(ctx)
    },
  )

  it('reports a rejected upload and preserves the source', async () => {
    const { ctx, upload } = imgurUploader()
    ctx.request.mockResolvedValueOnce(JSON.stringify({ success: false }))

    await expect(upload()).rejects.toThrow('Server error, please try again')

    expect(ctx.output[0].buffer).toEqual(Buffer.from('synthetic-image'))
    expect(ctx.output[0].imgUrl).toBeUndefined()
    expectFailureNotification(ctx)
  })

  it.each([false, true])('propagates transport failures (response body=%s)', async hasResponse => {
    const { ctx, upload } = imgurUploader()
    const failure = hasResponse ? { response: { data: { error: 'Rate limited' } } } : new Error('Connection failed')
    ctx.request.mockRejectedValueOnce(failure)

    await expect(upload()).rejects.toBe('response' in failure ? failure.response.data : failure)

    expectFailureNotification(ctx)
  })

  it('skips images without names or content', async () => {
    const skipped = [{ buffer: Buffer.from('no-name') }, { fileName: 'empty.png' }]
    const { ctx, upload } = imgurUploader(undefined, [...skipped, { fileName: 'valid.png', base64Image: 'cGhvdG8=' }])
    ctx.request.mockResolvedValueOnce(success)

    await upload()

    expect(ctx.request).toHaveBeenCalledTimes(1)
    expect(ctx.output.slice(0, 2)).toEqual(skipped)
    expect(ctx.output[2].imgUrl).toBe(uploadedImage.link)
  })

  it.each([
    undefined,
    {
      clientId: 'synthetic-client',
      username: 'test-user',
      accessToken: 'synthetic-token',
      album: 'Gallery',
      proxy: 'http://proxy.example.invalid',
    },
  ])('provides editable, localized fields with saved values or empty defaults', config => {
    const { plugin, getFields } = createUploader(registerImgurUploader, 'picBed.imgur', config)

    expect(plugin.name).toBe('PICBED_IMGUR')
    expect(
      getFields().map(field => ({
        name: field.name,
        default: field.default,
        type: field.type,
        required: field.required,
        prefix: field.prefix,
        alias: field.alias,
        message: field.message,
      })),
    ).toEqual(
      [
        ['clientId', 'CLIENTID'],
        ['username', 'USERNAME'],
        ['accessToken', 'ACCESS_TOKEN'],
        ['album', 'ALBUM'],
        ['proxy', 'PROXY'],
      ].map(([name, translation]) => ({
        name,
        default: config?.[name as keyof typeof config] || '',
        type: 'input',
        required: false,
        prefix: `PICBED_IMGUR_${translation}`,
        alias: `PICBED_IMGUR_${translation}`,
        message: `PICBED_IMGUR_MESSAGE_${translation}`,
      })),
    )
  })
})
