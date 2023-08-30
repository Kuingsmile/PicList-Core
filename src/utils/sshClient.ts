import { NodeSSH, type Config } from 'node-ssh-no-cpu-features'
import path from 'path'
import { type ISftpPlistConfig } from '../types'

class SSHClient {
  private static _instance: SSHClient
  private static _client: NodeSSH
  private _isConnected = false

  public static get instance (): SSHClient {
    return this._instance || (this._instance = new this())
  }

  public static get client (): NodeSSH {
    return this._client || (this._client = new NodeSSH())
  }

  private changeWinStylePathToUnix (path: string): string {
    return path.replace(/\\/g, '/')
  }

  public async connect (config: ISftpPlistConfig): Promise<boolean> {
    const { username, password, privateKey, passphrase } = config
    const loginInfo: Config = privateKey
      ? { username, privateKeyPath: privateKey, passphrase: passphrase || undefined }
      : { username, password }
    try {
      await SSHClient.client.connect({
        host: config.host,
        port: Number(config.port) || 22,
        ...loginInfo
      })
      this._isConnected = true
      return true
    } catch (err: any) {
      throw new Error(err)
    }
  }

  public async upload (local: string, remote: string, config: ISftpPlistConfig): Promise<boolean> {
    if (!this._isConnected) {
      throw new Error('SSH 未连接')
    }
    try {
      remote = this.changeWinStylePathToUnix(remote)
      await this.mkdir(path.dirname(remote).replace(/^\/+|\/+$/g, ''), config)
      await SSHClient.client.putFile(local, remote)
      const fileMode = config.fileMode || '0644'
      if (fileMode !== '0644') {
        const script = `chmod ${fileMode} "${remote}"`
        const result = await this.exec(script)
        return result
      }
      return true
    } catch (err: any) {
      return false
    }
  }

  private async mkdir (dirPath: string, config: ISftpPlistConfig): Promise<void> {
    if (!SSHClient.client.isConnected()) {
      throw new Error('SSH 未连接')
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
      const script = `mkdir -p "${dirPath}"`
      await this.exec(script)
    }
  }

  public async chown (remote: string, user: string, group?: string): Promise<boolean> {
    remote = this.changeWinStylePathToUnix(remote)
    const [_user, _group] = group ? [user, group] : user.includes(':') ? user.split(':') : [user, user]

    const script = `chown ${_user}:${_group} "${remote}"`
    return this.exec(script)
  }

  private async exec (script: string): Promise<boolean> {
    const execResult = await SSHClient.client.execCommand(script)
    return execResult.code === 0
  }

  public close (): void {
    SSHClient.client.dispose()
    this._isConnected = false
  }
}

export default SSHClient
