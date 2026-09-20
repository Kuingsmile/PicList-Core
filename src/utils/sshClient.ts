import path from 'node:path'

import type { Config } from 'node-ssh-no-cpu-features'
import { NodeSSH } from 'node-ssh-no-cpu-features'

import type { ISftpPlistConfig } from '../types'

/** Quotes a remote POSIX shell argument without expansion and rejects embedded null bytes. */
const quoteShellArgument = (value: string): string => {
  if (value.includes('\0')) {
    throw new Error('SSH command arguments must not contain null bytes')
  }
  // POSIX single quotes prevent expansion; embedded quotes must be escaped outside them.
  return `'${value.replace(/'/g, "'\\''")}'`
}

/** SSH/SFTP connection wrapper used to create remote directories, upload files, and set ownership. */
class SSHClient {
  private client = new NodeSSH()
  isConnected = false

  private static changeWinStylePathToUnix(path: string): string {
    return path.replace(/\\/g, '/')
  }

  /** Connects using a private-key file or password and records successful connection state. */
  public async connect(config: ISftpPlistConfig): Promise<void> {
    const { host, port, username, password, privateKey, passphrase } = config
    const loginInfo: Config = privateKey
      ? {
          username,
          privateKeyPath: privateKey,
          passphrase: passphrase || undefined,
        }
      : { username, password }
    try {
      await this.client.connect({
        host,
        port: Number(port) || 22,
        ...loginInfo,
      })
      this.isConnected = true
    } catch (err: any) {
      throw new Error(err, { cause: err })
    }
  }

  /**
   * Creates the remote parent directory, uploads a local file, and optionally applies a custom file
   * mode.
   *
   * @throws If no connection is active or the SFTP operation fails.
   */
  public async upload(local: string, remote: string, config: ISftpPlistConfig): Promise<void> {
    if (!this.isConnected) {
      throw new Error('SSH client is not connected')
    }
    try {
      remote = SSHClient.changeWinStylePathToUnix(remote)
      await this.mkdir(path.dirname(remote).replace(/^\/+|\/+$/g, ''), config)
      await this.client.putFile(local, remote)
      const fileMode = config.fileMode || '0644'
      if (fileMode !== '0644') {
        await this.exec(`chmod -- ${quoteShellArgument(String(fileMode))} ${quoteShellArgument(remote)}`)
      }
    } catch (err: any) {
      throw new Error(err, { cause: err })
    }
  }

  /** Creates remote parent directories, applying custom permissions when configured. */
  private async mkdir(dirPath: string, config: ISftpPlistConfig): Promise<void> {
    if (!this.client.isConnected()) {
      throw new Error('sftp client is not connected')
    }
    const directoryMode = config.dirMode || '0755'
    if (directoryMode !== '0755') {
      const dirs = dirPath.split('/')
      let currentPath = ''
      for (const dir of dirs) {
        if (dir) {
          currentPath += `/${dir}`
          const quotedPath = quoteShellArgument(currentPath)
          const script = `mkdir -- ${quotedPath} && chmod -- ${quoteShellArgument(String(directoryMode))} ${quotedPath}`
          await this.exec(script)
        }
      }
    } else {
      const script = `cd / && mkdir -p -- ${quoteShellArgument(dirPath)}`
      await this.exec(script)
    }
  }

  /** Sets remote ownership using a supplied group, a user:group pair, or the username as its group. */
  public async chown(remote: string, user: string, group?: string): Promise<void> {
    remote = SSHClient.changeWinStylePathToUnix(remote)
    const [_user, _group] = group ? [user, group] : user.includes(':') ? user.split(':') : [user, user]

    await this.exec(`chown -- ${quoteShellArgument(`${_user}:${_group}`)} ${quoteShellArgument(remote)}`)
  }

  /** Runs a remote shell command and reports whether its exit code is zero. */
  private async exec(script: string): Promise<boolean> {
    const execResult = await this.client.execCommand(script)
    return execResult.code === 0
  }

  /** Disposes the SSH connection and resets the wrapper's connection state. */
  public close(): void {
    this.client.dispose()
    this.isConnected = false
  }
}

export default SSHClient
