import { Agent as HttpAgent, createServer, get, type RequestOptions } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import { Socket } from 'node:net'

import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getProxyAgent } from '../../../src/plugins/uploader/s3/utils'

// Synthetic credentials exercise reserved characters and percent escapes without using real secrets.
const encodedAuth = 'probe-user%2Btag:probe%3Apass%40%2F%252F'
const authorization = `Basic ${Buffer.from('probe-user+tag:probe:pass@/%2F').toString('base64')}`

describe.each([false, true])('S3 proxy agents with sslEnabled=%s', sslEnabled => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['HTTP authentication', `http://${encodedAuth}@proxy.invalid:8123`, `http://${encodedAuth}@proxy.invalid:8123/`],
    ['HTTPS authentication', `https://${encodedAuth}@proxy.invalid:8443`, `https://${encodedAuth}@proxy.invalid:8443/`],
    ['bare authenticated host', `${encodedAuth}@proxy.invalid:8123`, `http://${encodedAuth}@proxy.invalid:8123/`],
    ['IPv4 loopback', 'http://127.0.0.1:8123', 'http://127.0.0.1:8123/'],
    ['bare IPv4 loopback', '127.0.0.1:8123', 'http://127.0.0.1:8123/'],
    ['localhost', 'localhost:8123', 'http://localhost:8123/'],
    ['hostname containing a loopback address', '127.0.0.1.proxy.invalid:8123', 'http://127.0.0.1.proxy.invalid:8123/'],
    ['IPv6', `http://${encodedAuth}@[::1]:8123`, `http://${encodedAuth}@[::1]:8123/`],
    ['bare IPv6', '[::1]:8123', 'http://[::1]:8123/'],
    ['bare authenticated IPv6', `${encodedAuth}@[::1]:8123`, `http://${encodedAuth}@[::1]:8123/`],
    ['bare host without a port', 'proxy.invalid', 'http://proxy.invalid/'],
    ['implicit HTTP port', 'http://proxy.invalid', 'http://proxy.invalid/'],
    ['explicit HTTP default port', 'http://proxy.invalid:80', 'http://proxy.invalid/'],
    ['implicit HTTPS port', 'https://proxy.invalid', 'https://proxy.invalid/'],
    ['explicit HTTPS default port', 'https://proxy.invalid:443', 'https://proxy.invalid/'],
    ['IPv6 without a port', '[::1]', 'http://[::1]/'],
    ['IPv6 with the HTTPS default port', 'https://[::1]:443', 'https://[::1]/'],
    ['uppercase scheme', 'HTTPS://proxy.invalid:8443', 'https://proxy.invalid:8443/'],
  ])('preserves %s', (_label, proxy, expectedUrl) => {
    const agent = getProxyAgent(proxy, sslEnabled, true)
    try {
      expect(agent).toBeInstanceOf(sslEnabled ? HttpsProxyAgent : HttpProxyAgent)
      expect(agent).toHaveProperty('proxy.href', expectedUrl)
      expect(agent).toHaveProperty('options.keepAlive', true)
      expect(agent).toHaveProperty('options.rejectUnauthorized', true)
    } finally {
      agent?.destroy()
    }
  })

  it.each([
    ['implicit HTTP port', 'http', 'proxy.invalid', '', 'proxy.invalid', 80],
    ['explicit HTTP default port', 'http', 'proxy.invalid', ':80', 'proxy.invalid', 80],
    ['implicit HTTPS port', 'https', 'proxy.invalid', '', 'proxy.invalid', 443],
    ['explicit HTTPS default port', 'https', 'proxy.invalid', ':443', 'proxy.invalid', 443],
    ['HTTP IPv6', 'http', '[::1]', ':8123', '::1', 8123],
    ['HTTPS IPv6', 'https', '[::1]', ':8443', '::1', 8443],
  ])('uses %s in the CONNECT request', async (_label, protocol, urlHost, urlPort, host, port) => {
    const transport = protocol === 'http' ? HttpAgent : HttpsAgent
    const stopped = new Error('Synthetic proxy connection stopped')
    const socket = new Socket()
    let connection: RequestOptions | undefined
    // Intercept only the native socket boundary so Node still resolves the proxy host and default port.
    vi.spyOn(transport.prototype, 'createConnection').mockImplementation((options, callback) => {
      connection = options
      callback?.(stopped, socket)
      return socket
    })
    const agent = getProxyAgent(`${protocol}://${encodedAuth}@${urlHost}${urlPort}`, sslEnabled, true)!
    try {
      const error = await new Promise<Error | null>(resolve => {
        agent.createConnection({ host: 'example.invalid', port: sslEnabled ? 443 : 80 }, error => resolve(error))
      })

      expect(error).toBe(stopped)
      expect(Number(connection?.port)).toBe(port)
      expect(connection).toMatchObject({
        host,
        method: 'CONNECT',
        headers: {
          host: `example.invalid:${sslEnabled ? 443 : 80}`,
          'proxy-authorization': authorization,
        },
      })
    } finally {
      socket.destroy()
      agent.destroy()
    }
  })

  it.each([
    ['missing proxy', undefined],
    ['empty proxy', ''],
    ['invalid hostname', 'invalid proxy'],
    ['invalid authenticated hostname', `http://${encodedAuth}@invalid proxy`],
    ['missing hostname', 'http://'],
    ['invalid port', 'http://proxy.invalid:invalid'],
    ['out-of-range port', 'proxy.invalid:65536'],
    ['invalid IPv6', 'http://[::1'],
    ['unbracketed IPv6', '::1:8123'],
    ['unsupported scheme', 'socks5://proxy.invalid:1080'],
    ['invalid credential escape', 'http://probe-user:probe%ZZ@proxy.invalid'],
    ['invalid credential encoding', 'http://probe%FF:probe-pass@proxy.invalid'],
  ])('ignores %s without logging input or parser errors', (_label, proxy) => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map(method =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )

    expect(getProxyAgent(proxy, sslEnabled, false)).toBeUndefined()
    for (const log of logs) expect(log).not.toHaveBeenCalled()
  })
})

describe('S3 authenticated proxy connections', () => {
  it.each([
    ['IPv4 URL', '127.0.0.1', 'http://'],
    ['bare IPv4', '127.0.0.1', ''],
  ])('authenticates through a local %s proxy', async (_label, host, scheme) => {
    const proxyServer = createServer()
    const sockets = new Set<Socket>()
    const connections: { path: string | undefined; authorized: boolean }[] = []
    proxyServer.on('connection', socket => {
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
    })
    proxyServer.on('connect', (req, socket) => {
      const authorized = req.headers['proxy-authorization'] === authorization
      connections.push({ path: req.url, authorized })
      if (!authorized) {
        socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nConnection: close\r\n\r\n')
        return
      }
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      socket.once('data', () => {
        socket.end('HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\nproxied')
      })
    })
    await new Promise<void>((resolve, reject) => {
      proxyServer.once('error', reject)
      proxyServer.listen(0, host, resolve)
    })

    let agent: ReturnType<typeof getProxyAgent>
    try {
      const address = proxyServer.address()
      if (!address || typeof address === 'string') throw new Error('Could not start the proxy test server')
      agent = getProxyAgent(`${scheme}${encodedAuth}@${host}:${address.port}`, false, true)
      const body = await new Promise<string>((resolve, reject) => {
        const request = get('http://example.invalid/image', { agent, timeout: 2000 }, response => {
          let body = ''
          response.setEncoding('utf8')
          response.on('data', chunk => (body += chunk))
          response.on('end', () => resolve(body))
          response.on('error', reject)
        })
        request.on('timeout', () => request.destroy(new Error('Proxy test request timed out')))
        request.on('error', reject)
      })

      expect(body).toBe('proxied')
      expect(connections).toEqual([{ path: 'example.invalid:80', authorized: true }])
    } finally {
      agent?.destroy()
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) => proxyServer.close(error => (error ? reject(error) : resolve())))
    }
  })
})
