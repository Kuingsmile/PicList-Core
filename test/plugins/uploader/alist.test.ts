import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import registerAlistUploader from '../../../src/plugins/uploader/alist'
import type { IAlistConfig, IAlistTokenStore, IImgInfo, IOldReqOptions, IPicGo } from '../../../src/types'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))

const initialTime = 1700000000000
const initialConfig: IAlistConfig = {
  url: 'https://alist-a.example.invalid',
  username: 'test-user-a',
  password: 'synthetic-password-a',
}

function mockLogin(token: string): void {
  vi.mocked(axios.post).mockResolvedValueOnce({ data: { code: 200, message: 'success', data: { token } } })
}

function createUploader(initialStore?: IAlistTokenStore) {
  let config = { ...initialConfig }
  let tokenStore = initialStore
  let handle!: (ctx: IPicGo) => Promise<IPicGo>
  const request = vi.fn(async (_options: IOldReqOptions) => ({
    statusCode: 200,
    body: { code: 200, message: 'success', data: { sign: '' } },
  }))
  const saveConfig = vi.fn((values: Record<string, IAlistTokenStore>) => {
    tokenStore = structuredClone(values['picgo-plugin-buildin-alistplist'])
  })
  const ctx = {
    output: [] as IImgInfo[],
    getConfig: (key: string) => {
      if (key === 'picBed.alistplist') return { ...config }
      if (key === 'picgo-plugin-buildin-alistplist') return structuredClone(tokenStore)
    },
    saveConfig,
    request,
    emit: vi.fn(),
    helper: {
      uploader: {
        register: (_name: string, plugin: { handle: typeof handle }) => {
          handle = plugin.handle
        },
      },
    },
  }
  registerAlistUploader(ctx as unknown as IPicGo)

  return {
    request,
    saveConfig,
    getTokenStore: () => structuredClone(tokenStore),
    async upload(nextConfig = config) {
      config = { ...nextConfig }
      ctx.output = [{ fileName: 'photo.png', buffer: Buffer.from('synthetic-image') }]
      request.mockClear()
      await handle(ctx as unknown as IPicGo)
      return ctx.output
    },
  }
}

function expectAuthorization(uploader: ReturnType<typeof createUploader>, token: string): void {
  expect(uploader.request).toHaveBeenCalledTimes(3)
  for (const [options] of uploader.request.mock.calls) {
    expect(options.headers?.Authorization).toBe(token)
  }
}

describe('Alist token cache', () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset()
    vi.spyOn(Date, 'now').mockReturnValue(initialTime)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reuses a fresh token for the same server and credentials', async () => {
    const uploader = createUploader()
    mockLogin('synthetic-token-a')

    await uploader.upload()
    await uploader.upload()

    expect(axios.post).toHaveBeenCalledTimes(1)
    expectAuthorization(uploader, 'synthetic-token-a')
    expect(uploader.saveConfig).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['server', { url: 'https://alist-b.example.invalid' }],
    ['server base path', { url: 'https://alist-a.example.invalid/another-instance' }],
    ['username', { username: 'test-user-b' }],
    ['password', { password: 'synthetic-password-b' }],
  ])('refreshes the token when the %s changes', async (_name, changes) => {
    const uploader = createUploader()
    mockLogin('synthetic-token-a')
    mockLogin('synthetic-token-b')

    await uploader.upload()
    const nextConfig = { ...initialConfig, ...changes }
    await uploader.upload(nextConfig)

    expect(axios.post).toHaveBeenCalledTimes(2)
    expect(axios.post).toHaveBeenLastCalledWith(`${nextConfig.url}/api/auth/login`, {
      username: nextConfig.username,
      password: nextConfig.password,
    })
    expectAuthorization(uploader, 'synthetic-token-b')
  })

  it('reuses the token across trailing-slash and upload-path changes', async () => {
    const uploader = createUploader()
    mockLogin('synthetic-token-a')

    await uploader.upload({ ...initialConfig, url: `${initialConfig.url}/` })
    const output = await uploader.upload({ ...initialConfig, uploadPath: 'another-folder' })

    expect(axios.post).toHaveBeenCalledTimes(1)
    expectAuthorization(uploader, 'synthetic-token-a')
    expect(output[0].imgUrl).toBe(`${initialConfig.url}/d/another-folder/photo.png`)
  })

  it('refreshes an unscoped legacy cache and preserves its existing fields', async () => {
    const legacyStore: IAlistTokenStore = { token: 'synthetic-legacy-token', refreshedAt: initialTime }
    const uploader = createUploader(legacyStore)
    mockLogin('synthetic-token-a')

    await uploader.upload()
    await uploader.upload()

    expect(axios.post).toHaveBeenCalledTimes(1)
    expectAuthorization(uploader, 'synthetic-token-a')
    expect(uploader.getTokenStore()).toEqual({
      token: 'synthetic-token-a',
      refreshedAt: initialTime,
      cacheKey: expect.any(String),
    })
    expect(JSON.stringify(uploader.getTokenStore())).not.toContain(initialConfig.password)
  })

  it('reuses a scoped cache loaded by another uploader instance', async () => {
    const uploader = createUploader()
    mockLogin('synthetic-token-a')
    await uploader.upload()

    const restoredUploader = createUploader(uploader.getTokenStore())
    await restoredUploader.upload()

    expect(axios.post).toHaveBeenCalledTimes(1)
    expectAuthorization(restoredUploader, 'synthetic-token-a')
  })

  it('keeps the one-hour expiry', async () => {
    const uploader = createUploader()
    mockLogin('synthetic-token-a')
    mockLogin('synthetic-token-refreshed')
    await uploader.upload()

    vi.mocked(Date.now).mockReturnValue(initialTime + 3600000 - 1)
    await uploader.upload()
    expect(axios.post).toHaveBeenCalledTimes(1)

    vi.mocked(Date.now).mockReturnValue(initialTime + 3600000)
    await uploader.upload()
    expect(axios.post).toHaveBeenCalledTimes(2)
    expectAuthorization(uploader, 'synthetic-token-refreshed')
  })

  it('keeps manually configured tokens independent of the login cache', async () => {
    const legacyStore: IAlistTokenStore = { token: 'synthetic-legacy-token', refreshedAt: initialTime }
    const uploader = createUploader(legacyStore)
    await uploader.upload({ url: initialConfig.url, token: 'synthetic-manual-token' })

    expect(axios.post).not.toHaveBeenCalled()
    expect(uploader.saveConfig).not.toHaveBeenCalled()
    expectAuthorization(uploader, 'synthetic-manual-token')
    expect(uploader.getTokenStore()).toEqual(legacyStore)
  })

  it('never falls back to another account token when login fails', async () => {
    const uploader = createUploader()
    mockLogin('synthetic-token-a')
    await uploader.upload()
    const previousStore = uploader.getTokenStore()
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { code: 401, message: 'Login failed' } })

    await expect(uploader.upload({ ...initialConfig, username: 'test-user-b' })).rejects.toThrow('Get token failed')

    expect(uploader.request).not.toHaveBeenCalled()
    expect(uploader.getTokenStore()).toEqual(previousStore)
  })

  it('does not cache an invalid login response', async () => {
    const uploader = createUploader()
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { code: 200, message: 'success', data: {} } })

    await expect(uploader.upload()).rejects.toThrow('Get token failed')

    expect(uploader.saveConfig).not.toHaveBeenCalled()
    expect(uploader.request).not.toHaveBeenCalled()
  })
})
