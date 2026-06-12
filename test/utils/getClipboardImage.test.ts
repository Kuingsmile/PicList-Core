import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import fs from 'fs-extra'
import { afterEach, describe, expect, it, vi } from 'vitest'

import getClipboardImage from '../../src/utils/getClipboardImage'

const childProcessMock = vi.hoisted(() => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}))

vi.mock('node:child_process', () => childProcessMock)
vi.mock('../../src/utils/clipboard/linux.sh', () => ({ default: 'linux clipboard script' }))
vi.mock('../../src/utils/clipboard/mac.applescript', () => ({ default: 'mac clipboard script' }))
vi.mock('../../src/utils/clipboard/windows.ps1', () => ({ default: 'windows clipboard script' }))
vi.mock('../../src/utils/clipboard/windows10.ps1', () => ({ default: 'windows10 clipboard script' }))
vi.mock('../../src/utils/clipboard/wsl.sh', () => ({ default: 'wsl clipboard script' }))

const baseDirs: string[] = []

function createBaseDir(): string {
  const baseDir = path.join(os.tmpdir(), `piclist-clipboard-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  baseDirs.push(baseDir)
  return baseDir
}

function mockClipboardImageScriptOutput(output: string): void {
  const stdout = new EventEmitter()
  const childProcess = new EventEmitter() as EventEmitter & { stdout: EventEmitter }
  childProcess.stdout = stdout

  childProcessMock.spawn.mockImplementationOnce(() => {
    queueMicrotask(() => stdout.emit('data', Buffer.from(output)))
    return childProcess
  })
}

function mockClipboardTextOutput(output: string): void {
  childProcessMock.execFile.mockImplementationOnce(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, output, '')
      return {} as any
    },
  )
}

describe('getClipboardImage', () => {
  afterEach(async () => {
    vi.clearAllMocks()
    await Promise.all(baseDirs.map(baseDir => fs.remove(baseDir)))
    baseDirs.length = 0
  })

  it('uses an existing absolute file path from clipboard text when no image data is found', async () => {
    const baseDir = createBaseDir()
    const imagePath = path.join(baseDir, 'copied image.png')
    await fs.outputFile(imagePath, 'image')
    mockClipboardImageScriptOutput('no image')
    mockClipboardTextOutput(`"${imagePath}"\r\n`)

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
    mockClipboardImageScriptOutput('no image')
    mockClipboardTextOutput(`${pathToFileURL(imagePath).href}\r\n`)

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
    mockClipboardImageScriptOutput(pathToFileURL(imagePath).href)

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
    mockClipboardImageScriptOutput(imagePath.replaceAll(' ', '%20'))

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
    mockClipboardImageScriptOutput(imagePath)

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
    mockClipboardImageScriptOutput('no image')
    mockClipboardTextOutput('relative-image.png')

    const result = await getClipboardImage({
      baseDir,
      emit: vi.fn(),
    } as any)

    expect(result).toEqual({
      imgPath: 'no image',
      shouldKeepAfterUploading: false,
    })
  })
})
