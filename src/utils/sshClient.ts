import path from 'node:path'

import type { Config } from 'node-ssh-no-cpu-features'
import { NodeSSH } from 'node-ssh-no-cpu-features'

import type { ISftpPlistConfig } from '../types'

class SSHClient {
  private static instance: SSHClient
  private client = new NodeSSH()
  isConnected = false

  private constructor() {}

  public static getInstance(): SSHClient {
    if (!SSHClient.instance) {
      SSHClient.instance = new SSHClient()
    }
    return SSHClient.instance
  }

  private static changeWinStylePathToUnix(path: string): string {
    return path.replace(/\\/g, '/')
  }

  public async connect(config: ISftpPlistConfig): Promise<void> {
    const { host, port, username, password, privateKey, passphrase } = config
    const loginInfo: Config = privateKey
      ? {
          username,
          privateKeyPath: privateKey,
          passphrase: passphrase || undefined
        }
      : { username, password }
    try {
      await this.client.connect({
        host,
        port: Number(port) || 22,
        ...loginInfo
      })
      this.isConnected = true
    } catch (err: any) {
      throw new Error(err)
    }
  }

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
        await this.exec(`chmod ${fileMode} "${remote}"`)
      }
    } catch (err: any) {
      throw new Error(err)
    }
  }

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
          const script = `mkdir "${currentPath}" && chmod ${directoryMode} "${currentPath}"`
          await this.exec(script)
        }
      }
    } else {
      const script = `cd / && mkdir -p "${dirPath}"`
      await this.exec(script)
    }
  }

  public async chown(remote: string, user: string, group?: string): Promise<void> {
    remote = SSHClient.changeWinStylePathToUnix(remote)
    const [_user, _group] = group ? [user, group] : user.includes(':') ? user.split(':') : [user, user]

    await this.exec(`chown ${_user}:${_group} "${remote}"`)
  }

  private async exec(script: string): Promise<boolean> {
    const execResult = await this.client.execCommand(script)
    return execResult.code === 0
  }

  public close(): void {
    this.client.dispose()
    this.isConnected = false
  }
}

export default SSHClient
