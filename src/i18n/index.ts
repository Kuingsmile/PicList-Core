import path from 'node:path'

import { createTypedI18n, ObjectAdapter, type TypedI18n } from '@piclist/i18n'
import fs from 'fs-extra'
import { ensureDirSync, pathExistsSync } from 'fs-extra/esm'
import { load } from 'js-yaml'
import { cloneDeep, merge } from 'lodash-es'

import { I18nTranslate, II18nManager, ILocale, IPicGo, IStringKeyMap } from '../types'
import { EN } from './en'
import { ILocalesKey, ZH_CN } from './zh-CN'
import { ZH_TW } from './zh-TW'

/** Combines built-in and user YAML locales and provides typed and dynamic translation APIs. */
class I18nManager implements II18nManager {
  private readonly i18n: TypedI18n<typeof ZH_CN>
  private readonly objectAdapter: ObjectAdapter
  private readonly ctx: IPicGo
  /** Per-client copies of built-in locale dictionaries used to initialize the locale adapter. */
  private readonly languageList: IStringKeyMap<ILocale> = cloneDeep({
    'zh-CN': ZH_CN,
    'zh-TW': ZH_TW,
    en: EN,
  })

  /** Loads external locales and selects the saved language, falling back to Simplified Chinese. */
  constructor(ctx: IPicGo) {
    this.ctx = ctx
    this.objectAdapter = new ObjectAdapter(this.languageList)
    this.loadOutterI18n()
    let language = this.ctx.getConfig<string>('settings.language') || 'zh-CN'
    if (!this.objectAdapter.getLocale(language)) {
      language = 'zh-CN' // use default
    }
    this.i18n = createTypedI18n({
      adapter: this.objectAdapter,
      defaultLanguage: language,
      schema: ZH_CN,
    })
  }

  /**
   * Loads user .yml dictionaries by filename and reports malformed YAML without aborting
   * initialization.
   */
  private loadOutterI18n(): void {
    const i18nFolder = this.getOutterI18nFolder()
    const files = fs.readdirSync(i18nFolder, {
      withFileTypes: true,
    })
    files.forEach(file => {
      if (file.isFile() && file.name.endsWith('.yml')) {
        const i18nFilePath = path.join(i18nFolder, file.name)
        const i18nFile = fs.readFileSync(i18nFilePath, 'utf8')
        try {
          const i18nFileObj = load(i18nFile) as ILocale
          this.objectAdapter.setLocale(file.name.replace(/\.yml$/, ''), i18nFileObj)
        } catch (e) {
          console.error(e)
        }
      }
    })
  }

  /** Ensures the client's i18n-cli directory exists and returns its path. */
  private getOutterI18nFolder(): string {
    const i18nFolder = path.join(this.ctx.baseDir, 'i18n-cli')
    if (!pathExistsSync(i18nFolder)) {
      ensureDirSync(i18nFolder)
    }
    return i18nFolder
  }

  /**
   * Translates built-in keys with checked arguments, falling back to the key when translation is
   * empty.
   */
  readonly t: I18nTranslate = (...args) => this.i18n.t(...args) || args[0]

  /** Translates dynamic or plugin-defined keys, returning the key when no translation is available. */
  translate<T extends string>(key: ILocalesKey | T, args?: IStringKeyMap<string>): string {
    return this.i18n.translate(key, args) || key
  }

  /** Changes the active language and persists the selection to client settings. */
  setLanguage(language: string): void {
    this.i18n.setLanguage(language)
    this.ctx.saveConfig({
      'settings.language': language,
    })
  }

  /** Deep-merges messages into an existing language; returns false if the language is unknown. */
  addLocale(language: string, locales: ILocale): boolean {
    const originLocales = this.objectAdapter.getLocale(language)
    if (!originLocales) {
      return false
    }
    const newLocales = merge({}, originLocales, locales)
    this.objectAdapter.setLocale(language, newLocales)
    return true
  }

  /** Registers a cloned dictionary for a new language; returns false if it already exists. */
  addLanguage(language: string, locales: ILocale): boolean {
    const originLocales = this.objectAdapter.getLocale(language)
    if (originLocales) {
      return false
    }
    this.objectAdapter.setLocale(language, cloneDeep(locales))
    return true
  }

  getLanguageList(): string[] {
    return Object.keys(this.languageList)
  }
}

export { I18nManager }
