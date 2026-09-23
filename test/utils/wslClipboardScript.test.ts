import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

import fs from 'fs-extra'
import { afterEach, describe, expect, it } from 'vitest'

import wslClipboardScript from '../../src/utils/clipboard/wsl.sh'

const hasSh = spawnSync('sh', ['-c', 'exit 0']).status === 0
const baseDirs: string[] = []
const shellPath = (value: string): string => value.split(path.sep).join('/')

afterEach(async () => {
  await Promise.all(baseDirs.splice(0).map(baseDir => fs.remove(baseDir)))
})

describe.skipIf(!hasSh)('WSL clipboard shell contract', () => {
  it.each(['20260922123456789.png', 'image with spaces.png', 'x.png', 'no image'])(
    'preserves helper and destination arguments for %s',
    output => {
      const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piclist-wsl-'))
      baseDirs.push(baseDir)
      const helperDir = path.join(baseDir, 'clipboard helpers with spaces')
      const binDir = path.join(baseDir, 'bin')
      const scriptPath = path.join(helperDir, 'wsl.sh')
      const scriptUnixPath = shellPath(path.join(helperDir, 'windows10.ps1'))
      const imageUnixDir = shellPath(path.join(baseDir, 'clipboard images with spaces'))
      const imageName = output === 'no image' ? '20260922123456789.png' : output
      const imageUnixPath = `${imageUnixDir}/${imageName}`
      const scriptWindowsPath = 'C:\\clipboard helpers with spaces\\windows10.ps1'
      const imageWindowsDir = 'C:\\clipboard images with spaces'
      const imageWindowsPath = `${imageWindowsDir}\\${imageName}`
      const powershellArgs = path.join(baseDir, 'powershell-args')
      const wslpathArgs = path.join(baseDir, 'wslpath-args')

      fs.outputFileSync(scriptPath, wslClipboardScript)
      fs.outputFileSync(
        path.join(binDir, 'wslpath'),
        `#!/bin/sh
printf '%s\\n' "$@" >> "$WSLPATH_ARGS"
case "$1" in
  -w)
    [ "$#" -eq 2 ] || exit 2
    case "$2" in
      "$SCRIPT_UNIX_PATH") printf '%s\\n' "$SCRIPT_WINDOWS_PATH" ;;
      "$IMAGE_UNIX_DIR") printf '%s\\n' "$IMAGE_WINDOWS_DIR" ;;
      *) exit 3 ;;
    esac ;;
  -u)
    [ "$#" -eq 3 ] && [ "$2" = '-a' ] && [ "$3" = "$IMAGE_WINDOWS_PATH" ] || exit 4
    printf '%s\\n' "$IMAGE_UNIX_PATH" ;;
  *) exit 5 ;;
esac
`,
        { mode: 0o755 },
      )
      fs.outputFileSync(
        path.join(binDir, 'powershell.exe'),
        `#!/bin/sh
printf '%s\\n' "$@" > "$POWERSHELL_ARGS"
printf '%s\\r\\n' "$POWERSHELL_RESULT"
exit 1
`,
        { mode: 0o755 },
      )

      const result = spawnSync('sh', [shellPath(scriptPath), imageUnixPath], {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          POWERSHELL_ARGS: shellPath(powershellArgs),
          WSLPATH_ARGS: shellPath(wslpathArgs),
          SCRIPT_UNIX_PATH: scriptUnixPath,
          SCRIPT_WINDOWS_PATH: scriptWindowsPath,
          IMAGE_UNIX_DIR: imageUnixDir,
          IMAGE_WINDOWS_DIR: imageWindowsDir,
          IMAGE_UNIX_PATH: imageUnixPath,
          IMAGE_WINDOWS_PATH: imageWindowsPath,
          POWERSHELL_RESULT: output === 'no image' ? output : imageWindowsPath,
        },
      })

      expect(result.error).toBeUndefined()
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      expect(result.stdout).toBe(`${output === 'no image' ? output : imageUnixPath}\n`)
      expect(fs.readFileSync(powershellArgs, 'utf8').trimEnd().split('\n')).toEqual([
        '-noprofile',
        '-noninteractive',
        '-nologo',
        '-sta',
        '-executionpolicy',
        'unrestricted',
        '-file',
        scriptWindowsPath,
        imageWindowsPath,
      ])
      expect(fs.readFileSync(wslpathArgs, 'utf8').trimEnd().split('\n')).toEqual([
        '-w',
        scriptUnixPath,
        '-w',
        imageUnixDir,
        ...(output === 'no image' ? [] : ['-u', '-a', imageWindowsPath]),
      ])
    },
  )
})
