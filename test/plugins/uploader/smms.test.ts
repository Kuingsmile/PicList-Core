import { describe, expect, it } from 'vitest'

import registerSmmsUploader from '../../../src/plugins/uploader/smms'
import { IBuildInEvent } from '../../../src/utils/enum'
import { createUploader } from '../../helpers/uploader'

const config = { token: '  synthetic-token  ' }
const uploadedImage = { url: 'https://images.example.invalid/photo.png', hash: 'image-hash' }

describe('SM.MS uploader', () => {
  it.each(['buffer', 'base64Image'] as const)('uploads %s as multipart data and trims the token', async source => {
    const buffer = Buffer.from('synthetic-image')
    const image = { fileName: 'photo.png', [source]: source === 'buffer' ? buffer : buffer.toString('base64') }
    const { ctx, upload } = createUploader(registerSmmsUploader, 'picBed.smms', config, [image])
    ctx.request.mockResolvedValueOnce(JSON.stringify({ code: 200, message: 'success', data: uploadedImage }))

    await expect(upload()).resolves.toBe(ctx)

    expect(ctx.request).toHaveBeenCalledExactlyOnceWith({
      method: 'POST',
      url: 'https://s.ee/api/v1/file/upload',
      headers: { contentType: 'multipart/form-data', 'User-Agent': 'PicList', Authorization: 'synthetic-token' },
      formData: { smfile: { value: buffer, options: { filename: 'photo.png' } }, ssl: 'true' },
    })
    expect(ctx.output).toEqual([{ fileName: 'photo.png', imgUrl: uploadedImage.url, hash: uploadedImage.hash }])
    expect(ctx.emit).not.toHaveBeenCalled()
  })

  it.each([{ code: 200 }, { message: 'success' }])('accepts the API success indicator %j', async response => {
    const { ctx, upload } = createUploader(registerSmmsUploader, 'picBed.smms', config)
    ctx.request.mockResolvedValueOnce(JSON.stringify({ ...response, data: uploadedImage }))

    await upload()

    expect(ctx.output[0].imgUrl).toBe(uploadedImage.url)
  })

  it.each([
    [{ code: 403, message: 'Invalid token' }, 'Invalid token'],
    [{ code: 500 }, 'Upload failed'],
  ])('reports rejected uploads without discarding the source: %j', async (response, message) => {
    const original = { fileName: 'photo.png', buffer: Buffer.from('synthetic-image') }
    const { ctx, upload } = createUploader(registerSmmsUploader, 'picBed.smms', config, [{ ...original }])
    ctx.request.mockResolvedValueOnce(JSON.stringify(response))

    await expect(upload()).rejects.toThrow(message)

    expect(ctx.output).toEqual([original])
    expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
      title: 'UPLOAD_FAILED',
      body: message,
    })
  })

  it('skips incomplete entries and prefers a buffer when both image representations exist', async () => {
    const buffer = Buffer.from('buffer-content')
    const skipped = [{ base64Image: 'cGhvdG8=' }, { fileName: 'empty.png' }]
    const { ctx, upload } = createUploader(registerSmmsUploader, 'picBed.smms', config, [
      ...skipped,
      { fileName: 'valid.png', buffer, base64Image: 'b3RoZXI=' },
    ])
    ctx.request.mockResolvedValueOnce(JSON.stringify({ code: 200, data: uploadedImage }))

    await upload()

    expect(ctx.request).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        formData: { smfile: { value: buffer, options: { filename: 'valid.png' } }, ssl: 'true' },
      }),
    )
    expect(ctx.output.slice(0, 2)).toEqual(skipped)
    expect(ctx.output[2]).toEqual({ fileName: 'valid.png', imgUrl: uploadedImage.url, hash: uploadedImage.hash })
  })

  it.each([
    [undefined, 'Can not find picBed.smms config!'],
    [{}, 'Missing required config option: token'],
    [{ token: '\t ' }, 'Missing required config option: token'],
  ])('rejects invalid configuration before making requests: %j', async (options, message) => {
    const { ctx, upload } = createUploader(registerSmmsUploader, 'picBed.smms', options)

    await expect(upload()).rejects.toThrow(message)

    expect(ctx.request).not.toHaveBeenCalled()
  })

  it('propagates transport errors and leaves the image available to retry', async () => {
    const { ctx, upload } = createUploader(registerSmmsUploader, 'picBed.smms', config)
    const failure = new Error('Connection failed')
    ctx.request.mockRejectedValueOnce(failure)

    await expect(upload()).rejects.toBe(failure)

    expect(ctx.output[0].buffer).toEqual(Buffer.from('synthetic-image'))
    expect(ctx.output[0].imgUrl).toBeUndefined()
  })
})
