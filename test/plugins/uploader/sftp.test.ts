import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import registerSftpUploader from '../../../src/plugins/uploader/sftp'
import type { IImgInfo, IPicGo, ISftpPlistConfig } from '../../../src/types'
import { IBuildInEvent } from '../../../src/utils/enum'

const ssh = vi.hoisted(() => ({
  connect: vi.fn(),
  putFile: vi.fn(),
  execCommand: vi.fn(),
  dispose: vi.fn(),
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
    getConfig: () => ({ ...config }),
    emit: vi.fn(),
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
      const [firstClient, firstLocal] = ssh.putFile.mock.calls[0]
      const [secondClient, secondLocal] = ssh.putFile.mock.calls[1]
      expect(firstClient).not.toBe(secondClient)
      expect(path.dirname(firstLocal)).not.toBe(path.dirname(secondLocal))
      expect(ssh.dispose.mock.calls).toEqual([[firstClient], [secondClient]])
      expect(readdirSync(path.join(baseDir, 'uploadTemp'))).toEqual([])
      expect(first.ctx.output[0].imgUrl).toBe(`${config.host}/a/${fileName}`)
      expect(second.ctx.output[0].imgUrl).toBe(`sftp-b.example.invalid/b/${fileName}`)
      expect(first.ctx.output[0].buffer).toBeUndefined()
      expect(second.ctx.output[0].base64Image).toBeUndefined()
      expect(readFileSync(path.join(baseDir, 'imgTemp', 'sftpplist', fileName), 'utf8')).toBe('contents-b')
      expect(second.ctx.output[0].galleryPath).toBe(`http://localhost:36699/sftpplist/${encodeURIComponent(fileName)}`)
    },
  )

  it.each(['connect', 'upload', 'chown', 'gallery'])('cleans up when %s fails', async stage => {
    const failure = new Error(`${stage} failed`)
    if (stage === 'connect') ssh.connect.mockRejectedValueOnce(failure)
    if (stage === 'upload') ssh.putFile.mockRejectedValueOnce(failure)
    if (stage === 'chown') {
      ssh.execCommand.mockImplementation(async (_client, script: string) => {
        if (script.startsWith('chown ')) throw failure
        return { code: 0 }
      })
    }
    if (stage === 'gallery') writeFileSync(path.join(baseDir, 'imgTemp'), 'blocks gallery directory creation')
    const uploader = createUploader(baseDir, { ...config, fileUser: 'uploads' }, [
      { fileName: 'photo.png', buffer: Buffer.from('contents') },
    ])

    await expect(uploader.upload()).rejects.toThrow(stage === 'gallery' ? undefined : failure.message)

    expect(ssh.dispose).toHaveBeenCalledTimes(1)
    expect(readdirSync(path.join(baseDir, 'uploadTemp'))).toEqual([])
    expect(uploader.ctx.emit).toHaveBeenCalledWith(IBuildInEvent.NOTIFICATION, {
      title: 'UPLOAD_FAILED',
      body: 'CHECK_SETTINGS',
    })
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
})
