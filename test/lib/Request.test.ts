import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { URL } from 'node:url'

import type { AxiosAdapter, AxiosProxyConfig } from 'axios'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Request } from '../../src/lib/Request'
import type { IOldReqOptions, IPicGo } from '../../src/types'

const proxyAdapter: AxiosAdapter = async config => ({
  data: {
    proxy: config.proxy,
    tunnel: config.httpsAgent?.proxyOptions,
    transport:
      config.httpsAgent?.request === httpsRequest
        ? 'https'
        : config.httpsAgent?.request === httpRequest
          ? 'http'
          : undefined,
  },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
})

describe('Request', () => {
  const payload = { message: 'upload complete' }
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

  describe.each(['body', 'qs'])('legacy %s response bodies', legacyOption => {
    it.each([
      [true, 'literal-response', 'literal-response'],
      [undefined, 'literal-response', 'literal-response'],
      [false, 'literal-response', 'literal-response'],
      [true, payload, payload],
      [undefined, payload, JSON.stringify(payload)],
      [false, payload, JSON.stringify(payload)],
    ] as const)('preserves the response body with json=%s and data=%j', async (json, data, expected) => {
      const adapter: AxiosAdapter = async config => ({
        data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      })
      const options = {
        url: 'http://example.invalid/upload',
        ...(legacyOption === 'body' ? { body: 'synthetic-body' } : { qs: { test: 'legacy' } }),
        ...(json === undefined ? {} : { json }),
        adapter,
      }

      expect(await request.request(options)).toEqual(expected)
    })
  })

  it('returns binary response data as a Buffer', async () => {
    const options = { url, responseType: 'arraybuffer' } as const
    const response = await request.request<Buffer, typeof options>(options)

    expect(Buffer.isBuffer(response)).toBe(true)
    expect(response.toString()).toBe(JSON.stringify(payload))
  })

  describe.each(['http', 'https'])('proxies for %s targets', targetProtocol => {
    const targetUrl = `${targetProtocol}://example.invalid/upload`

    it.each([
      ['Axios', 'http'],
      ['Axios', 'https'],
      ['string', 'http'],
      ['string', 'https'],
      ['URL', 'http'],
      ['URL', 'https'],
      ['global', 'http'],
      ['global', 'https'],
    ])('preserves %s proxy credentials over %s', async (format, proxyProtocol) => {
      const proxyUrl = `${proxyProtocol}://probe-user%2Btag:probe%3Apass%40%2F%25@127.0.0.1:8123`
      const proxy: AxiosProxyConfig = Object.freeze({
        host: '127.0.0.1',
        port: 8123,
        protocol: format === 'Axios' ? proxyProtocol : `${proxyProtocol}:`,
        auth: Object.freeze({ username: 'probe-user+tag', password: 'probe:pass@/%' }),
      })
      const request = new Request({
        getConfig: () => (format === 'global' ? proxyUrl : undefined),
      } as unknown as IPicGo)
      const options: IOldReqOptions & { adapter: AxiosAdapter } = {
        url: targetUrl,
        proxy:
          format === 'Axios'
            ? proxy
            : format === 'string'
              ? proxyUrl
              : format === 'URL'
                ? new URL(proxyUrl)
                : undefined,
        json: true,
        adapter: proxyAdapter,
      }
      const result = await request.request(options)

      expect(result).toEqual(
        targetProtocol === 'https'
          ? {
              proxy: false,
              tunnel: { host: '127.0.0.1', port: 8123, proxyAuth: 'probe-user+tag:probe:pass@/%' },
              transport: proxyProtocol,
            }
          : { proxy, tunnel: undefined, transport: undefined },
      )
    })

    it.each([
      ['http://proxy.invalid', 'http:', 80],
      ['http://proxy.invalid:80', 'http:', 80],
      ['https://proxy.invalid', 'https:', 443],
      ['https://proxy.invalid:443', 'https:', 443],
    ])('uses the default proxy port for %s', async (proxy, protocol, port) => {
      const result = await request.request({ url: targetUrl, proxy, json: true, adapter: proxyAdapter })

      expect(result).toEqual(
        targetProtocol === 'https'
          ? { proxy: false, tunnel: { host: 'proxy.invalid', port }, transport: protocol.slice(0, -1) }
          : { proxy: { host: 'proxy.invalid', port, protocol }, tunnel: undefined, transport: undefined },
      )
    })

    it.each(['http:', 'https:', undefined])('preserves the Axios protocol %s', async protocol => {
      const proxy = { host: '127.0.0.1', port: 8123, protocol }
      const result = await request.request({ url: targetUrl, proxy, adapter: proxyAdapter })

      expect(result).toEqual(
        targetProtocol === 'https'
          ? {
              proxy: false,
              tunnel: { host: '127.0.0.1', port: 8123 },
              transport: protocol === 'https:' ? 'https' : 'http',
            }
          : { proxy, tunnel: undefined, transport: undefined },
      )
    })

    it('replaces the global proxy without inheriting its credentials or protocol', async () => {
      const request = new Request({
        getConfig: () => 'https://global-user:global-test-password@global.invalid:8443',
      } as unknown as IPicGo)
      const proxy = { host: 'local.invalid', port: 8123 }
      const result = await request.request({ url: targetUrl, proxy, adapter: proxyAdapter })

      expect(result).toEqual(
        targetProtocol === 'https'
          ? { proxy: false, tunnel: { host: 'local.invalid', port: 8123 }, transport: 'http' }
          : { proxy, tunnel: undefined, transport: undefined },
      )
    })

    it('disables the global proxy with proxy: false', async () => {
      const request = new Request({ getConfig: () => 'http://global.invalid:8080' } as unknown as IPicGo)

      expect(await request.request({ url: targetUrl, proxy: false, adapter: proxyAdapter })).toEqual({
        proxy: false,
        tunnel: undefined,
        transport: undefined,
      })
    })
  })

  it('keeps string proxy responses in legacy format unless json is requested', async () => {
    const options = { url: 'http://example.invalid/upload', proxy: 'http://proxy.invalid:8123', adapter: proxyAdapter }
    const result = await request.request(options)

    expect(typeof result).toBe('string')
    expect(JSON.parse(result as string)).toEqual({ proxy: { host: 'proxy.invalid', port: 8123, protocol: 'http:' } })
  })

  it('authenticates requests through a local HTTP proxy', async () => {
    const authorization = `Basic ${Buffer.from('probe-user+tag:probe:pass@/%').toString('base64')}`
    const proxyServer = createServer((req, res) => {
      req.resume()
      if (req.headers['proxy-authorization'] !== authorization) {
        res.writeHead(407)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ url: req.url }))
    })
    await new Promise<void>((resolve, reject) => {
      proxyServer.once('error', reject)
      proxyServer.listen(0, '127.0.0.1', resolve)
    })

    try {
      const address = proxyServer.address()
      if (!address || typeof address === 'string') throw new Error('Could not start the proxy test server')
      const proxyUrl = `http://probe-user%2Btag:probe%3Apass%40%2F%25@127.0.0.1:${address.port}`
      const url = 'http://example.invalid/image'
      const proxies = [
        {
          host: '127.0.0.1',
          port: address.port,
          protocol: 'http',
          auth: { username: 'probe-user+tag', password: 'probe:pass@/%' },
        },
        proxyUrl,
        new URL(proxyUrl),
        undefined,
      ]

      for (const proxy of proxies) {
        const request = new Request({
          getConfig: () => (proxy === undefined ? proxyUrl : undefined),
        } as unknown as IPicGo)
        const options: IOldReqOptions = { url, proxy, json: true, timeout: 2000 }
        expect(await request.request(options)).toEqual({ url })
      }
    } finally {
      await new Promise<void>((resolve, reject) => proxyServer.close(error => (error ? reject(error) : resolve())))
    }
  })

  it.each(['http', 'https'])('uses the current proxy for each %s request, including removal', async protocol => {
    let proxy: string | undefined = 'http://initial.invalid:8080'
    const request = new Request({ getConfig: () => proxy } as unknown as IPicGo)
    const readProxy = () =>
      request.request({
        url: `${protocol}://example.invalid/upload`,
        adapter: async config => ({
          data: { proxy: config.proxy, tunnel: config.httpsAgent?.proxyOptions },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }),
      })

    const expectedProxy = (host: string, port: number) =>
      protocol === 'https'
        ? { proxy: false, tunnel: { host, port } }
        : { proxy: { host, port, protocol: 'http:' }, tunnel: undefined }

    expect(await readProxy()).toEqual(expectedProxy('initial.invalid', 8080))
    proxy = 'http://updated.invalid:8081'
    expect(await readProxy()).toEqual(expectedProxy('updated.invalid', 8081))

    for (const absentProxy of [undefined, '', 'invalid proxy']) {
      proxy = 'http://updated.invalid:8081'
      await readProxy()
      proxy = absentProxy
      expect(await readProxy()).toEqual({ proxy: false, tunnel: undefined })
    }
  })
})
