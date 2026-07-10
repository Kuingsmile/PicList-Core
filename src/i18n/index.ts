import path from 'node:path'

import { I18n, ObjectAdapter } from '@piclist/i18n'
import fs from 'fs-extra'
import { ensureDirSync, pathExistsSync } from 'fs-extra/esm'
import { load } from 'js-yaml'
import { merge } from 'lodash-es'

import { II18nManager, IPicGo, IStringKeyMap } from '../types'
import { EN } from './en'
import { ILocales, ILocalesKey, ZH_CN } from './zh-CN'
import { ZH_TW } from './zh-TW'

type ILocale = Record<string, any>

const languageList: IStringKeyMap<IStringKeyMap<string>> = {
  'zh-CN': ZH_CN,
  'zh-TW': ZH_TW,
  en: EN,
}

class I18nManager implements II18nManager {
  private readonly i18n: I18n
  private readonly objectAdapter: ObjectAdapter
  private readonly ctx: IPicGo
  constructor(ctx: IPicGo) {
    this.ctx = ctx
    this.objectAdapter = new ObjectAdapter(languageList)
    let language = this.ctx.getConfig<string>('settings.language') || 'zh-CN'
    if (!languageList[language]) {
      language = 'zh-CN' // use default
    }
    this.i18n = new I18n({
      adapter: this.objectAdapter,
      defaultLanguage: language,
    })
    this.loadOutterI18n()
  }

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
          const i18nFileObj = load(i18nFile) as ILocales
          languageList[file.name.replace(/\.yml$/, '')] = i18nFileObj
        } catch (e) {
          console.error(e)
        }
      }
    })
  }

  private getOutterI18nFolder(): string {
    const i18nFolder = path.join(this.ctx.baseDir, 'i18n-cli')
    if (!pathExistsSync(i18nFolder)) {
      ensureDirSync(i18nFolder)
    }
    return i18nFolder
  }

  translate<T extends string>(key: ILocalesKey | T, args?: IStringKeyMap<string>): string {
    return this.i18n.translate(key, args) || key
  }

  setLanguage(language: string): void {
    this.i18n.setLanguage(language)
    this.ctx.saveConfig({
      'settings.language': language,
    })
  }

  addLocale(language: string, locales: ILocale): boolean {
    const originLocales = this.objectAdapter.getLocale(language)
    if (!originLocales) {
      return false
    }
    const newLocales = merge(originLocales, locales)
    this.objectAdapter.setLocale(language, newLocales)
    return true
  }

  addLanguage(language: string, locales: ILocale): boolean {
    const originLocales = this.objectAdapter.getLocale(language)
    if (originLocales) {
      return false
    }
    this.objectAdapter.setLocale(language, locales)
    languageList[language] = locales
    return true
  }

  getLanguageList(): string[] {
    return Object.keys(languageList)
  }
}

export { I18nManager }
