import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { ensureDirSync } from 'fs-extra/esm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import registerLocalUploader from '../../../src/plugins/uploader/local'
import { renameFileNameWithCustomString } from '../../../src/utils/common/rename'
import { IBuildInEvent } from '../../../src/utils/enum'
import { createUploader } from '../../helpers/uploader'

vi.mock('fs-extra/esm', async importOriginal => {
  const actual = await importOriginal<typeof import('fs-extra/esm')>()
  return { ...actual, ensureDirSync: vi.fn(actual.ensureDirSync) }
})

/** Resolves a gallery URL to the file served from the image cache. */
const getGalleryCachePath = (baseDir: string, galleryPath: string): string =>
  path.join(baseDir, 'imgTemp', decodeURIComponent(new URL(galleryPath).pathname).replace(/^\//, ''))

describe('Local uploader', () => {
  let baseDir: string
  const tempPrefix = path.join(os.tmpdir(), 'piclist-local-test-')

  beforeEach(async () => {
    vi.mocked(ensureDirSync).mockReset().mockImplementation(fs.ensureDirSync)
    baseDir = await fs.mkdtemp(tempPrefix)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (!path.resolve(baseDir).startsWith(path.resolve(tempPrefix))) throw new Error('Unexpected test directory')
    await fs.remove(baseDir)
  })

  it('uploads to an existing directory even when mkdir on it would fail, and creates the gallery directory', async () => {
    const uploadPath = path.join(baseDir, 'destination')
    await fs.ensureDir(uploadPath)
    // Windows mkdir with recursive:true fails with EPERM for an existing drive root.
    vi.mocked(ensureDirSync).mockImplementation(directory => {
      if (directory === uploadPath) throw Object.assign(new Error('Cannot mkdir drive root'), { code: 'EPERM' })
      return fs.ensureDirSync(directory)
    })
    const buffer = Buffer.from('synthetic-image')
    const fileName = 'photo.png'
    const { ctx, upload } = createUploader(registerLocalUploader, 'picBed.local', { path: uploadPath }, [
      { fileName, buffer },
    ])
    ctx.baseDir = baseDir

    await expect(upload()).resolves.toBe(ctx)

    const destination = path.join(uploadPath, fileName)
    expect(await fs.readFile(destination)).toEqual(buffer)
    expect(await fs.readFile(getGalleryCachePath(baseDir, ctx.output[0].galleryPath!))).toEqual(buffer)
    expect(ctx.output).toEqual([
      {
        fileName,
        imgUrl: destination,
        hash: destination,
        galleryPath: expect.stringMatching(/^http:\/\/localhost:36699\/local\/[a-f0-9]{64}\/photo\.png$/),
      },
    ])
    expect(ctx.emit).not.toHaveBeenCalled()
  })

  it.each(['photo.png', 'nested/album/photo #1.png'])(
    'keeps separate gallery images for %s uploaded to different destinations',
    async fileName => {
      const firstPath = path.join(baseDir, 'first', 'destination')
      const secondPath = path.join(baseDir, 'second', 'destination')
      const firstBuffer = Buffer.from('first-image')
      const secondBuffer = Buffer.from('second-image')
      const first = createUploader(registerLocalUploader, 'picBed.local', { path: firstPath }, [
        { fileName, buffer: firstBuffer },
      ])
      const second = createUploader(registerLocalUploader, 'picBed.local', { path: secondPath }, [
        { fileName, buffer: secondBuffer },
      ])
      first.ctx.baseDir = baseDir
      second.ctx.baseDir = baseDir

      await first.upload()
      await second.upload()

      const firstGalleryPath = first.ctx.output[0].galleryPath!
      const secondGalleryPath = second.ctx.output[0].galleryPath!
      expect(await fs.readFile(path.join(firstPath, fileName))).toEqual(firstBuffer)
      expect(await fs.readFile(path.join(secondPath, fileName))).toEqual(secondBuffer)
      expect(secondGalleryPath).not.toBe(firstGalleryPath)
      expect(await fs.readFile(getGalleryCachePath(baseDir, firstGalleryPath))).toEqual(firstBuffer)
      expect(await fs.readFile(getGalleryCachePath(baseDir, secondGalleryPath))).toEqual(secondBuffer)

      const replacement = Buffer.from('replacement-image')
      first.ctx.output = [{ fileName, buffer: replacement }]
      await first.upload()

      expect(first.ctx.output[0].galleryPath).toBe(firstGalleryPath)
      expect(await fs.readFile(getGalleryCachePath(baseDir, firstGalleryPath))).toEqual(replacement)
      expect(await fs.readFile(getGalleryCachePath(baseDir, secondGalleryPath))).toEqual(secondBuffer)
    },
  )

  it.each([
    ['nested/album/photo #1.png', 'https://cdn.example.invalid/'],
    ['nested\\album\\photo #1.png', 'https://cdn.example.invalid/'],
    ['nested\\album/photo #1.png', 'https://cdn.example.invalid/'],
    ['nested/album/photo #1.png', ''],
    ['nested\\album\\photo #1.png', ''],
    ['nested\\album/photo #1.png', ''],
  ])('uploads %s with URL prefix "%s" using consistent directory separators', async (fileName, customUrl) => {
    const uploadPath = path.join(baseDir, 'destination')
    const buffer = Buffer.from('synthetic-image')
    const relativePath = 'nested/album/photo #1.png'
    const destination = path.join(uploadPath, relativePath)
    const { ctx, upload } = createUploader(
      registerLocalUploader,
      'picBed.local',
      { path: uploadPath, customUrl, webPath: 'public' },
      [{ fileName, base64Image: buffer.toString('base64') }],
    )
    ctx.baseDir = baseDir

    await upload()

    expect(await fs.readFile(destination)).toEqual(buffer)
    expect(await fs.readFile(getGalleryCachePath(baseDir, ctx.output[0].galleryPath!))).toEqual(buffer)
    expect(ctx.output[0]).toEqual({
      fileName,
      imgUrl: customUrl ? 'https://cdn.example.invalid/public/nested/album/photo%20%231.png' : destination,
      hash: destination,
      galleryPath: expect.stringMatching(
        /^http:\/\/localhost:36699\/local\/[a-f0-9]{64}\/nested\/album\/photo%20%231\.png$/,
      ),
    })
  })

  it.each(['destination', 'gallery'] as const)('reports %s directory errors before writing the image', async stage => {
    const uploadPath = path.join(baseDir, 'destination')
    const failure = Object.assign(new Error(`${stage} directory creation denied`), { code: 'EACCES' })
    const blockedDirectory = stage === 'destination' ? uploadPath : path.join(baseDir, 'imgTemp', 'local')
    vi.mocked(ensureDirSync).mockImplementation(directory => {
      if (directory === blockedDirectory || directory.startsWith(`${blockedDirectory}${path.sep}`)) throw failure
      return fs.ensureDirSync(directory)
    })
    const image = { fileName: 'photo.png', buffer: Buffer.from('synthetic-image') }
    const { ctx, upload } = createUploader(registerLocalUploader, 'picBed.local', { path: uploadPath }, [{ ...image }])
    ctx.baseDir = baseDir
    const write = vi.spyOn(fs, 'writeFileSync')

    await expect(upload()).rejects.toMatchObject({ cause: failure })

    expect(write).not.toHaveBeenCalled()
    expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
      title: 'UPLOAD_FAILED',
      body: 'failed to upload image',
    })
    expect(ctx.output).toEqual([image])
  })

  it('rejects a traversal rename without overwriting files outside either directory', async () => {
    const uploadPath = path.join(baseDir, 'destination')
    const outsideDestination = path.join(baseDir, 'photo.png')
    const outsideGallery = path.join(baseDir, 'imgTemp', 'photo.png')
    const original = Buffer.from('existing-image')
    await fs.outputFile(outsideDestination, original)
    await fs.outputFile(outsideGallery, original)
    const image = {
      fileName: renameFileNameWithCustomString('photo.png', '../{filename}'),
      buffer: Buffer.from('synthetic-image'),
    }
    const { ctx, upload } = createUploader(registerLocalUploader, 'picBed.local', { path: uploadPath }, [{ ...image }])
    ctx.baseDir = baseDir

    await expect(upload()).rejects.toThrow('within the configured directory')

    expect(await fs.readFile(outsideDestination)).toEqual(original)
    expect(await fs.readFile(outsideGallery)).toEqual(original)
    expect(ensureDirSync).not.toHaveBeenCalled()
    expect(ctx.output).toEqual([image])
    expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
      title: 'UPLOAD_FAILED',
      body: 'failed to upload image',
    })
  })

  it.each([
    '..\\photo.png',
    'nested/../../photo.png',
    'nested\\../../photo.png',
    '../destination-other/photo.png',
    '../local-other/photo.png',
    '../destination/photo.png',
    '../local/photo.png',
    '/photo.png',
    '\\photo.png',
    'C:/outside/photo.png',
    'C:\\outside\\photo.png',
    'C:photo.png',
    '//server/share/photo.png',
    '\\\\server\\share\\photo.png',
    '.',
    '..',
    'nested/..',
  ])('rejects filename "%s" before any filesystem mutation', async fileName => {
    const uploadPath = path.join(baseDir, 'destination')
    const image = { fileName, buffer: Buffer.from('synthetic-image') }
    const { ctx, upload } = createUploader(registerLocalUploader, 'picBed.local', { path: uploadPath }, [{ ...image }])
    ctx.baseDir = baseDir
    vi.mocked(ensureDirSync).mockImplementation(() => undefined)
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined)
    const copy = vi.spyOn(fs, 'copyFileSync').mockImplementation(() => undefined)

    await expect(upload()).rejects.toThrow('within the configured directory')

    expect(ensureDirSync).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(copy).not.toHaveBeenCalled()
    expect(ctx.output).toEqual([image])
  })

  it('checks gallery containment even when traversal stays within the destination root', async () => {
    const uploadPath = path.parse(baseDir).root
    const image = { fileName: '../photo.png', buffer: Buffer.from('synthetic-image') }
    const { ctx, upload } = createUploader(registerLocalUploader, 'picBed.local', { path: uploadPath }, [{ ...image }])
    ctx.baseDir = baseDir
    vi.mocked(ensureDirSync).mockImplementation(() => undefined)
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined)
    const copy = vi.spyOn(fs, 'copyFileSync').mockImplementation(() => undefined)

    await expect(upload()).rejects.toThrow('within the configured directory')

    expect(ensureDirSync).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(copy).not.toHaveBeenCalled()
    expect(ctx.output).toEqual([image])
  })
})
