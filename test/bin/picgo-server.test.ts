import { createServer as createHttpServer, request as httpRequest } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../src/core/PicGo'

const errorMessage = 'Upload failed, please check your network and config'

const getAvailablePort = async (): Promise<number> => {
  const probe = createNetServer()
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', resolve)
  })
  const address = probe.address()
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test server port')
  await new Promise<void>((resolve, reject) => probe.close(error => (error ? reject(error) : resolve())))
  return address.port
}

describe('picgo-server', () => {
  const originalArgv = process.argv
  const originalHome = process.env.HOME
  const originalUserProfile = process.env.USERPROFILE
  let baseDir: string
  let port: number
  let server: any
  let tempDir: string
  let uploaderServer: any
  let uploaderRequests = 0
  let getUploadedImageUrls: typeof import('../../bin/picgo-server').getUploadedImageUrls

  beforeAll(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-server-test-'))
    uploaderServer = createHttpServer((request, response) => {
      uploaderRequests += 1
      request.resume()
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ message: 'Expected uploader failure' }))
    })
    await new Promise<void>((resolve, reject) => {
      uploaderServer.once('error', reject)
      uploaderServer.listen(0, '127.0.0.1', resolve)
    })
    const uploaderAddress = uploaderServer.address()
    if (!uploaderAddress || typeof uploaderAddress === 'string') {
      throw new Error('Could not start the test uploader server')
    }

    const configPath = path.join(baseDir, 'config.json')
    await fs.writeJson(configPath, {
      picBed: {
        current: 'advancedplist',
        uploader: 'advancedplist',
        advancedplist: {
          endpoint: `http://127.0.0.1:${uploaderAddress.port}/upload`,
          method: 'POST',
          headers: '{}',
          body: '{}',
          resDataPath: 'data.url',
        },
      },
      picgoPlugins: {},
    })

    port = await getAvailablePort()
    process.argv = [
      'node',
      'picgo-server',
      '--config',
      configPath,
      '--port',
      String(port),
      '--host',
      '127.0.0.1',
      '--key',
      'test-key',
    ]
    process.env.HOME = baseDir
    process.env.USERPROFILE = baseDir

    const serverModule = await import('../../bin/picgo-server')
    server = serverModule.default
    getUploadedImageUrls = serverModule.getUploadedImageUrls
    tempDir = path.join(baseDir, '.piclist', 'serverTemp')
    // Simulate remote clients without requiring an externally reachable interface.
    server.httpServer.prependListener('request', (request: any) => {
      Object.defineProperty(request.socket, 'remoteAddress', {
        configurable: true,
        value: request.headers['x-test-remote'] ? '192.0.2.1' : '127.0.0.1',
      })
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await vi.waitFor(async () => expect(await fs.readdir(tempDir)).toEqual([]))
  })

  afterAll(async () => {
    if (server?.httpServer?.listening) {
      await new Promise<void>((resolve, reject) =>
        server.httpServer.close((error: Error | undefined) => (error ? reject(error) : resolve())),
      )
    }
    if (uploaderServer?.listening) {
      await new Promise<void>((resolve, reject) =>
        uploaderServer.close((error: Error | undefined) => (error ? reject(error) : resolve())),
      )
    }
    process.argv = originalArgv
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    if (originalUserProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = originalUserProfile
    await fs.remove(baseDir)
  })

  it('returns a failed response when a multipart uploader throws after transformation', async () => {
    const form = new FormData()
    form.append('image', new Blob(['not-a-real-image']), 'failure.png')

    const response = await fetch(`http://127.0.0.1:${port}/upload`, {
      method: 'POST',
      body: form,
    })
    const body = await response.json()

    expect(uploaderRequests).toBe(1)
    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: false,
      message: errorMessage,
    })
  })

  it('rejects sparse upload output arrays', () => {
    expect(getUploadedImageUrls({ ctx: { output: Array(1) } }, 1)).toBeNull()
  })

  it.each(['', '?key=wrong-key'])('rejects unauthorized multipart requests before writing files (%s)', async query => {
    const upload = vi.spyOn(PicGo.prototype, 'uploadReturnCtx')
    const form = new FormData()
    form.append('image', new Blob(['synthetic']), 'rejected.png')

    const response = await fetch(`http://127.0.0.1:${port}/upload${query}`, {
      method: 'POST',
      headers: { 'x-test-remote': 'true' },
      body: form,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: false, message: 'Unauthorized access' })
    expect(upload).not.toHaveBeenCalled()
    expect(await fs.readdir(tempDir)).toEqual([])
  })

  it('rejects an unauthorized request without waiting for its body', async () => {
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = httpRequest(
        `http://127.0.0.1:${port}/upload`,
        {
          method: 'POST',
          headers: {
            'x-test-remote': 'true',
            'Content-Type': 'multipart/form-data; boundary=test-boundary',
            'Content-Length': '1000000',
          },
        },
        response => {
          let body = ''
          response.on('data', chunk => (body += chunk))
          response.on('end', () => {
            resolve({ status: response.statusCode!, body })
            request.destroy()
          })
        },
      )
      request.on('error', reject)
      request.setTimeout(2000, () => request.destroy(new Error('Authorization waited for the request body')))
      request.flushHeaders()
    })

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ success: false, message: 'Unauthorized access' })
  })

  it('accepts the correct key and preserves filenames and distinct file contents', async () => {
    const received: { name: string; content: string }[] = []
    vi.spyOn(PicGo.prototype, 'uploadReturnCtx').mockImplementation(async input => {
      for (const file of input!) {
        received.push({ name: path.basename(file), content: await fs.readFile(file, 'utf8') })
      }
      return { ctx: { output: input!.map(() => ({ imgUrl: 'https://example.invalid/photo.png' })) } } as any
    })
    const form = new FormData()
    form.append('first', new Blob(['x'.repeat(64)]), '文件.png')
    form.append('second', new Blob(['second']), '文件.png')

    const response = await fetch(`http://127.0.0.1:${port}/upload?key=test-key`, {
      method: 'POST',
      headers: { 'x-test-remote': 'true' },
      body: form,
    })

    expect((await response.json()).success).toBe(true)
    expect(received).toEqual([
      { name: '文件.png', content: 'x'.repeat(64) },
      { name: '文件.png', content: 'second' },
    ])
  })

  it('accepts uploads exceeding the former file and multipart part counts', async () => {
    const upload = vi.spyOn(PicGo.prototype, 'uploadReturnCtx').mockImplementation(async input => {
      return { ctx: { output: input!.map(() => ({ imgUrl: 'https://example.invalid/photo.png' })) } } as any
    })
    const form = new FormData()
    for (let index = 0; index < 41; index++) {
      form.append('image', new Blob(['synthetic']), `file-${index}.png`)
    }

    const response = await fetch(`http://127.0.0.1:${port}/upload`, { method: 'POST', body: form })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.result).toHaveLength(41)
    expect(upload.mock.calls[0][0]).toHaveLength(41)
  })

  it('cleans up when the uploader throws', async () => {
    vi.spyOn(PicGo.prototype, 'uploadReturnCtx').mockRejectedValue(new Error('Synthetic upload failure'))
    const form = new FormData()
    form.append('image', new Blob(['synthetic']), 'failure.png')

    const response = await fetch(`http://127.0.0.1:${port}/upload`, { method: 'POST', body: form })

    expect(await response.json()).toEqual({ success: false, message: errorMessage })
  })

  it('cleans up malformed multipart bodies', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=test-boundary' },
      body: '--test-boundary\r\nContent-Disposition: form-data; name="file"; filename="partial.png"\r\n\r\npartial',
    })

    expect(await response.json()).toEqual({ success: false, message: 'Error processing formData' })
  })

  it('does not store files sent to the public heartbeat endpoint', async () => {
    const form = new FormData()
    form.append('image', new Blob(['synthetic']), 'heartbeat.png')

    const response = await fetch(`http://127.0.0.1:${port}/heartbeat`, {
      method: 'POST',
      headers: { 'x-test-remote': 'true' },
      body: form,
    })

    expect(await response.json()).toEqual({ success: true, result: 'alive' })
    expect(await fs.readdir(tempDir)).toEqual([])
  })

  it('cleans up a partial upload when the client disconnects', async () => {
    const upload = vi.spyOn(PicGo.prototype, 'uploadReturnCtx')
    const request = httpRequest(`http://127.0.0.1:${port}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=test-boundary',
        'Content-Length': '1000000',
      },
    })
    request.on('error', () => {})
    try {
      request.write(
        '--test-boundary\r\nContent-Disposition: form-data; name="file"; filename="partial.png"\r\n\r\npartial',
      )
      await vi.waitFor(async () => {
        const entries = await fs.readdir(tempDir, { recursive: true, encoding: 'utf8' })
        expect(entries.some(entry => entry.endsWith('partial.png'))).toBe(true)
      })
    } finally {
      request.destroy()
    }
    expect(upload).not.toHaveBeenCalled()
  })

  it('only cleans up files belonging to the completed request', async () => {
    let releaseFirst!: () => void
    const waitForRelease = new Promise<void>(resolve => (releaseFirst = resolve))
    let startedFirst!: (file: string) => void
    const firstFile = new Promise<string>(resolve => (startedFirst = resolve))
    let uploadCount = 0
    vi.spyOn(PicGo.prototype, 'uploadReturnCtx').mockImplementation(async input => {
      uploadCount += 1
      if (uploadCount === 1) {
        startedFirst(input![0])
        await waitForRelease
      }
      return { ctx: { output: [{ imgUrl: 'https://example.invalid/photo.png' }] } } as any
    })
    const firstForm = new FormData()
    firstForm.append('image', new Blob(['first']), 'photo.png')
    const firstResponse = fetch(`http://127.0.0.1:${port}/upload`, { method: 'POST', body: firstForm })

    try {
      const pendingFile = await firstFile
      const secondForm = new FormData()
      secondForm.append('image', new Blob(['second']), 'photo.png')
      const secondResponse = await fetch(`http://127.0.0.1:${port}/upload`, { method: 'POST', body: secondForm })

      expect((await secondResponse.json()).success).toBe(true)
      await vi.waitFor(async () => expect(await fs.readdir(tempDir)).toHaveLength(1))
      expect(await fs.readFile(pendingFile, 'utf8')).toBe('first')
    } finally {
      releaseFirst()
      expect((await (await firstResponse).json()).success).toBe(true)
    }
  })
})
