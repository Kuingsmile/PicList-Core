import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
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

/** Resolves the cache location exposed by a gallery URL. */
const galleryFilePath = (baseDir: string, galleryPath: string): string =>
  path.join(baseDir, 'imgTemp', decodeURIComponent(new URL(galleryPath).pathname).slice(1))

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
    vi.restoreAllMocks()
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
        galleryPath: expect.stringMatching(
          /^http:\/\/localhost:36699\/webdavplist\/[a-f\d]{64}\/nested\/photo%20%231.png$/,
        ),
      },
    ])
    expect(readFileSync(galleryFilePath(baseDir, ctx.output[0].galleryPath!))).toEqual(buffer)
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
    expect(readFileSync(galleryFilePath(baseDir, ctx.output[0].galleryPath!), 'utf8')).toBe('base64-content')
  })

  it.each([
    { host: 'https://other.example.invalid' },
    { host: 'https://dav.example.invalid:8443' },
    { host: 'https://dav.example.invalid/dav' },
    { sslEnabled: false },
    { username: 'another-user' },
    { path: '/second' },
  ])('isolates previews when the destination changes by %j, including deletion and reupload', async change => {
    const firstConfig = { ...config, path: '/first' }
    const first = createUploader(registerWebdavUploader, 'picBed.webdavplist', firstConfig, [
      { fileName: 'same.png', buffer: Buffer.from('first-image') },
    ])
    const second = createUploader(registerWebdavUploader, 'picBed.webdavplist', { ...firstConfig, ...change }, [
      { fileName: 'same.png', buffer: Buffer.from('second-image') },
    ])
    first.ctx.baseDir = baseDir
    second.ctx.baseDir = baseDir

    await first.upload()
    await second.upload()

    const firstGallery = first.ctx.output[0].galleryPath!
    const secondGallery = second.ctx.output[0].galleryPath!
    expect(firstGallery).not.toBe(secondGallery)
    expect(readFileSync(galleryFilePath(baseDir, firstGallery), 'utf8')).toBe('first-image')
    expect(readFileSync(galleryFilePath(baseDir, secondGallery), 'utf8')).toBe('second-image')

    rmSync(galleryFilePath(baseDir, firstGallery))
    expect(readFileSync(galleryFilePath(baseDir, secondGallery), 'utf8')).toBe('second-image')

    first.ctx.output = [{ fileName: 'same.png', buffer: Buffer.from('replacement-image') }]
    await first.upload()

    expect(first.ctx.output[0].galleryPath).toBe(firstGallery)
    expect(readFileSync(galleryFilePath(baseDir, firstGallery), 'utf8')).toBe('replacement-image')
    expect(readFileSync(galleryFilePath(baseDir, secondGallery), 'utf8')).toBe('second-image')
  })

  it('reuses the cache for the same normalized destination after password and public URL changes', async () => {
    const first = createUploader(registerWebdavUploader, 'picBed.webdavplist', config)
    const second = createUploader(
      registerWebdavUploader,
      'picBed.webdavplist',
      {
        ...config,
        host: 'dav.example.invalid',
        path: 'uploads',
        password: 'replacement-synthetic-password',
        authType: 'digest',
        customUrl: 'https://cdn.example.invalid',
        webpath: '/public',
        options: '?download=1',
      },
      [{ fileName: 'photo.png', buffer: Buffer.from('replacement-image') }],
    )
    first.ctx.baseDir = baseDir
    second.ctx.baseDir = baseDir

    await first.upload()
    await second.upload()

    expect(first.ctx.output[0].galleryPath).toBe(second.ctx.output[0].galleryPath)
    expect(readFileSync(galleryFilePath(baseDir, first.ctx.output[0].galleryPath!), 'utf8')).toBe('replacement-image')
    expect(second.ctx.output[0].imgUrl).toBe('https://cdn.example.invalid/public/photo.png?download=1')
  })

  it('preserves existing gallery files at legacy URLs', async () => {
    const legacyGallery = 'http://localhost:36699/webdavplist/photo.png'
    const legacyFile = galleryFilePath(baseDir, legacyGallery)
    mkdirSync(path.dirname(legacyFile), { recursive: true })
    writeFileSync(legacyFile, 'legacy-image')
    const { ctx, upload } = createUploader(registerWebdavUploader, 'picBed.webdavplist', config)
    ctx.baseDir = baseDir

    await upload()

    expect(ctx.output[0].galleryPath).not.toBe(legacyGallery)
    expect(readFileSync(legacyFile, 'utf8')).toBe('legacy-image')
    expect(readFileSync(galleryFilePath(baseDir, ctx.output[0].galleryPath!), 'utf8')).toBe('synthetic-image')
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

  it.each(['directory', 'write'])(
    'preserves public URLs and continues the batch when gallery %s fails',
    async stage => {
      if (stage === 'directory') {
        writeFileSync(path.join(baseDir, 'imgTemp'), 'blocks gallery directory creation')
      } else {
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
          throw Object.assign(new Error('Gallery write denied'), { code: 'EACCES' })
        })
      }
      const { ctx, upload } = createUploader(
        registerWebdavUploader,
        'picBed.webdavplist',
        { ...config, customUrl: 'https://cdn.example.invalid', webpath: '/public/', options: '?download=1' },
        [
          {
            fileName: 'first #1.png',
            buffer: Buffer.from('first-image'),
            galleryPath: 'http://localhost:36699/webdavplist/stale.png',
          },
          { fileName: 'nested/second.png', base64Image: Buffer.from('second-image').toString('base64') },
        ],
      )
      ctx.baseDir = baseDir

      await expect(upload()).resolves.toBe(ctx)

      expect(client.putFileContents).toHaveBeenCalledTimes(2)
      expect(client.putFileContents).toHaveBeenNthCalledWith(1, 'uploads/first #1.png', Buffer.from('first-image'), {
        overwrite: true,
      })
      expect(client.putFileContents).toHaveBeenNthCalledWith(
        2,
        'uploads/nested/second.png',
        Buffer.from('second-image'),
        {
          overwrite: true,
        },
      )
      expect(ctx.output).toEqual([
        { fileName: 'first #1.png', imgUrl: 'https://cdn.example.invalid/public/first%20%231.png?download=1' },
        { fileName: 'nested/second.png', imgUrl: 'https://cdn.example.invalid/public/nested/second.png?download=1' },
      ])
      expect(ctx.log.warn).toHaveBeenCalledTimes(2)
      expect(ctx.log.warn).toHaveBeenCalledWith('WebDAV upload succeeded, but the gallery cache could not be updated.')
      expect(ctx.emit).not.toHaveBeenCalled()
    },
  )

  it.each(['client', 'directory', 'transfer', 'false result'])(
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
      const image = { fileName: 'photo.png', buffer: Buffer.from('synthetic-image') }
      const { ctx, upload } = createUploader(registerWebdavUploader, 'picBed.webdavplist', config, [{ ...image }])
      ctx.baseDir = baseDir

      await expect(upload()).rejects.toThrow(stage === 'false result' ? 'Upload failed' : failure.message)

      expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
        title: 'UPLOAD_FAILED',
        body: 'CHECK_SETTINGS',
      })
      expect(ctx.output).toEqual([image])
      expect(ctx.log.warn).not.toHaveBeenCalled()
      expect(existsSync(path.join(baseDir, 'imgTemp', 'webdavplist'))).toBe(false)
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
