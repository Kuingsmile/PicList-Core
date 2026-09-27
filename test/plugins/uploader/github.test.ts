import { describe, expect, it } from 'vitest'

import registerGithubUploader from '../../../src/plugins/uploader/github'
import type { IImgInfo } from '../../../src/types'
import { IBuildInEvent } from '../../../src/utils/enum'
import { createUploader } from '../../helpers/uploader'

const config = { repo: 'owner/images', branch: 'main', token: 'synthetic-token', path: '/uploads//' }
const downloadUrl = 'https://raw.example.invalid/photo.png'
// Independently calculated with git hash-object --stdin for the exact fixture bytes.
const photoSha = '9e2c0a25a7c5e7ce95f921514343f2623000ad6c'
const binarySha = '273261f612cde2714cfa601d8c27825e4608769e'

function githubUploader(options: Record<string, unknown> | undefined = config, output?: IImgInfo[]) {
  return createUploader(registerGithubUploader, 'picBed.github', options, output)
}

describe('GitHub uploader', () => {
  it('uploads a buffer using encoded path segments and preserves unrelated image metadata', async () => {
    const image = { fileName: 'nested/photo #1.png', buffer: Buffer.from('synthetic-image'), width: 40 }
    const { ctx, upload } = githubUploader(config, [image])
    ctx.request.mockResolvedValueOnce({ content: { download_url: downloadUrl, sha: 'image-sha' } })

    await expect(upload()).resolves.toBe(ctx)

    expect(ctx.request).toHaveBeenCalledExactlyOnceWith({
      method: 'PUT',
      url: 'https://api.github.com/repos/owner/images/contents/uploads/nested/photo%20%231.png',
      headers: {
        Authorization: 'token synthetic-token',
        'User-Agent': 'PicList',
        'Content-Type': 'image/png',
      },
      body: {
        message: 'Upload by PicList',
        branch: 'main',
        content: Buffer.from('synthetic-image').toString('base64'),
        path: 'uploads/nested/photo%20#1.png',
      },
      json: true,
    })
    expect(ctx.output).toEqual([{ fileName: image.fileName, width: 40, imgUrl: downloadUrl, hash: 'image-sha' }])
    expect(ctx.emit).not.toHaveBeenCalled()
  })

  it('prefers existing base64 content and uses a binary content type for unknown extensions', async () => {
    const { ctx, upload } = githubUploader({ ...config, path: '' }, [
      { fileName: 'photo.unknown-extension', base64Image: 'cGhvdG8=', buffer: Buffer.from('other-data') },
    ])
    ctx.request.mockResolvedValueOnce({ content: { download_url: downloadUrl, sha: 'image-sha' } })

    await upload()

    expect(ctx.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.github.com/repos/owner/images/contents/photo.unknown-extension',
        headers: expect.objectContaining({ 'Content-Type': 'application/octet-stream' }),
        body: expect.objectContaining({ content: 'cGhvdG8=' }),
      }),
    )
    expect(ctx.output[0]).not.toHaveProperty('buffer')
    expect(ctx.output[0]).not.toHaveProperty('base64Image')
  })

  it.each([
    { existing: false, customUrl: '', webPath: '', expected: downloadUrl },
    {
      existing: false,
      customUrl: 'https://cdn.example.invalid/',
      webPath: '',
      expected: 'https://cdn.example.invalid/uploads/photo%20%231.png',
    },
    {
      existing: false,
      customUrl: 'https://cdn.example.invalid/',
      webPath: '/public//',
      expected: 'https://cdn.example.invalid/public/photo%20%231.png',
    },
    { existing: true, customUrl: '', webPath: '', expected: downloadUrl },
    {
      existing: true,
      customUrl: 'https://cdn.example.invalid/',
      webPath: '',
      expected: 'https://cdn.example.invalid/uploads/photo%20%231.png',
    },
    {
      existing: true,
      customUrl: 'https://cdn.example.invalid/',
      webPath: '/public//',
      expected: 'https://cdn.example.invalid/public/photo%20%231.png',
    },
  ])(
    'builds the public URL (existing=$existing, webPath=$webPath, customUrl=$customUrl)',
    async ({ existing, customUrl, webPath, expected }) => {
      const { ctx, upload } = githubUploader({ ...config, customUrl, webPath }, [
        { fileName: 'photo #1.png', base64Image: 'cGhvdG8=' },
      ])
      if (existing) {
        ctx.request
          .mockRejectedValueOnce({ statusCode: 422 })
          .mockResolvedValueOnce({ type: 'file', download_url: downloadUrl, sha: photoSha })
      } else {
        ctx.request.mockResolvedValueOnce({ content: { download_url: downloadUrl, sha: 'new-sha' } })
      }

      await upload()

      expect(ctx.output).toEqual([
        { fileName: 'photo #1.png', imgUrl: expected, hash: existing ? photoSha : 'new-sha' },
      ])
      expect(ctx.request).toHaveBeenCalledTimes(existing ? 2 : 1)
      if (existing) {
        expect(ctx.request).toHaveBeenLastCalledWith({
          method: 'GET',
          url: 'https://api.github.com/repos/owner/images/contents/uploads/photo%20%231.png?ref=main',
          headers: { Authorization: 'token synthetic-token', 'User-Agent': 'PicList' },
          json: true,
        })
      }
      expect(ctx.emit).not.toHaveBeenCalled()
    },
  )

  it.each([
    { source: 'binary buffer', data: { buffer: Buffer.from([0, 255, 128, 195, 169, 10]) }, sha: binarySha },
    { source: 'base64', data: { base64Image: 'AP+Aw6kK' }, sha: binarySha },
    {
      source: 'base64 preferred over a different buffer',
      data: { base64Image: 'cGhvdG8=', buffer: Buffer.from('other-data') },
      sha: photoSha,
    },
  ])('accepts an identical existing image from $source', async ({ data, sha }) => {
    const { ctx, upload } = githubUploader(config, [{ fileName: 'photo.png', width: 40, ...data }])
    ctx.request
      .mockRejectedValueOnce({ statusCode: 422 })
      .mockResolvedValueOnce({ type: 'file', download_url: downloadUrl, sha, content: '', encoding: 'none' })

    await expect(upload()).resolves.toBe(ctx)

    expect(ctx.output).toEqual([{ fileName: 'photo.png', width: 40, imgUrl: downloadUrl, hash: sha }])
    expect(ctx.request).toHaveBeenCalledTimes(2)
    expect(ctx.emit).not.toHaveBeenCalled()
  })

  it.each([
    { source: 'buffer', data: { buffer: Buffer.from('different-image') } },
    { source: 'base64', data: { base64Image: Buffer.from('different-image').toString('base64') } },
    {
      source: 'base64 preferred over an identical buffer',
      data: { base64Image: Buffer.from('different-image').toString('base64'), buffer: Buffer.from('photo') },
    },
  ])('rejects different content from $source and preserves pending images', async ({ data }) => {
    const first: IImgInfo = { fileName: 'photo.png', width: 40, ...data }
    const second: IImgInfo = { fileName: 'second.png', buffer: Buffer.from('second') }
    const pending = [{ ...first }, { ...second }]
    const { ctx, upload } = githubUploader(config, [first, second])
    const conflict = Object.assign(new Error('Validation failed'), { statusCode: 422 })
    ctx.request
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ type: 'file', download_url: downloadUrl, sha: photoSha })
      .mockResolvedValueOnce({ content: { download_url: downloadUrl, sha: 'second-sha' } })

    await expect(upload()).rejects.toMatchObject({
      message: 'Upload failed because a different image already exists at this path',
      cause: conflict,
    })

    expect(ctx.request).toHaveBeenCalledTimes(2)
    expect(ctx.output).toEqual(pending)
    expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
      title: 'UPLOAD_FAILED',
      body: 'CHECK_SETTINGS_AND_NETWORK',
    })
  })

  it('encodes the branch when verifying existing content', async () => {
    const { ctx, upload } = githubUploader({ ...config, branch: 'images/release&preview#1' }, [
      { fileName: 'photo.png', base64Image: 'cGhvdG8=' },
    ])
    ctx.request
      .mockRejectedValueOnce({ statusCode: 422 })
      .mockResolvedValueOnce({ type: 'file', download_url: downloadUrl, sha: photoSha })

    await upload()

    expect(ctx.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://api.github.com/repos/owner/images/contents/uploads/photo.png?ref=images%2Frelease%26preview%231',
      }),
    )
  })

  it('reports a failed duplicate lookup with the original upload error as its cause', async () => {
    const { ctx, upload } = githubUploader()
    const conflict = Object.assign(new Error('Already exists'), { statusCode: 422 })
    ctx.request.mockRejectedValueOnce(conflict).mockResolvedValueOnce({})

    await expect(upload()).rejects.toMatchObject({
      message: 'Upload failed and the image does not exist in the repo',
      cause: conflict,
    })

    expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
      title: 'UPLOAD_FAILED',
      body: 'CHECK_SETTINGS_AND_NETWORK',
    })
    expect(ctx.output[0].imgUrl).toBeUndefined()
    expect(ctx.output[0].buffer).toEqual(Buffer.from('synthetic-image'))
  })

  it.each([
    { response: 'null', value: null },
    { response: 'undefined', value: undefined },
    { response: 'directory listing', value: [{ type: 'file', download_url: downloadUrl, sha: photoSha }] },
    { response: 'directory object', value: { type: 'dir', download_url: downloadUrl, sha: photoSha } },
    { response: 'missing file type', value: { download_url: downloadUrl, sha: photoSha } },
    { response: 'missing hash', value: { type: 'file', download_url: downloadUrl } },
    { response: 'missing download URL', value: { type: 'file', sha: photoSha } },
    { response: 'null download URL', value: { type: 'file', download_url: null, sha: photoSha } },
  ])('rejects a $response lookup without discarding the image', async ({ value }) => {
    const image: IImgInfo = { fileName: 'photo.png', base64Image: 'cGhvdG8=', buffer: Buffer.from('photo') }
    const pending = { ...image }
    const { ctx, upload } = githubUploader(config, [image])
    const conflict = Object.assign(new Error('Validation failed'), { statusCode: 422 })
    ctx.request.mockRejectedValueOnce(conflict).mockResolvedValueOnce(value)

    await expect(upload()).rejects.toMatchObject({ cause: conflict })

    expect(ctx.request).toHaveBeenCalledTimes(2)
    expect(ctx.output).toEqual([pending])
    expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
      title: 'UPLOAD_FAILED',
      body: 'CHECK_SETTINGS_AND_NETWORK',
    })
  })

  it.each(['network', 'not found'])('preserves the image when the lookup fails: %s', async failureType => {
    const image: IImgInfo = { fileName: 'photo.png', base64Image: 'cGhvdG8=', buffer: Buffer.from('photo') }
    const pending = { ...image }
    const { ctx, upload } = githubUploader(config, [image])
    const lookupError =
      failureType === 'network'
        ? new Error('Connection failed')
        : Object.assign(new Error('Not found'), { statusCode: 404 })
    ctx.request.mockRejectedValueOnce({ statusCode: 422 }).mockRejectedValueOnce(lookupError)

    await expect(upload()).rejects.toBe(lookupError)

    expect(ctx.request).toHaveBeenCalledTimes(2)
    expect(ctx.output).toEqual([pending])
    expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
      title: 'UPLOAD_FAILED',
      body: 'CHECK_SETTINGS_AND_NETWORK',
    })
  })

  it.each(['network', 'empty response'])(
    'reports %s failures without discarding pending images or retrying',
    async failureType => {
      const first: IImgInfo = { fileName: 'first.png', base64Image: 'cGhvdG8=' }
      const second: IImgInfo = { fileName: 'second.png', buffer: Buffer.from('second') }
      const { ctx, upload } = githubUploader(config, [first, second])
      if (failureType === 'network') ctx.request.mockRejectedValueOnce(new Error('Connection failed'))
      else ctx.request.mockResolvedValueOnce(null)

      await expect(upload()).rejects.toThrow(
        failureType === 'network' ? 'Connection failed' : 'Server error, please try again',
      )

      expect(ctx.request).toHaveBeenCalledTimes(1)
      expect(first).toEqual({ fileName: 'first.png', base64Image: 'cGhvdG8=' })
      expect(second).toEqual({ fileName: 'second.png', buffer: Buffer.from('second') })
      expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
        title: 'UPLOAD_FAILED',
        body: 'CHECK_SETTINGS_AND_NETWORK',
      })
    },
  )

  it('skips entries without a filename or image data while uploading subsequent valid images', async () => {
    const skipped = [{ buffer: Buffer.from('no-name') }, { fileName: 'empty.png' }]
    const { ctx, upload } = githubUploader(config, [...skipped, { fileName: 'valid.png', base64Image: 'cGhvdG8=' }])
    ctx.request.mockResolvedValueOnce({ content: { download_url: downloadUrl, sha: 'image-sha' } })

    await upload()

    expect(ctx.request).toHaveBeenCalledTimes(1)
    expect(ctx.output.slice(0, 2)).toEqual(skipped)
    expect(ctx.output[2].imgUrl).toBe(downloadUrl)
  })

  it.each([
    [undefined, 'Can not find picBed.github config!'],
    [{ repo: config.repo }, 'Missing required config option: token'],
    [{ ...config, token: '   ' }, 'Missing required config option: token'],
  ])('rejects invalid configuration before making requests: %j', async (options, message) => {
    const { ctx, upload } = createUploader(registerGithubUploader, 'picBed.github', options)

    await expect(upload()).rejects.toThrow(message)

    expect(ctx.request).not.toHaveBeenCalled()
  })
})
