import { spawn } from 'node:child_process'

import isWsl from 'is-wsl'

/** Writes text to a clipboard helper through stdin and kills helpers that exceed five seconds. */
function write(command: string, args: string[], value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true })
    const failed = () => reject(new Error('Clipboard unavailable'))
    const timer = setTimeout(() => {
      child.kill()
      failed()
    }, 5000)
    child.on('error', () => {
      clearTimeout(timer)
      failed()
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else failed()
    })
    child.stdin.on('error', failed)
    // Pass text on stdin, never as executable shell text or command arguments.
    child.stdin.end(value, 'utf8')
  })
}

/** Copies text using the host clipboard backend, falling back from Wayland to X11 tools on Linux. */
export async function copyText(value: string): Promise<void> {
  if (process.platform === 'win32' || isWsl) {
    return write(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$ErrorActionPreference = 'Stop'; [Console]::InputEncoding = New-Object System.Text.UTF8Encoding; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
      ],
      value,
    )
  }
  if (process.platform === 'darwin') return write('pbcopy', [], value)
  if (process.env.WAYLAND_DISPLAY) {
    try {
      await write('wl-copy', [], value)
      return
    } catch {
      /* Try X11 when the Wayland clipboard is unavailable. */
    }
  }
  try {
    await write('xclip', ['-selection', 'clipboard'], value)
  } catch {
    await write('xsel', ['--clipboard', '--input'], value)
  }
}

/** Removes backup labeling and optionally formats the result as an escaped Markdown image destination. */
export function resultLink(result: string, markdown = false): string {
  const value = result.replace(/^Backup: /, '')
  if (!markdown) return value
  // Angle-bracket destinations tolerate parentheses; encode delimiters and whitespace.
  return `![](<${value.replace(/\\/g, '/').replace(/[<>\s]/g, char => encodeURIComponent(char))}>)`
}
