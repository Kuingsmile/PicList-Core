import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import registerSftpUploader from '../../../src/plugins/uploader/sftp'
import type { IImgInfo, IPicGo, ISftpPlistConfig } from '../../../src/types'
import { IBuildInEvent } from '../../../src/utils/enum'

/** Resolves the cache location exposed by a gallery URL. */
const galleryFilePath = (baseDir: string, galleryPath: string): string =>
  path.join(baseDir, 'imgTemp', decodeURIComponent(new URL(galleryPath).pathname).slice(1))

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename) }
})

const ssh = vi.hoisted(() => ({
  connect: vi.fn(),
  putFile: vi.fn(),
  execCommand: vi.fn(),
  dispose: vi.fn(),
  rename: vi.fn(),
}))

vi.mock('node-ssh-no-cpu-features', () => ({
  NodeSSH: class {
    host = ''
    connected = false

    async connect(config: ISftpPlistConfig) {
      this.host = config.host
      this.connected = true
      await ssh.connect(this, config)
    }

    isConnected() {
      return this.connected
    }

    async putFile(local: string, remote: string) {
      await ssh.putFile(this, local, remote)
    }

    async execCommand(script: string) {
      return ssh.execCommand(this, script)
    }

    async requestSFTP() {
      return {
        open: (_path: string, _flags: string, callback: (error: Error | null, handle: Buffer) => void) =>
          callback(null, Buffer.from('handle')),
        close: (_handle: Buffer, callback: (error: Error | null) => void) => callback(null),
        unlink: (_path: string, callback: (error: Error | null) => void) => callback(null),
        ext_openssh_rename: (source: string, destination: string, callback: (error: Error | null) => void) => {
          ssh.rename(this, source, destination)
          callback(null)
        },
      }
    }

    dispose() {
      this.connected = false
      ssh.dispose(this)
    }
  },
}))

/**
 * Binds the SFTP handler to fixture settings and image records while preserving filesystem staging
 * behavior.
 */
function createUploader(baseDir: string, config: ISftpPlistConfig, output: IImgInfo[]) {
  let handle!: (ctx: IPicGo) => Promise<IPicGo>
  const ctx = {
    baseDir,
    output,
    getConfig: () => config,
    emit: vi.fn(),
    log: { warn: vi.fn() },
    i18n: { t: (key: string) => key, translate: (key: string) => key },
    helper: {
      uploader: {
        register: (_name: string, plugin: { handle: typeof handle }) => {
          handle = plugin.handle
        },
      },
    },
  }
  registerSftpUploader(ctx as unknown as IPicGo)
  return { ctx, upload: () => handle(ctx as unknown as IPicGo) }
}

describe('SFTP upload isolation and cleanup', () => {
  let baseDir: string
  const config = { host: 'sftp-a.example.invalid', username: 'test-a', uploadPath: '/images' }

  beforeEach(() => {
    vi.resetAllMocks()
    ssh.execCommand.mockResolvedValue({ code: 0 })
    baseDir = mkdtempSync(path.join(os.tmpdir(), 'piclist-sftp-test-'))
  })

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it.each([
    '../../outside.png',
    '..\\..\\outside.png',
    'nested/../../../outside.png',
    '../sftpplist-other/outside.png',
    '/outside.png',
    '\\outside.png',
    'C:\\outside.png',
    'C:outside.png',
    '\\\\server\\share\\outside.png',
    '.',
    'nested/..',
    'photo\0.png',
  ])('rejects unsafe filename %j before staging or connecting', async fileName => {
    const outsidePath = path.join(baseDir, 'outside.png')
    writeFileSync(outsidePath, 'existing file')
    const uploader = createUploader(baseDir, config, [{ fileName, buffer: Buffer.from('replacement') }])

    await expect(uploader.upload()).rejects.toThrow('within the configured directory')

    expect(ssh.connect).not.toHaveBeenCalled()
    expect(ssh.putFile).not.toHaveBeenCalled()
    expect(existsSync(path.join(baseDir, 'uploadTemp'))).toBe(false)
    expect(readFileSync(outsidePath, 'utf8')).toBe('existing file')
    expect(uploader.ctx.output[0].buffer?.toString()).toBe('replacement')
  })

  it('rejects parent traversal even when the remote upload root is /', async () => {
    const uploader = createUploader(baseDir, { ...config, uploadPath: '/' }, [
      { fileName: '../outside.png', buffer: Buffer.from('replacement') },
    ])

    await expect(uploader.upload()).rejects.toThrow('within the configured directory')
    expect(ssh.putFile).not.toHaveBeenCalled()
  })

  it.each(['photo.png', 'nested/photo.png'])(
    'isolates overlapping uploads of %s to different servers',
    async fileName => {
      const started = Promise.withResolvers<void>()
      const releaseFirst = Promise.withResolvers<void>()
      const releaseSecond = Promise.withResolvers<void>()
      const transfers: { host: string; remote: string; contents: string }[] = []
      let pending = 0
      ssh.putFile.mockImplementation(async (client, local: string, remote: string) => {
        if (++pending === 2) started.resolve()
        await (remote.startsWith('/a/') ? releaseFirst.promise : releaseSecond.promise)
        if (!client.connected) throw new Error('Connection closed during upload')
        transfers.push({ host: client.host, remote, contents: readFileSync(local, 'utf8') })
      })
      ssh.rename.mockImplementation((_client, source, destination) => {
        transfers.find(transfer => transfer.remote === source)!.remote = destination
      })
      const first = createUploader(baseDir, { ...config, uploadPath: '/a' }, [
        { fileName, buffer: Buffer.from('contents-a') },
      ])
      const second = createUploader(baseDir, { host: 'sftp-b.example.invalid', username: 'test-b', uploadPath: '/b' }, [
        { fileName, base64Image: Buffer.from('contents-b').toString('base64') },
      ])

      const firstUpload = first.upload()
      const secondUpload = second.upload()
      const completed = Promise.allSettled([firstUpload, secondUpload])
      await started.promise
      releaseFirst.resolve()
      await firstUpload.catch(() => {})
      // The second transfer must survive the first transfer's move and connection disposal.
      releaseSecond.resolve()
      const results = await completed

      expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled'])
      expect(transfers).toEqual([
        { host: config.host, remote: `/a/${fileName}`, contents: 'contents-a' },
        { host: 'sftp-b.example.invalid', remote: `/b/${fileName}`, contents: 'contents-b' },
      ])
      // Asynchronous staging can start either transfer first; identify each by its destination.
      const [firstClient, firstLocal] = ssh.putFile.mock.calls.find(([client]) => client.host === config.host)!
      const [secondClient, secondLocal] = ssh.putFile.mock.calls.find(
        ([client]) => client.host === 'sftp-b.example.invalid',
      )!
      expect(firstClient).not.toBe(secondClient)
      expect(path.dirname(firstLocal)).not.toBe(path.dirname(secondLocal))
      expect(ssh.dispose.mock.calls).toEqual([[firstClient], [secondClient]])
      expect(readdirSync(path.join(baseDir, 'uploadTemp'))).toEqual([])
      expect(first.ctx.output[0].imgUrl).toBe(`${config.host}/a/${fileName}`)
      expect(second.ctx.output[0].imgUrl).toBe(`sftp-b.example.invalid/b/${fileName}`)
      expect(first.ctx.output[0].buffer).toBeUndefined()
      expect(second.ctx.output[0].base64Image).toBeUndefined()
      const firstGallery = first.ctx.output[0].galleryPath!
      const secondGallery = second.ctx.output[0].galleryPath!
      expect(firstGallery).not.toBe(secondGallery)
      expect(readFileSync(galleryFilePath(baseDir, firstGallery), 'utf8')).toBe('contents-a')
      expect(readFileSync(galleryFilePath(baseDir, secondGallery), 'utf8')).toBe('contents-b')
    },
  )

  it.each(['connect', 'upload', 'chown'])('cleans up when %s fails', async stage => {
    const failure = new Error(`${stage} failed`)
    if (stage === 'connect') ssh.connect.mockRejectedValueOnce(failure)
    if (stage === 'upload') ssh.putFile.mockRejectedValueOnce(failure)
    if (stage === 'chown') {
      ssh.execCommand.mockImplementation(async (_client, script: string) => {
        if (script.startsWith('chown ')) throw failure
        return { code: 0 }
      })
    }
    const uploader = createUploader(baseDir, { ...config, fileUser: 'uploads' }, [
      { fileName: 'photo.png', buffer: Buffer.from('contents') },
    ])

    await expect(uploader.upload()).rejects.toThrow(failure.message)

    expect(ssh.dispose).toHaveBeenCalledTimes(1)
    expect(readdirSync(path.join(baseDir, 'uploadTemp'))).toEqual([])
    expect(uploader.ctx.emit).toHaveBeenCalledWith(IBuildInEvent.NOTIFICATION, {
      title: 'UPLOAD_FAILED',
      body: 'CHECK_SETTINGS',
    })
  })

  it('keeps successful remote uploads when the gallery cache is unavailable', async () => {
    writeFileSync(path.join(baseDir, 'imgTemp'), 'blocks gallery directory creation')
    const uploader = createUploader(baseDir, config, [
      { fileName: 'photo.png', buffer: Buffer.from('contents'), galleryPath: 'old-preview' },
      { fileName: 'next.png', buffer: Buffer.from('next image') },
    ])

    await expect(uploader.upload()).resolves.toBe(uploader.ctx)

    expect(ssh.rename).toHaveBeenCalledTimes(2)
    expect(uploader.ctx.output[0].imgUrl).toBe(`${config.host}/images/photo.png`)
    expect(uploader.ctx.output.every(img => !img.galleryPath && !img.buffer)).toBe(true)
    expect(uploader.ctx.log.warn).toHaveBeenCalledTimes(2)
    expect(uploader.ctx.log.warn).toHaveBeenCalledWith(
      'SFTP upload succeeded, but the gallery cache could not be updated.',
    )
    expect(uploader.ctx.emit).not.toHaveBeenCalled()
    expect(readdirSync(path.join(baseDir, 'uploadTemp'))).toEqual([])
  })

  it('preserves the old cached file when publishing its replacement fails', async () => {
    const uploader = createUploader(baseDir, config, [{ fileName: 'photo.png', buffer: Buffer.from('original') }])
    await uploader.upload()
    const oldGalleryPath = uploader.ctx.output[0].galleryPath!
    uploader.ctx.output = [{ fileName: 'photo.png', buffer: Buffer.from('replacement'), galleryPath: oldGalleryPath }]
    vi.mocked(fsPromises.rename).mockRejectedValueOnce(new Error('gallery rename failed'))

    await expect(uploader.upload()).resolves.toBe(uploader.ctx)

    expect(readFileSync(galleryFilePath(baseDir, oldGalleryPath), 'utf8')).toBe('original')
    expect(uploader.ctx.output[0].galleryPath).toBeUndefined()
    expect(uploader.ctx.output[0].imgUrl).toBe(`${config.host}/images/photo.png`)
    expect(uploader.ctx.emit).not.toHaveBeenCalled()
    expect(uploader.ctx.log.warn).toHaveBeenCalledTimes(1)
    expect(readdirSync(path.join(baseDir, 'uploadTemp'))).toEqual([])
  })

  it('keeps a successful upload when connection disposal fails', async () => {
    ssh.dispose.mockImplementationOnce(() => {
      throw new Error('dispose failed')
    })
    const uploader = createUploader(baseDir, config, [{ fileName: 'photo.png', buffer: Buffer.from('contents') }])

    await expect(uploader.upload()).resolves.toBe(uploader.ctx)

    expect(uploader.ctx.log.warn).toHaveBeenCalledWith('Failed to close the SFTP connection.')
    expect(uploader.ctx.emit).not.toHaveBeenCalled()
    expect(readdirSync(path.join(baseDir, 'uploadTemp'))).toEqual([])
  })

  it.each([{ host: 'other.example.invalid' }, { port: 2222 }, { username: 'another-user' }, { uploadPath: '/other' }])(
    'keeps previews separate for destination change %j',
    async change => {
      const first = createUploader(baseDir, config, [{ fileName: 'photo.png', buffer: Buffer.from('first') }])
      const second = createUploader(baseDir, { ...config, ...change }, [
        { fileName: 'photo.png', buffer: Buffer.from('second') },
      ])
      await first.upload()
      await second.upload()

      expect(first.ctx.output[0].galleryPath).not.toBe(second.ctx.output[0].galleryPath)
      expect(readFileSync(galleryFilePath(baseDir, first.ctx.output[0].galleryPath!), 'utf8')).toBe('first')
      expect(readFileSync(galleryFilePath(baseDir, second.ctx.output[0].galleryPath!), 'utf8')).toBe('second')
    },
  )

  it('reuses the preview for the same destination without depending on credentials', async () => {
    const first = createUploader(baseDir, config, [{ fileName: 'photo.png', buffer: Buffer.from('first') }])
    const second = createUploader(baseDir, { ...config, uploadPath: '/images/./', password: 'fixture-password' }, [
      { fileName: 'photo.png', buffer: Buffer.from('second') },
    ])
    await first.upload()
    await second.upload()

    expect(first.ctx.output[0].galleryPath).toBe(second.ctx.output[0].galleryPath)
    expect(readFileSync(galleryFilePath(baseDir, first.ctx.output[0].galleryPath!), 'utf8')).toBe('second')
  })

  it('cleans temporary files even if disposing the connection fails', async () => {
    ssh.putFile.mockRejectedValueOnce(new Error('upload failed'))
    ssh.dispose.mockImplementationOnce(() => {
      throw new Error('dispose failed')
    })
    const uploader = createUploader(baseDir, config, [{ fileName: 'photo.png', buffer: Buffer.from('contents') }])

    await expect(uploader.upload()).rejects.toThrow()

    expect(ssh.dispose).toHaveBeenCalledTimes(1)
    expect(readdirSync(path.join(baseDir, 'uploadTemp'))).toEqual([])
  })

  it('does not allocate resources for entries without a filename or image data', async () => {
    const uploader = createUploader(baseDir, config, [{ buffer: Buffer.from('contents') }, { fileName: 'photo.png' }])

    await uploader.upload()

    expect(ssh.connect).not.toHaveBeenCalled()
    expect(ssh.dispose).not.toHaveBeenCalled()
    expect(existsSync(path.join(baseDir, 'uploadTemp'))).toBe(false)
  })

  it('reuses a connection and staging directory for a batch while preserving each image', async () => {
    const transfers: { remote: string; contents: string }[] = []
    ssh.putFile.mockImplementation(async (_client, local: string, remote: string) => {
      transfers.push({ remote, contents: readFileSync(local, 'utf8') })
    })
    ssh.rename.mockImplementation((_client, source, destination) => {
      transfers.find(transfer => transfer.remote === source)!.remote = destination
    })
    const uploader = createUploader(baseDir, config, [
      { fileName: 'first.png', buffer: Buffer.from('first image') },
      { fileName: 'skip.png' },
      { fileName: 'second.png', base64Image: Buffer.from('second image').toString('base64') },
    ])

    expect(await uploader.upload()).toBe(uploader.ctx)

    expect(ssh.connect).toHaveBeenCalledTimes(1)
    expect(ssh.dispose).toHaveBeenCalledTimes(1)
    expect(ssh.execCommand.mock.calls.map(([_client, script]) => script)).toEqual(["cd / && mkdir -p -- 'images'"])
    const [firstClient, firstLocal] = ssh.putFile.mock.calls[0]
    const [secondClient, secondLocal] = ssh.putFile.mock.calls[1]
    expect(secondClient).toBe(firstClient)
    expect(path.dirname(secondLocal)).toBe(path.dirname(firstLocal))
    expect(transfers).toEqual([
      { remote: '/images/first.png', contents: 'first image' },
      { remote: '/images/second.png', contents: 'second image' },
    ])
    expect(readFileSync(galleryFilePath(baseDir, uploader.ctx.output[0].galleryPath!), 'utf8')).toBe('first image')
    expect(readFileSync(galleryFilePath(baseDir, uploader.ctx.output[2].galleryPath!), 'utf8')).toBe('second image')
    expect(uploader.ctx.output[0].buffer).toBeUndefined()
    expect(uploader.ctx.output[2].base64Image).toBeUndefined()
    expect(readdirSync(path.join(baseDir, 'uploadTemp'))).toEqual([])
    expect(config.uploadPath).toBe('/images')
    expect(config).not.toHaveProperty('port')
  })

  it('handles duplicate basenames in different directories within one batch', async () => {
    const contents: string[] = []
    ssh.putFile.mockImplementation(async (_client, local: string) => {
      contents.push(readFileSync(local, 'utf8'))
    })
    const uploader = createUploader(baseDir, config, [
      { fileName: 'first/photo.png', buffer: Buffer.from('first image') },
      { fileName: 'second/photo.png', buffer: Buffer.from('second image') },
    ])

    await uploader.upload()

    expect(contents).toEqual(['first image', 'second image'])
    expect(readFileSync(galleryFilePath(baseDir, uploader.ctx.output[0].galleryPath!), 'utf8')).toBe('first image')
    expect(readFileSync(galleryFilePath(baseDir, uploader.ctx.output[1].galleryPath!), 'utf8')).toBe('second image')
    expect(ssh.connect).toHaveBeenCalledTimes(1)
    expect(ssh.dispose).toHaveBeenCalledTimes(1)
  })

  it('stops and cleans up a shared batch after a later upload fails', async () => {
    ssh.putFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('second upload failed'))
    const uploader = createUploader(baseDir, config, [
      { fileName: 'first.png', buffer: Buffer.from('first image') },
      { fileName: 'second.png', buffer: Buffer.from('second image') },
      { fileName: 'third.png', buffer: Buffer.from('third image') },
    ])

    await expect(uploader.upload()).rejects.toThrow('second upload failed')

    expect(ssh.connect).toHaveBeenCalledTimes(1)
    expect(ssh.putFile).toHaveBeenCalledTimes(2)
    expect(ssh.dispose).toHaveBeenCalledTimes(1)
    expect(readdirSync(path.join(baseDir, 'uploadTemp'))).toEqual([])
    expect(uploader.ctx.output[0].imgUrl).toBe(`${config.host}/images/first.png`)
    expect(uploader.ctx.output[1].buffer?.toString()).toBe('second image')
    expect(uploader.ctx.output[2].buffer?.toString()).toBe('third image')
    expect(uploader.ctx.emit).toHaveBeenCalledTimes(1)
  })

  it('cleans up without connecting when staging setup fails', async () => {
    writeFileSync(path.join(baseDir, 'uploadTemp'), 'blocks staging directory creation')
    const uploader = createUploader(baseDir, config, [{ fileName: 'photo.png', buffer: Buffer.from('contents') }])

    await expect(uploader.upload()).rejects.toThrow()

    expect(ssh.connect).not.toHaveBeenCalled()
    expect(ssh.dispose).toHaveBeenCalledTimes(1)
    expect(uploader.ctx.emit).toHaveBeenCalledTimes(1)
  })

  it.each([
    [undefined, undefined, undefined, '/photo%20one.png', '/photo one.png'],
    ['/', '/', undefined, '/photo%20one.png', '/photo one.png'],
    ['//images///nested//', undefined, undefined, '/images/nested/photo%20one.png', '/images/nested/photo one.png'],
    ['/images', '/public', 'https://cdn.example.invalid', '/public/photo%20one.png', '/images/photo one.png'],
    ['/images', '/', 'https://cdn.example.invalid', '/photo%20one.png', '/images/photo one.png'],
    ['/images', '', 'https://cdn.example.invalid', '/images/photo%20one.png', '/images/photo one.png'],
  ])('preserves upload path %j, web path %j and custom URL %j', async (uploadPath, webPath, customUrl, url, remote) => {
    const uploader = createUploader(baseDir, { ...config, uploadPath, webPath, customUrl }, [
      { fileName: 'photo one.png', buffer: Buffer.from('contents') },
    ])

    await uploader.upload()

    expect(ssh.rename.mock.calls[0][2]).toBe(remote)
    expect(uploader.ctx.output[0].imgUrl).toBe(`${customUrl || config.host}${url}`)
    expect(uploader.ctx.output[0].galleryPath).toMatch(
      /^http:\/\/localhost:36699\/sftpplist\/[a-f\d]{64}\/photo%20one.png$/,
    )
  })

  it('normalizes Windows separators in remote paths', async () => {
    const uploader = createUploader(baseDir, { ...config, uploadPath: '\\images\\nested' }, [
      { fileName: 'album\\photo.png', buffer: Buffer.from('contents') },
    ])

    await uploader.upload()

    expect(ssh.rename.mock.calls[0][2]).toBe('/images/nested/album/photo.png')
  })

  it.each([
    [-1, 22],
    [65536, 22],
    [0, 22],
    [2222, 2222],
  ])('preserves port normalization from %s to %s', async (port, expectedPort) => {
    const uploader = createUploader(baseDir, { ...config, port }, [
      { fileName: 'photo.png', buffer: Buffer.from('contents') },
    ])

    await uploader.upload()

    expect(ssh.connect.mock.calls[0][1].port).toBe(expectedPort)
  })

  it.each(['test -d', 'chmod', 'chown'])('reports a nonzero exit code from %s as an upload failure', async command => {
    ssh.execCommand.mockImplementation(async (_client, script: string) => ({
      code: script.startsWith(command) ? 1 : 0,
    }))
    const uploader = createUploader(baseDir, { ...config, fileMode: '0600', dirMode: '0700', fileUser: 'uploads' }, [
      { fileName: 'first.png', buffer: Buffer.from('first image') },
      { fileName: 'second.png', buffer: Buffer.from('second image') },
    ])

    await expect(uploader.upload()).rejects.toThrow('failed (exit code: 1)')

    expect(ssh.putFile).toHaveBeenCalledTimes(command === 'test -d' ? 0 : 1)
    expect(uploader.ctx.output[0].imgUrl).toBeUndefined()
    expect(uploader.ctx.output[0].buffer?.toString()).toBe('first image')
    expect(uploader.ctx.output[1].buffer?.toString()).toBe('second image')
    expect(uploader.ctx.emit).toHaveBeenCalledTimes(1)
    expect(readdirSync(path.join(baseDir, 'uploadTemp'))).toEqual([])
  })
})
