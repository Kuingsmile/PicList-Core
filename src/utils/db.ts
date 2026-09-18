import { JSONStore } from '@piclist/store'

import { IConfig, IPicGo } from '../types'

class DB {
  private readonly ctx: IPicGo
  private readonly db: JSONStore<IConfig>
  constructor(ctx: IPicGo) {
    this.ctx = ctx
    this.db = new JSONStore<IConfig>(this.ctx.configPath)

    if (!this.db.has('picBed')) {
      try {
        this.db.set('picBed', {
          //@decprecated
          current: 'smms',
          uploader: 'smms',
          smms: {
            token: '',
          },
        })
      } catch (e: any) {
        this.ctx.log.error(e)
        throw e
      }
    }
    if (!this.db.has('picgoPlugins')) {
      try {
        this.db.set('picgoPlugins', {})
      } catch (e: any) {
        this.ctx.log.error(e)
        throw e
      }
    }

    this.read(true)
  }

  read(flush?: boolean): IConfig {
    return flush ? this.db.refresh() : this.db.read()
  }

  getSingle(key = ''): any {
    if (key === '') {
      return this.db.refresh()
    }
    this.read(true)
    return this.db.get(key)
  }

  get(key: string): any
  get(key: string[]): any[]
  get(key: string | string[] = ''): any {
    if (Array.isArray(key)) {
      return key.map(k => this.getSingle(k))
    }
    return this.getSingle(key)
  }

  set(key: string, value: any): void {
    this.db.set(key, value)
  }

  has(key: string): boolean {
    this.read(true)
    return this.db.has(key)
  }

  unset(key: string, value: any): boolean {
    return this.db.unset(key, value)
  }

  saveConfig(config: Partial<IConfig>): void {
    this.db.setMany(config)
  }

  removeConfig(config: IConfig): void {
    Object.keys(config).forEach((name: string) => {
      this.unset(name, config[name])
    })
  }

  getConfigPath(): string {
    return this.ctx.configPath
  }
}

export default DB
