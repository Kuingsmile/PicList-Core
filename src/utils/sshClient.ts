import { NodeSSH, Config } from 'node-ssh'
import path from 'path'
import { ISftpPlistConfig } from '../types'

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

  public async upload (local: string, remote: string): Promise<boolean> {
    if (!this._isConnected) {
      throw new Error('SSH 未连接')
    }
    try {
      await this.mkdir(path.dirname(remote))
      await SSHClient.client.putFile(local, remote)
      return true
    } catch (err: any) {
      return false
    }
  }

  private async mkdir (dirPath: string): Promise<void> {
    if (!SSHClient.client.isConnected()) {
      throw new Error('SSH 未连接')
    }
    await SSHClient.client.mkdir(dirPath, 'exec')
  }

  public async chown (remote: string, user: string, group?: string): Promise<boolean> {
    const [_user, _group] = group ? [user, group] : user.includes(':') ? user.split(':') : [user, user]

    const script = `chown ${_user}:${_group} ${remote}`
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
