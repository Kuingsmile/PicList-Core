import { JSONStore } from '@piclist/store'

import { IConfig, IPicGo } from '../types'

/** Persistent JSON configuration storage with legacy PicGo defaults and path-based access. */
class DB {
  private readonly ctx: IPicGo
  private readonly db: JSONStore<IConfig>
  /**
   * Opens the configuration store, writes missing uploader/plugin defaults, and refreshes its
   * contents.
   */
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

  /** Reads configuration, optionally refreshing from disk, and silently migrates legacy settings. */
  read(flush?: boolean): IConfig {
    if (flush) this.db.refresh()
    // Older releases persisted this misspelling for independent secondary processing.
    if (this.db.get('settings.secondPicBedMode') === 'seperate') {
      this.db.set('settings.secondPicBedMode', 'separate')
    }
    return this.db.read()
  }

  /** Refreshes disk state before reading a path; an empty path returns the whole configuration. */
  getSingle(key = ''): any {
    if (key === '') {
      return this.read(true)
    }
    this.read(true)
    return this.db.get(key)
  }

  /** Refreshes disk state and reads one configuration path. */
  get(key: string): any
  /** Reads configuration paths in order, refreshing disk state for each lookup. */
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

  /** Refreshes disk state before checking whether a configuration path exists. */
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

  /** Removes the nested entries identified by each key/value pair in the supplied configuration. */
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
