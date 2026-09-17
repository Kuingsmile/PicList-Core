import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthType, createClient } from 'webdav'

import registerWebdavUploader from '../../../src/plugins/uploader/webdav'
import { IBuildInEvent } from '../../../src/utils/enum'
import { createUploader } from '../../helpers/uploader'

const client = vi.hoisted(() => ({ createDirectory: vi.fn(), putFileContents: vi.fn() }))

vi.mock('webdav', async importOriginal => ({
  ...(await importOriginal<typeof import('webdav')>()),
  createClient: vi.fn(() => client),
}))

const config = {
  host: 'http://dav.example.invalid///',
  sslEnabled: true,
  username: 'test-user',
  password: 'synthetic-password',
  path: '/uploads//',
}

describe('WebDAV uploader', () => {
  let baseDir: string
  const tempPrefix = path.join(os.tmpdir(), 'piclist-webdav-test-')

  beforeEach(() => {
    vi.resetAllMocks()
    client.createDirectory.mockResolvedValue(undefined)
    client.putFileContents.mockResolvedValue(true)
    baseDir = mkdtempSync(tempPrefix)
  })

  afterEach(() => {
    if (!path.resolve(baseDir).startsWith(path.resolve(tempPrefix))) throw new Error('Unexpected test directory')
    rmSync(baseDir, { recursive: true, force: true })
  })

  it('uploads nested paths, normalizes the host, and saves a gallery copy', async () => {
    const buffer = Buffer.from('synthetic-image')
    const fileName = 'nested/photo #1.png'
    const { ctx, upload } = createUploader(registerWebdavUploader, 'picBed.webdavplist', config, [{ fileName, buffer }])
    ctx.baseDir = baseDir

    await expect(upload()).resolves.toBe(ctx)

    expect(createClient).toHaveBeenCalledExactlyOnceWith('https://dav.example.invalid', {
      username: 'test-user',
      password: 'synthetic-password',
      maxBodyLength: 4 * 1024 ** 3,
      maxContentLength: 4 * 1024 ** 3,
    })
    expect(client.createDirectory).toHaveBeenCalledExactlyOnceWith('uploads/nested', { recursive: true })
    expect(client.putFileContents).toHaveBeenCalledExactlyOnceWith('uploads/nested/photo #1.png', buffer, {
      overwrite: true,
    })
    expect(ctx.output).toEqual([
      {
        fileName,
        imgUrl: 'https://dav.example.invalid/uploads/nested/photo%20%231.png',
        galleryPath: 'http://localhost:36699/webdavplist/nested%2Fphoto%20%231.png',
      },
    ])
    expect(readFileSync(path.join(baseDir, 'imgTemp', 'webdavplist', fileName))).toEqual(buffer)
    expect(ctx.emit).not.toHaveBeenCalled()
  })

  it('supports digest authentication, HTTP, and root uploads from base64 without creating the remote root', async () => {
    const { ctx, upload } = createUploader(
      registerWebdavUploader,
      'picBed.webdavplist',
      {
        ...config,
        host: 'https://dav.example.invalid/',
        sslEnabled: false,
        path: '/',
        authType: 'digest',
      },
      [{ fileName: 'photo.png', base64Image: Buffer.from('base64-content').toString('base64') }],
    )
    ctx.baseDir = baseDir

    await upload()

    expect(createClient).toHaveBeenCalledWith(
      'http://dav.example.invalid',
      expect.objectContaining({ authType: AuthType.Digest }),
    )
    expect(client.createDirectory).not.toHaveBeenCalled()
    expect(client.putFileContents).toHaveBeenCalledExactlyOnceWith('photo.png', Buffer.from('base64-content'), {
      overwrite: true,
    })
    expect(ctx.output[0].imgUrl).toBe('http://dav.example.invalid/photo.png')
    expect(ctx.output[0]).not.toHaveProperty('base64Image')
    expect(readFileSync(path.join(baseDir, 'imgTemp', 'webdavplist', 'photo.png'), 'utf8')).toBe('base64-content')
  })

  it.each([
    {
      customUrl: 'https://cdn.example.invalid',
      webpath: '',
      options: '?download=1',
      expected: 'https://cdn.example.invalid/uploads/photo%20%231.png?download=1',
    },
    {
      customUrl: 'https://cdn.example.invalid',
      webpath: '/public//',
      options: '',
      expected: 'https://cdn.example.invalid/public/photo%20%231.png',
    },
    { customUrl: '', webpath: '/', options: '', expected: 'https://dav.example.invalid/photo%20%231.png' },
  ])('builds the public URL with webpath=$webpath and customUrl=$customUrl', async ({ expected, ...options }) => {
    const { ctx, upload } = createUploader(registerWebdavUploader, 'picBed.webdavplist', { ...config, ...options }, [
      { fileName: 'photo #1.png', buffer: Buffer.from('synthetic-image') },
    ])
    ctx.baseDir = baseDir

    await upload()

    expect(ctx.output[0].imgUrl).toBe(expected)
    expect(client.putFileContents).toHaveBeenCalledWith('uploads/photo #1.png', expect.any(Buffer), { overwrite: true })
  })

  it.each(['client', 'directory', 'transfer', 'false result', 'gallery'])(
    'reports a %s failure and preserves image data',
    async stage => {
      const failure = new Error(`${stage} failed`)
      if (stage === 'client')
        vi.mocked(createClient).mockImplementationOnce(() => {
          throw failure
        })
      if (stage === 'directory') client.createDirectory.mockRejectedValueOnce(failure)
      if (stage === 'transfer') client.putFileContents.mockRejectedValueOnce(failure)
      if (stage === 'false result') client.putFileContents.mockResolvedValueOnce(false)
      if (stage === 'gallery') writeFileSync(path.join(baseDir, 'imgTemp'), 'blocks gallery directory creation')
      const image = { fileName: 'photo.png', buffer: Buffer.from('synthetic-image') }
      const { ctx, upload } = createUploader(registerWebdavUploader, 'picBed.webdavplist', config, [{ ...image }])
      ctx.baseDir = baseDir

      await expect(upload()).rejects.toThrow(
        stage === 'gallery' ? undefined : stage === 'false result' ? 'Upload failed' : failure.message,
      )

      expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
        title: 'UPLOAD_FAILED',
        body: 'CHECK_SETTINGS',
      })
      expect(ctx.output).toEqual([image])
      expect(existsSync(path.join(baseDir, 'imgTemp', 'webdavplist', 'photo.png'))).toBe(false)
      if (stage === 'client' || stage === 'directory') expect(client.putFileContents).not.toHaveBeenCalled()
    },
  )

  it('skips incomplete images without transferring or caching them', async () => {
    const output = [{ buffer: Buffer.from('no-name') }, { fileName: 'empty.png' }]
    const { ctx, upload } = createUploader(registerWebdavUploader, 'picBed.webdavplist', config, output)
    ctx.baseDir = baseDir

    await expect(upload()).resolves.toBe(ctx)

    expect(client.createDirectory).not.toHaveBeenCalled()
    expect(client.putFileContents).not.toHaveBeenCalled()
    expect(existsSync(path.join(baseDir, 'imgTemp'))).toBe(false)
    expect(ctx.output).toEqual(output)
  })

  it('rejects missing configuration before creating a client', async () => {
    const { upload } = createUploader(registerWebdavUploader, 'picBed.webdavplist', undefined)

    await expect(upload()).rejects.toThrow('Can not find picBed.webdavplist config!')

    expect(createClient).not.toHaveBeenCalled()
  })

  it('provides defaults and localized configuration labels', () => {
    const { plugin, getFields } = createUploader(registerWebdavUploader, 'picBed.webdavplist', undefined)
    const fields = getFields()

    expect(plugin.name).toBe('PICBED_WEBDAVPLIST')
    expect(Object.fromEntries(fields.map(field => [field.name, field.default]))).toEqual({
      host: '',
      sslEnabled: false,
      username: '',
      password: '',
      path: '',
      webpath: '',
      customUrl: '',
      authType: 'basic',
      options: '',
    })
    expect(fields.find(field => field.name === 'authType')).toMatchObject({
      type: 'list',
      choices: ['basic', 'digest'],
    })
    expect(fields.find(field => field.name === 'sslEnabled')?.type).toBe('confirm')
    expect(fields.filter(field => field.required).map(field => field.name)).toEqual(['host', 'username', 'password'])
    expect(fields.map(field => field.message).filter(Boolean)).toEqual([
      'PICBED_WEBDAVPLIST_MESSAGE_SSLENABLED',
      'PICBED_WEBDAVPLIST_MESSAGE_USERNAME',
      'PICBED_WEBDAVPLIST_MESSAGE_PASSWORD',
      'PICBED_WEBDAVPLIST_MESSAGE_PATH',
      'PICBED_WEBDAVPLIST_MESSAGE_WEBSITE_PATH',
      'PICBED_WEBDAVPLIST_MESSAGE_CUSTOMURL',
      'PICBED_WEBDAVPLIST_MESSAGE_OPTIONS',
    ])
  })

  it('restores saved values in the configuration form', () => {
    const saved = {
      ...config,
      webpath: '/public/',
      customUrl: 'https://cdn.example.invalid',
      authType: 'digest',
      options: '?download=1',
    }
    const { getFields } = createUploader(registerWebdavUploader, 'picBed.webdavplist', saved)

    expect(Object.fromEntries(getFields().map(field => [field.name, field.default]))).toEqual(saved)
  })
})
