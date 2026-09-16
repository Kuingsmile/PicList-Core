import { createServer } from 'node:http'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Request } from '../../src/lib/Request'
import type { IPicGo } from '../../src/types'
import { IBusEvent } from '../../src/utils/enum'
import { eventBus } from '../../src/utils/eventBus'

describe('Request', () => {
  const payload = { message: 'upload complete' }
  const originalListeners = new Set(eventBus.listeners(IBusEvent.CONFIG_CHANGE))
  const request = new Request({ getConfig: () => undefined } as unknown as IPicGo)
  const server = createServer((req, res) => {
    req.resume()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(payload))
  })
  let url: string

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Could not start the request test server')
    url = `http://127.0.0.1:${address.port}/upload`
  })

  afterAll(async () => {
    for (const listener of eventBus.listeners(IBusEvent.CONFIG_CHANGE)) {
      if (!originalListeners.has(listener)) eventBus.removeListener(IBusEvent.CONFIG_CHANGE, listener)
    }
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
  })

  it('preserves both Axios and legacy fields in a full response', async () => {
    const options = { url, resolveWithFullResponse: true } as const
    const response = await request.request<typeof payload, typeof options>(options)

    expect(response.status).toBe(200)
    expect(response.statusCode).toBe(200)
    expect(response.data).toEqual(payload)
    expect(response.body).toEqual(payload)
    expect(response.headers['content-type']).toBe('application/json')
  })

  it('returns only the response data for Axios options', async () => {
    expect(await request.request({ url })).toEqual(payload)
  })

  it('preserves JSON and string responses for legacy request options', async () => {
    const options = { url, qs: { test: 'legacy' } }

    expect(await request.request({ ...options, json: true })).toEqual(payload)
    expect(await request.request(options)).toBe(JSON.stringify(payload))
  })

  it('returns binary response data as a Buffer', async () => {
    const options = { url, responseType: 'arraybuffer' } as const
    const response = await request.request<Buffer, typeof options>(options)

    expect(Buffer.isBuffer(response)).toBe(true)
    expect(response.toString()).toBe(JSON.stringify(payload))
  })
})
