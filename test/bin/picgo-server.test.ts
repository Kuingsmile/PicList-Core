import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
    process.argv = ['node', 'picgo-server', '--config', configPath, '--port', String(port), '--host', '127.0.0.1']
    process.env.HOME = baseDir
    process.env.USERPROFILE = baseDir

    const serverModule = await import('../../bin/picgo-server')
    server = serverModule.default
    getUploadedImageUrls = serverModule.getUploadedImageUrls
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
})
