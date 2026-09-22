import { describe, expect, it } from 'vitest'

import { Request } from '../../../src/lib/Request'
import registerTcyunUploader from '../../../src/plugins/uploader/tcyun'
import type { IPicGo } from '../../../src/types'
import { createUploader } from '../../helpers/uploader'

const config = {
  version: 'v4',
  secretId: 'synthetic-secret-id',
  secretKey: 'synthetic-secret-key',
  bucket: 'test-bucket',
  appId: '123456',
  area: 'ap-beijing',
  path: '',
}
const success = { message: 'SUCCESS', data: { source_url: 'https://example.test/photo.png' } }

describe('Tencent COS uploader', () => {
  it.each(['object', 'JSON string'])('uploads V4 images through the adapter (%s body)', async bodyType => {
    const { ctx, upload } = createUploader(registerTcyunUploader, 'picBed.tcyun', config)
    const request = new Request(ctx as unknown as IPicGo)
    if (bodyType === 'JSON string') request.options.responseType = 'text'
    request.options.adapter = async requestConfig => ({
      data: JSON.stringify(success),
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      config: requestConfig,
    })
    ctx.request.mockImplementation(options => request.request(options))

    await expect(upload()).resolves.toBe(ctx)

    expect(ctx.request).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ method: 'POST', resolveWithFullResponse: true }),
    )
    await expect(ctx.request.mock.results[0].value).resolves.toMatchObject({
      statusCode: 200,
      body: bodyType === 'JSON string' ? JSON.stringify(success) : success,
    })
    expect(ctx.output).toEqual([{ fileName: 'photo.png', imgUrl: success.data.source_url }])
  })

  it('accepts a V5 upload using the outer status with an empty body', async () => {
    const { ctx, upload } = createUploader(registerTcyunUploader, 'picBed.tcyun', { ...config, version: 'v5' })
    ctx.request.mockResolvedValueOnce({ statusCode: 200, body: '' })

    await expect(upload()).resolves.toBe(ctx)

    expect(ctx.output).toEqual([
      { fileName: 'photo.png', imgUrl: 'https://test-bucket.cos.ap-beijing.myqcloud.com/photo.png' },
    ])
  })

  it.each(['object', 'JSON string'])('reports V4 application errors from a %s body', async bodyType => {
    const { ctx, upload } = createUploader(registerTcyunUploader, 'picBed.tcyun', config)
    const failure = { message: 'FAIL', msg: 'Upload rejected' }
    ctx.request.mockResolvedValueOnce({
      statusCode: 200,
      body: bodyType === 'JSON string' ? JSON.stringify(failure) : failure,
    })

    await expect(upload()).rejects.toThrow('Upload rejected')

    expect(ctx.output[0].imgUrl).toBeUndefined()
  })

  it.each(['v4', 'v5'])('preserves transport errors for %s uploads', async version => {
    const { ctx, upload } = createUploader(registerTcyunUploader, 'picBed.tcyun', { ...config, version })
    const failure = new Error('Connection failed')
    ctx.request.mockRejectedValueOnce(failure)

    await expect(upload()).rejects.toBe(failure)

    expect(ctx.output[0].buffer).toEqual(Buffer.from('synthetic-image'))
    expect(ctx.output[0].imgUrl).toBeUndefined()
  })
})
