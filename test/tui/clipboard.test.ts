import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyText } from '../../src/tui/clipboard'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('is-wsl', () => ({ default: false }))
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform)
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('system clipboard transport', () => {
  it.each([
    ['win32', 'powershell.exe'],
    ['darwin', 'pbcopy'],
    ['linux', 'wl-copy'],
  ])('sends text over stdin on %s', async (platform, command) => {
    Object.defineProperty(process, 'platform', { value: platform })
    vi.stubEnv('WAYLAND_DISPLAY', 'wayland-test')
    const stdin = new PassThrough()
    const child = Object.assign(new EventEmitter(), { stdin, kill: vi.fn() })
    vi.mocked(spawn).mockReturnValue(child as any)
    const value = 'https://example.com/图片.png?x=$(echo test)&y=`code`'
    const task = copyText(value)
    expect(spawn).toHaveBeenCalledWith(
      command,
      expect.any(Array),
      expect.objectContaining({ windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] }),
    )
    expect(JSON.stringify(vi.mocked(spawn).mock.calls)).not.toContain(value)
    expect(stdin.read().toString()).toBe(value)
    child.emit('close', 0)
    await task
  })

  it('falls back from unavailable Wayland to X11 and handles missing utilities', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    vi.stubEnv('WAYLAND_DISPLAY', 'wayland-test')
    vi.mocked(spawn).mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), kill: vi.fn() })
      queueMicrotask(() => child.emit('error', new Error('ENOENT')))
      return child as any
    })
    await expect(copyText('sample')).rejects.toThrow('Clipboard unavailable')
    expect(vi.mocked(spawn).mock.calls.map(call => call[0])).toEqual(['wl-copy', 'xclip', 'xsel'])
  })
})
