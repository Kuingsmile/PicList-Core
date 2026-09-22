import { randomUUID } from 'node:crypto'
import path from 'node:path'

import type { Config } from 'node-ssh-no-cpu-features'
import { NodeSSH } from 'node-ssh-no-cpu-features'
import type { Stats } from 'ssh2-no-cpu-features'

import type { ISftpPlistConfig } from '../types'

type SFTP = Awaited<ReturnType<NodeSSH['requestSFTP']>>

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
  private sftp?: Promise<SFTP>
  private preparedDirectories = new Set<string>()
  private pendingDirectoryModes = new Map<string, string>()
  isConnected = false

  private static changeWinStylePathToUnix(path: string): string {
    return path.replace(/\\/g, '/')
  }

  /** Connects using a private-key file or password and records successful connection state. */
  public async connect(config: ISftpPlistConfig): Promise<void> {
    this.isConnected = false
    this.sftp = undefined
    this.preparedDirectories.clear()
    this.pendingDirectoryModes.clear()
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
   * Stages a complete file and its requested metadata before atomically publishing it.
   *
   * @throws If no connection is active or the SFTP operation fails.
   */
  public async upload(local: string, remote: string, config: ISftpPlistConfig): Promise<void> {
    if (!this.isConnected) {
      throw new Error('SSH client is not connected')
    }
    try {
      remote = SSHClient.changeWinStylePathToUnix(remote)
      await this.mkdir(path.posix.dirname(remote), config)
      const sftp = await this.getSftp()
      const stagedPath = path.posix.join(path.posix.dirname(remote), `.piclist-upload-${randomUUID()}.tmp`)
      let created = false
      try {
        const handle = await new Promise<Buffer>((resolve, reject) => {
          sftp.open(stagedPath, 'wx', (err, handle) => (err ? reject(err) : resolve(handle)))
        })
        created = true
        await new Promise<void>((resolve, reject) => {
          sftp.close(handle, err => (err ? reject(err) : resolve()))
        })
        await this.client.putFile(local, stagedPath, sftp)
        if (config.fileUser) await this.chown(stagedPath, config.fileUser)
        if (config.fileMode) await this.chmod(stagedPath, config.fileMode, 'Setting file permissions')
        await this.rename(sftp, stagedPath, remote)
      } catch (err) {
        if (created) {
          // A disconnected server can prevent cleanup; preserve the original transfer error.
          await new Promise<void>((resolve, reject) => {
            sftp.unlink(stagedPath, error => (error ? reject(error) : resolve()))
          }).catch(() => {})
        }
        throw err
      }
    } catch (err: any) {
      throw new Error(err, { cause: err })
    }
  }

  /** Reuses a single SFTP channel for this connection. */
  private async getSftp(): Promise<SFTP> {
    if (!this.client.isConnected()) throw new Error('sftp client is not connected')
    return (this.sftp ||= this.client.requestSFTP().catch(err => {
      this.sftp = undefined
      throw err
    }))
  }

  /** Uses POSIX replacement when supported; standard SFTP rename may only publish a new file. */
  private async rename(sftp: SFTP, stagedPath: string, remote: string): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        sftp.ext_openssh_rename(stagedPath, remote, err => (err ? reject(err) : resolve()))
      })
    } catch (err: any) {
      if (err.code !== 8 && err.message !== 'Server does not support this extended request') throw err
      const exists = await new Promise<boolean>((resolve, reject) => {
        sftp.lstat(remote, error => {
          if (!error) resolve(true)
          else if ('code' in error && error.code === 2) resolve(false)
          else reject(error)
        })
      })
      if (exists) throw new Error('SFTP server does not support atomic replacement of existing files', { cause: err })
      // SFTP v3 rename fails if the destination exists, including a file created after lstat.
      await new Promise<void>((resolve, reject) => {
        sftp.rename(stagedPath, remote, error => (error ? reject(error) : resolve()))
      })
    }
  }

  /** Prepares each remote directory once per connection and mode, leaving existing permissions intact. */
  private async mkdir(dirPath: string, config: ISftpPlistConfig): Promise<void> {
    const sftp = await this.getSftp()
    if (dirPath === '/' || dirPath === '.') return
    const cacheKey = `${config.dirMode || ''}\0${dirPath}`
    if (this.preparedDirectories.has(cacheKey)) return
    const stats = await this.statDirectory(sftp, dirPath)
    if (stats && !stats.isDirectory()) throw new Error('Remote upload parent is not a directory')
    if (!stats) {
      await this.mkdir(path.posix.dirname(dirPath), config)
      try {
        const attributes =
          config.dirMode && /^[0-7]{1,4}$/.test(config.dirMode) ? { mode: Number.parseInt(config.dirMode, 8) } : {}
        await new Promise<void>((resolve, reject) => {
          sftp.mkdir(dirPath, attributes, err => (err ? reject(err) : resolve()))
        })
        if (config.dirMode) this.pendingDirectoryModes.set(dirPath, config.dirMode)
      } catch (cause) {
        // Another uploader may have created this directory after the initial stat.
        const racedDirectory = await this.statDirectory(sftp, dirPath)
        if (!racedDirectory?.isDirectory()) throw new Error('Preparing upload directory failed', { cause })
      }
    }
    const pendingMode = this.pendingDirectoryModes.get(dirPath)
    if (pendingMode) {
      await this.chmod(dirPath, pendingMode, 'Setting directory permissions')
      this.pendingDirectoryModes.delete(dirPath)
    }
    this.preparedDirectories.add(cacheKey)
  }

  /** Only a missing-path status permits creation; permission and connection errors must propagate. */
  private async statDirectory(sftp: SFTP, directory: string): Promise<Stats | undefined> {
    return new Promise((resolve, reject) => {
      sftp.stat(directory, (err, stats) => {
        if (!err) resolve(stats)
        else if ('code' in err && err.code === 2) resolve(undefined)
        else reject(err)
      })
    })
  }

  /** SFTP accepts octal modes; symbolic chmod syntax retains its checked shell fallback. */
  private async chmod(remote: string, mode: string, operation: string): Promise<void> {
    if (!/^[0-7]{1,4}$/.test(mode)) {
      await this.exec(`chmod -- ${quoteShellArgument(mode)} ${quoteShellArgument(remote)}`, operation)
      return
    }
    const sftp = await this.getSftp()
    try {
      await new Promise<void>((resolve, reject) => {
        sftp.chmod(remote, Number.parseInt(mode, 8), err => (err ? reject(err) : resolve()))
      })
    } catch (cause) {
      throw new Error(`${operation} failed`, { cause })
    }
  }

  /** Sets remote ownership using a supplied group, a user:group pair, or the username as its group. */
  public async chown(remote: string, user: string, group?: string): Promise<void> {
    remote = SSHClient.changeWinStylePathToUnix(remote)
    const [_user, _group] = group ? [user, group] : user.includes(':') ? user.split(':') : [user, user]

    if ([_user, _group].every(value => /^\d+$/.test(value) && Number(value) < 0xffffffff)) {
      const sftp = await this.getSftp()
      try {
        await new Promise<void>((resolve, reject) => {
          sftp.chown(remote, Number(_user), Number(_group), err => (err ? reject(err) : resolve()))
        })
      } catch (cause) {
        throw new Error('Setting file ownership failed', { cause })
      }
      return
    }
    // SFTP v3 only accepts numeric IDs; resolving account names still requires server shell support.
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
      this.sftp = undefined
      this.preparedDirectories.clear()
      this.pendingDirectoryModes.clear()
    }
  }
}

export default SSHClient
