import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dayjs from 'dayjs'
import fs from 'fs-extra'
import { ensureDirSync } from 'fs-extra/esm'
import isWsl from 'is-wsl'

import { IClipboardImage, IPicGo } from '../types'
import linuxClipboardScript from './clipboard/linux.sh'
import macClipboardScript from './clipboard/mac.applescript'
import windowsClipboardScript from './clipboard/windows.ps1'
import windows10ClipboardScript from './clipboard/windows10.ps1'
import wslClipboardScript from './clipboard/wsl.sh'
import { IBuildInEvent } from './enum'
import { CLIPBOARD_IMAGE_FOLDER } from './static'

export type Platform = 'darwin' | 'win32' | 'win10' | 'linux' | 'wsl'

const CLIPBOARD_HELPER_TIMEOUT_MS = 30_000 // 30 seconds
const CLIPBOARD_HELPER_MAX_OUTPUT_BYTES = 1024 * 1024 * 200 // 200 MB

interface ClipboardHelperResult {
  stdout: string
  exitCode: number | null
}

/** Buffers complete helper output and bounds its lifetime without exposing stderr or spawn arguments. */
const runClipboardHelper = async (command: string, args: string[]): Promise<ClipboardHelperResult> => {
  let execution
  try {
    execution = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
  } catch {
    throw new Error('Unable to start clipboard helper')
  }

  return await new Promise<ClipboardHelperResult>((resolve, reject) => {
    const chunks: Buffer[] = []
    let outputBytes = 0
    let settled = false

    const onData = (chunk: Buffer): void => {
      outputBytes += chunk.length
      if (outputBytes > CLIPBOARD_HELPER_MAX_OUTPUT_BYTES) {
        if (settle(new Error('Clipboard helper output exceeded the limit'))) stop()
        return
      }
      chunks.push(chunk)
    }
    const settle = (result: ClipboardHelperResult | Error): boolean => {
      if (settled) return false
      settled = true
      clearTimeout(timer)
      execution.stdout.off('data', onData)
      chunks.length = 0
      if (result instanceof Error) reject(result)
      else resolve(result)
      return true
    }
    const stop = (): void => {
      try {
        execution.kill('SIGKILL')
      } catch {
        // Settlement must not depend on whether the operating system can terminate the helper.
      }
      execution.stdout.destroy()
      execution.unref()
    }
    const onError = (): void => {
      if (settle(new Error('Clipboard helper failed'))) stop()
    }
    const timer = setTimeout(() => {
      if (settle(new Error('Clipboard helper timed out'))) stop()
    }, CLIPBOARD_HELPER_TIMEOUT_MS)

    execution.on('error', onError)
    execution.stdout.on('error', onError)
    execution.stdout.on('data', onData)
    execution.once('close', (exitCode: number | null) => {
      if (!settled) settle({ stdout: Buffer.concat(chunks).toString('utf8'), exitCode })
      // Keep error listeners until close so errors from termination cannot escape after settlement.
      execution.off('error', onError)
      execution.stdout.off('error', onError)
    })
  })
}

/** Selects the clipboard backend, distinguishing WSL and Windows 10 from their host platform names. */
const getCurrentPlatform = (): Platform => {
  const platform = process.platform
  if (isWsl) return 'wsl'
  if (platform === 'win32') {
    return os.release().split('.')[0] === '10' ? 'win10' : 'win32'
  } else if (platform === 'darwin') {
    return 'darwin'
  } else {
    return 'linux'
  }
}

/** Bundled extraction scripts indexed by the clipboard backend selected at runtime. */
const platform2ScriptContent: Record<Platform, string> = {
  darwin: macClipboardScript,
  win32: windowsClipboardScript,
  win10: windows10ClipboardScript,
  linux: linuxClipboardScript,
  wsl: wslClipboardScript,
}

/**
 * powershell will report error if file does not have a '.ps1' extension,
 * so we should keep the extension name consistent with corresponding shell
 */
const platform2ScriptFilename: Record<Platform, string> = {
  darwin: 'mac.applescript',
  win32: 'windows.ps1',
  win10: 'windows10.ps1',
  linux: 'linux.sh',
  wsl: 'wsl.sh',
}

/** Ensures the client-owned clipboard image cache directory exists. */
function createImageFolder(ctx: IPicGo): void {
  const imagePath = path.join(ctx.baseDir, CLIPBOARD_IMAGE_FOLDER)
  ensureDirSync(imagePath)
}

/** Removes one matching pair of surrounding single or double quotes from a pasted path. */
const stripEnclosingQuotes = (value: string): string => {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim()
  }

  return value
}

/** Accepts exactly one nonempty clipboard line after trimming and removing surrounding quotes. */
const getSingleClipboardTextLine = (value: string): string | undefined => {
  const lines = value
    .trim()
    .split(/\r?\n/)
    .map(line => stripEnclosingQuotes(line.trim()))
    .filter(Boolean)

  return lines.length === 1 ? lines[0] : undefined
}

/** Checks for an existing absolute file path, returning false for missing or inaccessible files. */
const isExistingAbsoluteFile = (filePath: string): boolean => {
  if (!path.isAbsolute(filePath)) return false

  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

/** Decodes percent escapes, returning undefined when a clipboard path contains malformed escapes. */
const decodeFilePath = (filePath: string): string | undefined => {
  try {
    return decodeURIComponent(filePath)
  } catch {
    return
  }
}

/** Accepts an existing absolute path directly or after percent decoding. */
const getExistingClipboardFilePath = (filePath: string): string | undefined => {
  if (isExistingAbsoluteFile(filePath)) return filePath

  const decodedFilePath = decodeFilePath(filePath)
  if (decodedFilePath && decodedFilePath !== filePath && isExistingAbsoluteFile(decodedFilePath)) {
    return decodedFilePath
  }
}

const isWindowsAbsolutePath = (filePath: string): boolean => /^[a-zA-Z]:[\\/]/.test(filePath) || /^\\\\/.test(filePath)

/** Extracts Windows drive or UNC paths from file URLs before WSL path conversion. */
const getFileUrlPathForWsl = (fileUrl: URL): string | undefined => {
  let pathname

  try {
    pathname = decodeURIComponent(fileUrl.pathname)
  } catch {
    return
  }

  if (/^\/[a-zA-Z]:\//.test(pathname)) {
    return pathname.slice(1)
  }

  if (fileUrl.hostname) {
    return `\\\\${fileUrl.hostname}${pathname.replaceAll('/', '\\')}`
  }
}

/** Converts a file URL into a native path, handling Windows file URLs specially under WSL. */
const fileUrlToLocalPath = (value: string, platform: Platform): string | undefined => {
  let fileUrl

  try {
    fileUrl = new URL(value)
  } catch {
    return
  }

  if (fileUrl.protocol !== 'file:') return

  if (platform === 'wsl') {
    const wslFileUrlPath = getFileUrlPathForWsl(fileUrl)
    if (wslFileUrlPath) return wslFileUrlPath
  }

  try {
    return fileURLToPath(fileUrl)
  } catch {
    return
  }
}

/** Runs a clipboard helper without a shell and returns UTF-8 stdout, or an empty string on failure. */
const runClipboardTextHelper = async (command: string, args: string[]): Promise<string> => {
  try {
    const { stdout, exitCode } = await runClipboardHelper(command, args)
    return exitCode === 0 ? stdout : ''
  } catch {
    return ''
  }
}

/** Reads raw clipboard text through PowerShell with UTF-8 output. */
const getWindowsClipboardText = async (command = 'powershell'): Promise<string> => {
  const script = [
    '[console]::OutputEncoding = New-Object System.Text.UTF8Encoding',
    "try { Get-Clipboard -Raw -Format Text } catch { '' }",
  ].join('; ')

  return await runClipboardTextHelper(command, [
    '-noprofile',
    '-noninteractive',
    '-nologo',
    '-sta',
    '-executionpolicy',
    'unrestricted',
    '-command',
    script,
  ])
}

/** Reads text with the platform clipboard helper, selecting Wayland or X11 tools on Linux. */
const getClipboardText = async (platform: Platform): Promise<string> => {
  switch (platform) {
    case 'darwin':
      return await runClipboardTextHelper('osascript', [
        '-e',
        'try',
        '-e',
        'the clipboard as text',
        '-e',
        'on error',
        '-e',
        'return ""',
        '-e',
        'end try',
      ])
    case 'win32':
    case 'win10':
      return await getWindowsClipboardText()
    case 'wsl':
      return await getWindowsClipboardText('powershell.exe')
    case 'linux':
      if (process.env.XDG_SESSION_TYPE === 'wayland') {
        return await runClipboardTextHelper('wl-paste', ['--no-newline'])
      }

      return await runClipboardTextHelper('xclip', ['-selection', 'clipboard', '-o'])
  }
}

/** Converts Windows absolute paths with wslpath, retaining the input when conversion yields no output. */
const convertWindowsPathToWsl = async (filePath: string): Promise<string> => {
  if (!isWindowsAbsolutePath(filePath)) return filePath

  return (await runClipboardTextHelper('wslpath', ['-u', '-a', filePath])).trim() || filePath
}

/** Resolves clipboard file URLs and converts Windows paths when running under WSL. */
const normalizeClipboardFilePath = async (filePath: string, platform: Platform): Promise<string> => {
  let normalizedPath = fileUrlToLocalPath(filePath, platform) || filePath

  if (platform === 'wsl') {
    normalizedPath = await convertWindowsPathToWsl(normalizedPath)
  }

  return normalizedPath
}

/**
 * Resolves a single pasted clipboard path to an existing local file when image extraction is
 * unavailable.
 */
const getClipboardTextFilePath = async (platform: Platform): Promise<string | undefined> => {
  const clipboardText = await getClipboardText(platform)
  let filePath = getSingleClipboardTextLine(clipboardText)

  if (filePath) {
    filePath = await normalizeClipboardFilePath(filePath, platform)
  }
  if (!filePath) return

  return getExistingClipboardFilePath(filePath)
}

/** Recognizes missing-tool sentinel messages emitted by the Linux clipboard script. */
const isLinuxClipboardToolMissing = (platform: Platform, imgPath: string): boolean => {
  return platform === 'linux' && ['no xclip', 'no wl-clipboard', 'no xclip or wl-clipboard'].includes(imgPath)
}

// Thanks to vs-picgo: https://github.com/Spades-S/vs-picgo/blob/master/src/extension.ts
/**
 * Extracts a clipboard image or resolves a clipboard file path using platform-specific helpers.
 *
 * @returns The selected path and whether it belongs to the user and must be retained; imgPath may be
 * `no image`.
 * @throws If a helper fails, times out, returns no result, or returns an image path that does not exist.
 */
const getClipboardImage = async (ctx: IPicGo): Promise<IClipboardImage> => {
  createImageFolder(ctx)
  // add an clipboard image folder to control the image cache file
  const imagePath = path.join(ctx.baseDir, CLIPBOARD_IMAGE_FOLDER, `${dayjs().format('YYYYMMDDHHmmssSSS')}.png`)
  const platform = getCurrentPlatform()
  const scriptPath = path.join(ctx.baseDir, platform2ScriptFilename[platform])
  // The WSL launcher also needs the Windows extraction helper beside it.
  const helperPlatforms: Platform[] = platform === 'wsl' ? ['wsl', 'win10'] : [platform]
  for (const helperPlatform of helperPlatforms) {
    const helperPath = path.join(ctx.baseDir, platform2ScriptFilename[helperPlatform])
    if (!fs.existsSync(helperPath)) {
      fs.writeFileSync(helperPath, platform2ScriptContent[helperPlatform], 'utf8')
    }
  }
  let result: ClipboardHelperResult
  if (platform === 'darwin') {
    result = await runClipboardHelper('osascript', [scriptPath, imagePath])
  } else if (platform === 'win32' || platform === 'win10') {
    result = await runClipboardHelper('powershell', [
      '-noprofile',
      '-noninteractive',
      '-nologo',
      '-sta',
      '-executionpolicy',
      'unrestricted',
      '-file',
      scriptPath,
      imagePath,
    ])
  } else {
    result = await runClipboardHelper('sh', [scriptPath, imagePath])
  }

  let imgPath = result.stdout.trim()
  if (isLinuxClipboardToolMissing(platform, imgPath)) {
    ctx.emit(IBuildInEvent.NOTIFICATION, {
      title: 'xclip or wl-clipboard not found',
      body: 'Please install xclip(for x11) or wl-clipboard(for wayland) before run picgo',
    })
    throw new Error('Please install xclip(for x11) or wl-clipboard(for wayland) before run picgo')
  }

  // Windows 10 exits with 1 even on success; Windows and Wayland also use 1 for "no image".
  const legacySuccess =
    result.exitCode === 1 &&
    (platform === 'win10' || (imgPath === 'no image' && (platform === 'win32' || platform === 'linux')))
  if (result.exitCode !== 0 && !legacySuccess) throw new Error('Clipboard helper failed')
  if (!imgPath) throw new Error('Clipboard helper returned no result')

  if (imgPath !== 'no image') {
    imgPath = await normalizeClipboardFilePath(imgPath, platform)
    imgPath = getExistingClipboardFilePath(imgPath) || imgPath
  }

  if (imgPath === 'no image') {
    imgPath = (await getClipboardTextFilePath(platform)) || imgPath
  }

  // Keep existing user files instead of removing them after uploading.
  const shouldKeepAfterUploading = path.basename(imgPath) !== path.basename(imagePath) && fs.existsSync(imgPath)
  if (imgPath !== 'no image' && !fs.existsSync(imgPath)) {
    throw new Error('Clipboard image file does not exist')
  }

  return { imgPath, shouldKeepAfterUploading }
}

export default getClipboardImage
