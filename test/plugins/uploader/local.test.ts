import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { ensureDirSync } from 'fs-extra/esm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import registerLocalUploader from '../../../src/plugins/uploader/local'
import { IBuildInEvent } from '../../../src/utils/enum'
import { createUploader } from '../../helpers/uploader'

vi.mock('fs-extra/esm', async importOriginal => {
  const actual = await importOriginal<typeof import('fs-extra/esm')>()
  return { ...actual, ensureDirSync: vi.fn(actual.ensureDirSync) }
})

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
    expect(await fs.readFile(path.join(baseDir, 'imgTemp', 'local', fileName))).toEqual(buffer)
    expect(ctx.output).toEqual([
      { fileName, imgUrl: destination, hash: destination, galleryPath: 'http://localhost:36699/local/photo.png' },
    ])
    expect(ctx.emit).not.toHaveBeenCalled()
  })

  it('creates missing nested directories and preserves custom URLs for base64 images', async () => {
    const uploadPath = path.join(baseDir, 'destination')
    const buffer = Buffer.from('synthetic-image')
    const fileName = 'nested/photo #1.png'
    const { ctx, upload } = createUploader(
      registerLocalUploader,
      'picBed.local',
      { path: uploadPath, customUrl: 'https://cdn.example.invalid/', webPath: 'public' },
      [{ fileName, base64Image: buffer.toString('base64') }],
    )
    ctx.baseDir = baseDir

    await upload()

    expect(await fs.readFile(path.join(uploadPath, fileName))).toEqual(buffer)
    expect(await fs.readFile(path.join(baseDir, 'imgTemp', 'local', fileName))).toEqual(buffer)
    expect(ctx.output[0]).toEqual({
      fileName,
      imgUrl: 'https://cdn.example.invalid/public/nested/photo%20%231.png',
      hash: path.join(uploadPath, fileName),
      galleryPath: 'http://localhost:36699/local/nested/photo%20%231.png',
    })
  })

  it.each(['destination', 'gallery'] as const)('reports %s directory errors before writing the image', async stage => {
    const uploadPath = path.join(baseDir, 'destination')
    const failure = Object.assign(new Error(`${stage} directory creation denied`), { code: 'EACCES' })
    const blockedDirectory = stage === 'destination' ? uploadPath : path.join(baseDir, 'imgTemp', 'local')
    vi.mocked(ensureDirSync).mockImplementation(directory => {
      if (directory === blockedDirectory) throw failure
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
})
