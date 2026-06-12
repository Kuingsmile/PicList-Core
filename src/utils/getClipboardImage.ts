import { execFile, spawn } from 'node:child_process'
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

function createImageFolder(ctx: IPicGo): void {
  const imagePath = path.join(ctx.baseDir, CLIPBOARD_IMAGE_FOLDER)
  ensureDirSync(imagePath)
}

const stripEnclosingQuotes = (value: string): string => {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim()
  }

  return value
}

const getSingleClipboardTextLine = (value: string): string | undefined => {
  const lines = value
    .trim()
    .split(/\r?\n/)
    .map(line => stripEnclosingQuotes(line.trim()))
    .filter(Boolean)

  return lines.length === 1 ? lines[0] : undefined
}

const isExistingAbsoluteFile = (filePath: string): boolean => {
  if (!path.isAbsolute(filePath)) return false

  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

const decodeFilePath = (filePath: string): string | undefined => {
  try {
    return decodeURIComponent(filePath)
  } catch {
    return
  }
}

const getExistingClipboardFilePath = (filePath: string): string | undefined => {
  if (isExistingAbsoluteFile(filePath)) return filePath

  const decodedFilePath = decodeFilePath(filePath)
  if (decodedFilePath && decodedFilePath !== filePath && isExistingAbsoluteFile(decodedFilePath)) {
    return decodedFilePath
  }
}

const isWindowsAbsolutePath = (filePath: string): boolean => /^[a-zA-Z]:[\\/]/.test(filePath) || /^\\\\/.test(filePath)

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

const execFileText = async (command: string, args: string[]): Promise<string> => {
  return await new Promise<string>(resolve => {
    execFile(command, args, { encoding: 'utf8', windowsHide: true }, (error, stdout) => {
      if (error) return resolve('')

      resolve(stdout.toString())
    })
  })
}

const getWindowsClipboardText = async (command = 'powershell'): Promise<string> => {
  const script = [
    '[console]::OutputEncoding = New-Object System.Text.UTF8Encoding',
    "try { Get-Clipboard -Raw -Format Text } catch { '' }",
  ].join('; ')

  return await execFileText(command, [
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

const getClipboardText = async (platform: Platform): Promise<string> => {
  switch (platform) {
    case 'darwin':
      return await execFileText('osascript', [
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
        return await execFileText('wl-paste', ['--no-newline'])
      }

      return await execFileText('xclip', ['-selection', 'clipboard', '-o'])
  }
}

const convertWindowsPathToWsl = async (filePath: string): Promise<string> => {
  if (!isWindowsAbsolutePath(filePath)) return filePath

  return (await execFileText('wslpath', ['-u', '-a', filePath])).trim() || filePath
}

const normalizeClipboardFilePath = async (filePath: string, platform: Platform): Promise<string> => {
  let normalizedPath = fileUrlToLocalPath(filePath, platform) || filePath

  if (platform === 'wsl') {
    normalizedPath = await convertWindowsPathToWsl(normalizedPath)
  }

  return normalizedPath
}

const getClipboardTextFilePath = async (platform: Platform): Promise<string | undefined> => {
  const clipboardText = await getClipboardText(platform)
  let filePath = getSingleClipboardTextLine(clipboardText)

  if (filePath) {
    filePath = await normalizeClipboardFilePath(filePath, platform)
  }
  if (!filePath) return

  return getExistingClipboardFilePath(filePath)
}

const isLinuxClipboardToolMissing = (platform: Platform, imgPath: string): boolean => {
  return platform === 'linux' && ['no xclip', 'no wl-clipboard', 'no xclip or wl-clipboard'].includes(imgPath)
}

// Thanks to vs-picgo: https://github.com/Spades-S/vs-picgo/blob/master/src/extension.ts
const getClipboardImage = async (ctx: IPicGo): Promise<IClipboardImage> => {
  createImageFolder(ctx)
  // add an clipboard image folder to control the image cache file
  const imagePath = path.join(ctx.baseDir, CLIPBOARD_IMAGE_FOLDER, `${dayjs().format('YYYYMMDDHHmmssSSS')}.png`)
  return await new Promise<IClipboardImage>((resolve: any, reject: any): void => {
    const platform = getCurrentPlatform()
    const scriptPath = path.join(ctx.baseDir, platform2ScriptFilename[platform])
    // If the script does not exist yet, we need to write the content to the script file
    if (!fs.existsSync(scriptPath)) {
      fs.writeFileSync(scriptPath, platform2ScriptContent[platform], 'utf8')
    }
    let execution
    if (platform === 'darwin') {
      execution = spawn('osascript', [scriptPath, imagePath])
    } else if (platform === 'win32' || platform === 'win10') {
      execution = spawn('powershell', [
        '-noprofile',
        '-noninteractive',
        '-nologo',
        '-sta',
        '-executionpolicy',
        'unrestricted',
        // fix windows 10 native cmd crash bug when "picgo upload"
        // https://github.com/PicGo/PicGo-Core/issues/32
        // '-windowstyle','hidden',
        // '-noexit',
        '-file',
        scriptPath,
        imagePath,
      ])
    } else {
      execution = spawn('sh', [scriptPath, imagePath])
    }

    execution.stdout.on('data', (data: Buffer) => {
      void (async (): Promise<void> => {
        let imgPath = data.toString().trim()

        if (isLinuxClipboardToolMissing(platform, imgPath)) {
          ctx.emit(IBuildInEvent.NOTIFICATION, {
            title: 'xclip or wl-clipboard not found',
            body: 'Please install xclip(for x11) or wl-clipboard(for wayland) before run picgo',
          })
          return reject(new Error('Please install xclip(for x11) or wl-clipboard(for wayland) before run picgo'))
        }

        if (imgPath !== 'no image') {
          imgPath = await normalizeClipboardFilePath(imgPath, platform)
          imgPath = getExistingClipboardFilePath(imgPath) || imgPath
        }

        if (imgPath === 'no image') {
          imgPath = (await getClipboardTextFilePath(platform)) || imgPath
        }

        // if the filePath is the real file in system
        // we should keep it instead of removing
        let shouldKeepAfterUploading = false

        // in macOS if your copy the file in system, it's basename will not equal to our default basename
        if (path.basename(imgPath) !== path.basename(imagePath)) {
          // if the path is not generate by picgo
          // but the path exists, we should keep it
          if (fs.existsSync(imgPath)) {
            shouldKeepAfterUploading = true
          }
        }
        // if the imgPath is invalid
        if (imgPath !== 'no image' && !fs.existsSync(imgPath)) {
          return reject(new Error(`Can't find ${imgPath}`))
        }

        resolve({
          imgPath,
          shouldKeepAfterUploading,
        })
      })().catch(reject)
    })
  })
}

export default getClipboardImage
