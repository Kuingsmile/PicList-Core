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
  private preparedDirectories = new Set<string>()
  isConnected = false

  private static changeWinStylePathToUnix(path: string): string {
    return path.replace(/\\/g, '/')
  }

  /** Connects using a private-key file or password and records successful connection state. */
  public async connect(config: ISftpPlistConfig): Promise<void> {
    this.isConnected = false
    this.preparedDirectories.clear()
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
      await this.mkdir(path.posix.dirname(remote).replace(/^\/+|\/+$/g, ''), config)
      await this.client.putFile(local, remote)
      if (config.fileMode) {
        await this.exec(
          `chmod -- ${quoteShellArgument(String(config.fileMode))} ${quoteShellArgument(remote)}`,
          'Setting file permissions',
        )
      }
    } catch (err: any) {
      throw new Error(err, { cause: err })
    }
  }

  /** Prepares each remote directory once per connection and mode, leaving existing permissions intact. */
  private async mkdir(dirPath: string, config: ISftpPlistConfig): Promise<void> {
    if (!this.client.isConnected()) {
      throw new Error('sftp client is not connected')
    }
    if (!dirPath) return
    const directoryMode = config.dirMode || '0755'
    const cacheKey = `${directoryMode}\0${dirPath}`
    if (directoryMode !== '0755') {
      const dirs = dirPath.split('/')
      let currentPath = ''
      for (const dir of dirs) {
        if (dir) {
          currentPath += `/${dir}`
          const directoryKey = `${directoryMode}\0${currentPath.slice(1)}`
          if (this.preparedDirectories.has(directoryKey)) continue
          const quotedPath = quoteShellArgument(currentPath)
          const script = `test -d ${quotedPath} || (mkdir -- ${quotedPath} && chmod -- ${quoteShellArgument(String(directoryMode))} ${quotedPath})`
          await this.exec(script, 'Preparing upload directory')
          this.preparedDirectories.add(directoryKey)
        }
      }
    } else {
      if (this.preparedDirectories.has(cacheKey)) return
      const script = `cd / && mkdir -p -- ${quoteShellArgument(dirPath)}`
      await this.exec(script, 'Preparing upload directory')
      this.preparedDirectories.add(cacheKey)
    }
  }

  /** Sets remote ownership using a supplied group, a user:group pair, or the username as its group. */
  public async chown(remote: string, user: string, group?: string): Promise<void> {
    remote = SSHClient.changeWinStylePathToUnix(remote)
    const [_user, _group] = group ? [user, group] : user.includes(':') ? user.split(':') : [user, user]

    await this.exec(
      `chown -- ${quoteShellArgument(`${_user}:${_group}`)} ${quoteShellArgument(remote)}`,
      'Setting file ownership',
    )
  }

  /** Requires confirmed command success without exposing remote output or command arguments. */
  private async exec(script: string, operation: string): Promise<void> {
    const execResult = await this.client.execCommand(script)
    if (execResult.code !== 0) {
      throw new Error(`${operation} failed (exit code: ${execResult.code ?? 'unavailable'})`)
    }
  }

  /** Disposes the SSH connection and resets the wrapper's connection state. */
  public close(): void {
    try {
      this.client.dispose()
    } finally {
      this.isConnected = false
      this.preparedDirectories.clear()
    }
  }
}

export default SSHClient
