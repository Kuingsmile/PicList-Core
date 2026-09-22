import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { IBuildInEvent } from '../../src/utils/enum'
import getClipboardImage from '../../src/utils/getClipboardImage'

const childProcessMock = vi.hoisted(() => ({
  spawn: vi.fn(),
}))
const platformMock = vi.hoisted(() => ({ isWsl: false }))

vi.mock('node:child_process', () => childProcessMock)
vi.mock('is-wsl', () => ({
  get default() {
    return platformMock.isWsl
  },
}))
vi.mock('../../src/utils/clipboard/linux.sh', () => ({ default: 'linux clipboard script' }))
vi.mock('../../src/utils/clipboard/mac.applescript', () => ({ default: 'mac clipboard script' }))
vi.mock('../../src/utils/clipboard/windows.ps1', () => ({ default: 'windows clipboard script' }))
vi.mock('../../src/utils/clipboard/windows10.ps1', () => ({ default: 'windows10 clipboard script' }))
vi.mock('../../src/utils/clipboard/wsl.sh', () => ({ default: 'wsl clipboard script' }))

const baseDirs: string[] = []
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!

/** Reserves a unique fixture directory path and tracks it for cleanup after the test. */
function createBaseDir(): string {
  const baseDir = path.join(os.tmpdir(), `piclist-clipboard-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  baseDirs.push(baseDir)
  return baseDir
}

/** Simulates a helper's lifecycle, optionally supplying complete or chunked output asynchronously. */
function mockClipboardHelper(output?: string | Buffer[], exitCode: number | null = 0) {
  const childProcess = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    kill: vi.fn().mockReturnValue(true),
    unref: vi.fn(),
  })

  childProcessMock.spawn.mockImplementationOnce(() => {
    if (output !== undefined) {
      queueMicrotask(() => {
        const chunks = typeof output === 'string' ? [Buffer.from(output)] : output
        for (const chunk of chunks) childProcess.stdout.emit('data', chunk)
        childProcess.emit('close', exitCode, exitCode === null ? 'SIGTERM' : null)
      })
    }
    return childProcess
  })
  return childProcess
}

describe('getClipboardImage', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
  })

  afterEach(async () => {
    Object.defineProperty(process, 'platform', originalPlatform)
    platformMock.isWsl = false
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.resetAllMocks()
    vi.unstubAllEnvs()
    await Promise.all(baseDirs.map(baseDir => fs.remove(baseDir)))
    baseDirs.length = 0
  })

  it('uses an existing absolute file path from clipboard text when no image data is found', async () => {
    const baseDir = createBaseDir()
    const imagePath = path.join(baseDir, 'copied image.png')
    await fs.outputFile(imagePath, 'image')
    mockClipboardHelper('no image')
    mockClipboardHelper(`"${imagePath}"\r\n`)

    const result = await getClipboardImage({
      baseDir,
      emit: vi.fn(),
    } as any)

    expect(result).toEqual({
      imgPath: imagePath,
      shouldKeepAfterUploading: true,
    })
  })

  it('uses an existing file URL from clipboard text when no image data is found', async () => {
    const baseDir = createBaseDir()
    const imagePath = path.join(baseDir, 'copied image url.png')
    await fs.outputFile(imagePath, 'image')
    mockClipboardHelper('no image')
    mockClipboardHelper(`${pathToFileURL(imagePath).href}\r\n`)

    const result = await getClipboardImage({
      baseDir,
      emit: vi.fn(),
    } as any)

    expect(result).toEqual({
      imgPath: imagePath,
      shouldKeepAfterUploading: true,
    })
  })

  it('normalizes file URLs returned by clipboard image scripts', async () => {
    const baseDir = createBaseDir()
    const imagePath = path.join(baseDir, 'script image url.png')
    await fs.outputFile(imagePath, 'image')
    mockClipboardHelper(pathToFileURL(imagePath).href)

    const result = await getClipboardImage({
      baseDir,
      emit: vi.fn(),
    } as any)

    expect(result).toEqual({
      imgPath: imagePath,
      shouldKeepAfterUploading: true,
    })
  })

  it('decodes percent-encoded absolute paths returned by clipboard image scripts', async () => {
    const baseDir = createBaseDir()
    const imagePath = path.join(baseDir, 'script encoded image.png')
    await fs.outputFile(imagePath, 'image')
    mockClipboardHelper(imagePath.replaceAll(' ', '%20'))

    const result = await getClipboardImage({
      baseDir,
      emit: vi.fn(),
    } as any)

    expect(result).toEqual({
      imgPath: imagePath,
      shouldKeepAfterUploading: true,
    })
  })

  it('keeps literal percent-encoded paths when that file exists', async () => {
    const baseDir = createBaseDir()
    const imagePath = path.join(baseDir, 'script%20literal.png')
    await fs.outputFile(imagePath, 'image')
    mockClipboardHelper(imagePath)

    const result = await getClipboardImage({
      baseDir,
      emit: vi.fn(),
    } as any)

    expect(result).toEqual({
      imgPath: imagePath,
      shouldKeepAfterUploading: true,
    })
  })

  it('keeps no image when clipboard text is not an absolute file path', async () => {
    const baseDir = createBaseDir()
    mockClipboardHelper('no image')
    mockClipboardHelper('relative-image.png')

    const result = await getClipboardImage({
      baseDir,
      emit: vi.fn(),
    } as any)

    expect(result).toEqual({
      imgPath: 'no image',
      shouldKeepAfterUploading: false,
    })
  })

  it.each([0, 1, null])('rejects a helper that closes with code %s and no stdout', async exitCode => {
    vi.useFakeTimers()
    vi.stubEnv('XDG_SESSION_TYPE', undefined)
    const child = mockClipboardHelper()
    const task = getClipboardImage({ baseDir: createBaseDir(), emit: vi.fn() } as any)
    const rejection = expect(task).rejects.toThrow(exitCode === 0 ? 'returned no result' : 'Clipboard helper failed')

    child.emit('close', exitCode, exitCode === null ? 'SIGTERM' : null)

    await rejection
    expect(vi.getTimerCount()).toBe(0)
    expect(child.stdout.listenerCount('data')).toBe(0)
    expect(child.listenerCount('error')).toBe(0)
    expect(child.listenerCount('close')).toBe(0)
    expect(childProcessMock.spawn).toHaveBeenCalledTimes(1)
  })

  it('rejects whitespace-only output', async () => {
    mockClipboardHelper(' \r\n\t')
    await expect(getClipboardImage({ baseDir: createBaseDir(), emit: vi.fn() } as any)).rejects.toThrow(
      'Clipboard helper returned no result',
    )
  })

  it('handles spawn errors and subsequent events without exposing error details', async () => {
    vi.useFakeTimers()
    const child = mockClipboardHelper()
    const ctx = { baseDir: createBaseDir(), emit: vi.fn() }
    const task = getClipboardImage(ctx as any)
    const rejection = expect(task).rejects.toThrow(/^Clipboard helper failed$/)

    expect(() => child.emit('error', new Error('ENOENT: synthetic-sensitive-argument'))).not.toThrow()
    child.stdout.emit('data', Buffer.from('no xclip'))
    expect(() => child.emit('error', new Error('late termination error'))).not.toThrow()
    child.emit('close', -1, null)

    await rejection
    expect(ctx.emit).not.toHaveBeenCalled()
    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(child.stdout.listenerCount('data')).toBe(0)
    expect(child.stdout.listenerCount('error')).toBe(0)
    expect(child.listenerCount('error')).toBe(0)
  })

  it('sanitizes synchronous spawn failures', async () => {
    childProcessMock.spawn.mockImplementationOnce(() => {
      throw new Error('synthetic-sensitive-argument')
    })
    await expect(getClipboardImage({ baseDir: createBaseDir(), emit: vi.fn() } as any)).rejects.toThrow(
      /^Unable to start clipboard helper$/,
    )
  })

  it.each(['silent exit', 'missing executable'])('handles a real child process with a %s', async scenario => {
    const { spawn } = await vi.importActual<typeof import('node:child_process')>('node:child_process')
    const baseDir = createBaseDir()
    childProcessMock.spawn.mockImplementationOnce((_command, _args, options) =>
      scenario === 'silent exit'
        ? spawn(process.execPath, ['-e', 'process.exit(1)'], options)
        : spawn(path.join(baseDir, 'missing-clipboard-helper'), [], options),
    )

    await expect(getClipboardImage({ baseDir, emit: vi.fn() } as any)).rejects.toThrow(/^Clipboard helper failed$/)
  })

  it('handles stdout errors while stopping the helper', async () => {
    const child = mockClipboardHelper()
    const task = getClipboardImage({ baseDir: createBaseDir(), emit: vi.fn() } as any)
    const rejection = expect(task).rejects.toThrow(/^Clipboard helper failed$/)
    expect(() => child.stdout.emit('error', new Error('stream error'))).not.toThrow()
    child.emit('close', 0, null)
    await rejection
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('stops helpers whose buffered output exceeds the size limit', async () => {
    vi.useFakeTimers()
    const child = mockClipboardHelper()
    const task = getClipboardImage({ baseDir: createBaseDir(), emit: vi.fn() } as any)
    const rejection = expect(task).rejects.toThrow(/^Clipboard helper output exceeded the limit$/)
    child.stdout.emit('data', Buffer.alloc(1024 * 1024))
    expect(child.kill).not.toHaveBeenCalled()
    child.stdout.emit('data', Buffer.from('x'))

    await rejection
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(child.stdout.destroyed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    child.emit('close', null, 'SIGKILL')
  })

  it('buffers UTF-8 paths across data chunks and waits until close', async () => {
    const baseDir = createBaseDir()
    const imagePath = path.join(baseDir, 'copied 图片.png')
    await fs.outputFile(imagePath, 'image')
    vi.useFakeTimers()
    const child = mockClipboardHelper()
    const task = getClipboardImage({ baseDir, emit: vi.fn() } as any)
    const resolved = vi.fn()
    void task.then(resolved)
    const output = Buffer.from(`${imagePath}\r\n`)
    const split = output.indexOf(Buffer.from('图')) + 1

    child.stdout.emit('data', output.subarray(0, split))
    child.stdout.emit('data', output.subarray(split))
    child.emit('exit', 0, null)
    await Promise.resolve()
    expect(resolved).not.toHaveBeenCalled()
    child.emit('close', 0, null)

    await expect(task).resolves.toEqual({ imgPath: imagePath, shouldKeepAfterUploading: true })
    expect(resolved).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(child.stdout.listenerCount('data')).toBe(0)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it.each([1, 2, null])('rejects an unsuccessful exit %s even after a valid path is printed', async exitCode => {
    const baseDir = createBaseDir()
    const imagePath = path.join(baseDir, 'existing.png')
    await fs.outputFile(imagePath, 'image')
    mockClipboardHelper(imagePath, exitCode)
    await expect(getClipboardImage({ baseDir, emit: vi.fn() } as any)).rejects.toThrow(/^Clipboard helper failed$/)
  })

  it('preserves the Windows 10 exit-code-1 convention for valid image paths', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    vi.spyOn(os, 'release').mockReturnValue('10.0.0')
    const baseDir = createBaseDir()
    const imagePath = path.join(baseDir, 'windows-image.png')
    await fs.outputFile(imagePath, 'image')
    mockClipboardHelper(imagePath, 1)

    await expect(getClipboardImage({ baseDir, emit: vi.fn() } as any)).resolves.toEqual({
      imgPath: imagePath,
      shouldKeepAfterUploading: true,
    })
    expect(childProcessMock.spawn).toHaveBeenCalledWith(
      'powershell',
      expect.arrayContaining([path.join(baseDir, 'windows10.ps1')]),
      expect.objectContaining({ windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }),
    )
  })

  it('rejects blank Windows 10 output despite its legacy success exit code', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    vi.spyOn(os, 'release').mockReturnValue('10.0.0')
    mockClipboardHelper('', 1)
    await expect(getClipboardImage({ baseDir: createBaseDir(), emit: vi.fn() } as any)).rejects.toThrow(
      /^Clipboard helper returned no result$/,
    )
  })

  it.each(['darwin', 'wsl'])('rejects exit code 1 for no image on %s', async platform => {
    Object.defineProperty(process, 'platform', { value: platform === 'wsl' ? 'linux' : platform })
    platformMock.isWsl = platform === 'wsl'
    mockClipboardHelper('no image', 1)
    await expect(getClipboardImage({ baseDir: createBaseDir(), emit: vi.fn() } as any)).rejects.toThrow(
      /^Clipboard helper failed$/,
    )
    expect(childProcessMock.spawn).toHaveBeenCalledTimes(1)
  })

  it('bounds WSL path conversion after a successful image helper exits', async () => {
    platformMock.isWsl = true
    vi.useFakeTimers()
    const baseDir = createBaseDir()
    // Use an existing path after conversion on any host so the fixture is portable.
    const imagePath = path.join(baseDir, 'wsl-image.png')
    fs.outputFileSync(imagePath, 'image')
    mockClipboardHelper('C:\\clipboard\\image.png', 0)
    mockClipboardHelper(imagePath)

    await expect(getClipboardImage({ baseDir, emit: vi.fn() } as any)).resolves.toEqual({
      imgPath: imagePath,
      shouldKeepAfterUploading: true,
    })
    expect(childProcessMock.spawn).toHaveBeenLastCalledWith(
      'wslpath',
      ['-u', '-a', 'C:\\clipboard\\image.png'],
      expect.any(Object),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles when WSL path conversion times out', async () => {
    platformMock.isWsl = true
    vi.useFakeTimers()
    const baseDir = createBaseDir()
    const missingPath = `C:\\${path.basename(baseDir)}\\missing.png`
    mockClipboardHelper(missingPath)
    const conversionChild = mockClipboardHelper()
    const task = getClipboardImage({ baseDir, emit: vi.fn() } as any)
    const rejection = expect(task).rejects.toThrow(/^Clipboard image file does not exist$/)

    await vi.advanceTimersByTimeAsync(10_000)

    await rejection
    expect(conversionChild.kill).toHaveBeenCalledWith('SIGKILL')
    expect(vi.getTimerCount()).toBe(0)
    conversionChild.emit('close', null, 'SIGKILL')
  })

  it.each([
    ['linux', '6.0.0'],
    ['win32', '6.1.0'],
    ['win32', '10.0.0'],
  ])('preserves text fallback for no image with exit code 1 on %s %s', async (platform, release) => {
    Object.defineProperty(process, 'platform', { value: platform })
    vi.spyOn(os, 'release').mockReturnValue(release)
    vi.stubEnv('XDG_SESSION_TYPE', 'wayland')
    const baseDir = createBaseDir()
    const imagePath = path.join(baseDir, 'clipboard-text.png')
    await fs.outputFile(imagePath, 'image')
    mockClipboardHelper([Buffer.from('no '), Buffer.from('image\r\n')], 1)
    mockClipboardHelper(imagePath)

    await expect(getClipboardImage({ baseDir, emit: vi.fn() } as any)).resolves.toEqual({
      imgPath: imagePath,
      shouldKeepAfterUploading: true,
    })
    expect(childProcessMock.spawn).toHaveBeenCalledTimes(2)
  })

  it.each(['no xclip', 'no wl-clipboard', 'no xclip or wl-clipboard'])(
    'notifies once when the Linux helper reports %s',
    async output => {
      const child = mockClipboardHelper([Buffer.from(output.slice(0, 3)), Buffer.from(output.slice(3))], 1)
      const ctx = { baseDir: createBaseDir(), emit: vi.fn() }

      await expect(getClipboardImage(ctx as any)).rejects.toThrow('Please install xclip')
      child.emit('close', 1, null)
      expect(ctx.emit).toHaveBeenCalledExactlyOnceWith(IBuildInEvent.NOTIFICATION, {
        title: 'xclip or wl-clipboard not found',
        body: 'Please install xclip(for x11) or wl-clipboard(for wayland) before run picgo',
      })
      expect(childProcessMock.spawn).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['silent', 'output without close', 'kill failure'])(
    'times out a helper with %s without waiting for termination',
    async scenario => {
      vi.useFakeTimers()
      const child = mockClipboardHelper()
      const ctx = { baseDir: createBaseDir(), emit: vi.fn() }
      const task = getClipboardImage(ctx as any)
      const rejection = expect(task).rejects.toThrow(/^Clipboard helper timed out$/)
      if (scenario === 'output without close') child.stdout.emit('data', Buffer.from('no image'))
      if (scenario === 'kill failure') {
        child.kill.mockImplementation(() => {
          throw new Error('cannot kill')
        })
      }

      await vi.advanceTimersByTimeAsync(10_000)

      await rejection
      expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
      expect(child.stdout.destroyed).toBe(true)
      expect(child.unref).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
      expect(childProcessMock.spawn).toHaveBeenCalledTimes(1)
      expect(() => child.emit('error', new Error('late kill error'))).not.toThrow()
      child.stdout.emit('data', Buffer.from('no xclip'))
      child.emit('close', 0, null)
      expect(ctx.emit).not.toHaveBeenCalled()
      expect(child.kill).toHaveBeenCalledTimes(1)
      expect(child.listenerCount('error')).toBe(0)
      expect(child.listenerCount('close')).toBe(0)
    },
  )

  it.each(['error', 'timeout', 'nonzero exit'])('keeps no image when the text fallback has an %s', async failure => {
    vi.useFakeTimers()
    mockClipboardHelper('no image')
    const textChild = mockClipboardHelper()
    const task = getClipboardImage({ baseDir: createBaseDir(), emit: vi.fn() } as any)
    const result = expect(task).resolves.toEqual({ imgPath: 'no image', shouldKeepAfterUploading: false })
    await vi.advanceTimersByTimeAsync(0)
    expect(childProcessMock.spawn).toHaveBeenCalledTimes(2)

    if (failure === 'timeout') await vi.advanceTimersByTimeAsync(10_000)
    else if (failure === 'error') textChild.emit('error', new Error('ENOENT'))
    else textChild.emit('close', 1, null)

    await result
    expect(vi.getTimerCount()).toBe(0)
    if (failure === 'timeout') expect(textChild.kill).toHaveBeenCalledWith('SIGKILL')
    textChild.emit('close', 1, null)
  })

  it('rejects invalid Windows 10 results without including clipboard contents', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    vi.spyOn(os, 'release').mockReturnValue('10.0.0')
    mockClipboardHelper('synthetic-sensitive-clipboard-value', 1)
    await expect(getClipboardImage({ baseDir: createBaseDir(), emit: vi.fn() } as any)).rejects.toThrow(
      /^Clipboard image file does not exist$/,
    )
  })
})
