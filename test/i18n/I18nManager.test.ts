import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PicGo } from '../../src/core/PicGo'
import { I18nManager } from '../../src/i18n'
import { EN } from '../../src/i18n/en'
import { tuiKey } from '../../src/i18n/tui'
import { ZH_CN } from '../../src/i18n/zh-CN'
import { ZH_TW } from '../../src/i18n/zh-TW'
import { setCurrentPluginName } from '../../src/lib/LifecyclePlugins'
import { translator } from '../../src/tui/i18n'
import type { IPicGo } from '../../src/types'

describe('I18nManager', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piclist-i18n-test-'))
  })

  afterEach(async () => {
    setCurrentPluginName('')
    await fs.remove(baseDir)
  })

  function createManager(language?: string, directory = baseDir) {
    const saveConfig = vi.fn()
    const ctx = {
      baseDir: directory,
      getConfig: () => language,
      saveConfig,
    } as unknown as IPicGo
    const i18n = new I18nManager(ctx)
    ctx.i18n = i18n
    return { ctx, i18n, saveConfig }
  }

  it('keeps t bound and preserves built-in translations after language changes', () => {
    const { i18n, saveConfig } = createManager()
    const { t } = i18n

    for (const [language, locale] of Object.entries({ 'zh-CN': ZH_CN, 'zh-TW': ZH_TW, en: EN })) {
      i18n.setLanguage(language)
      expect(t('UPLOAD_FAILED')).toBe(locale.UPLOAD_FAILED)
      expect(t('UPLOAD_FAILED')).toBe(i18n.translate('UPLOAD_FAILED'))
      expect(t('UPLOAD_FAILED_REASON', { code: 403 })).toBe(locale.UPLOAD_FAILED_REASON.replace('${code}', '403'))
      expect(saveConfig).toHaveBeenLastCalledWith({ 'settings.language': language })
    }
  })

  it('loads an existing CommonJS plugin using addLocale and translate', async () => {
    const ctx = await PicGo.create(path.join(baseDir, 'config.json'))
    const pluginPath = fileURLToPath(new URL('../fixtures/i18n-plugin.cjs', import.meta.url))
    await ctx.pluginLoader.registerPlugin(pluginPath)
    const plugin = await ctx.pluginLoader.getPlugin(pluginPath)

    expect(ctx.i18n.translate('PIC_MIGRATER_CHOOSE_FILE')).toBe('[ZH] Choose File')
    expect(plugin!.config!(ctx).map(field => field.message)).toEqual(['[ZH] Choose File', '[ZH] Choose Folder'])
    ctx.i18n.setLanguage('en')
    expect(plugin!.config!(ctx).map(field => field.message)).toEqual(['Choose File', 'Choose Folder'])
    expect(ctx.i18n.t('UPLOAD_FAILED')).toBe(EN.UPLOAD_FAILED)
  })

  it('deep merges plugin locales and sees updates through both APIs', () => {
    const { i18n } = createManager('en')
    const { t } = i18n
    expect(i18n.addLocale('en', { plugin: { first: 'Hello ${name}', second: 'Second' } })).toBe(true)
    expect(i18n.translate('plugin.first', { name: 'Ada' })).toBe('Hello Ada')
    expect(i18n.addLocale('en', { plugin: { first: 'Updated' }, UPLOAD_FAILED: 'Plugin override' })).toBe(true)
    expect(i18n.translate('plugin.first')).toBe('Updated')
    expect(i18n.translate('plugin.second')).toBe('Second')
    expect(i18n.translate('UPLOAD_FAILED')).toBe('Plugin override')
    expect(t('UPLOAD_FAILED')).toBe('Plugin override')
    expect(t('CHECK_SETTINGS')).toBe(EN.CHECK_SETTINGS)
  })

  it('preserves dynamic keys, partial interpolation, and key fallback', () => {
    const { i18n } = createManager()
    i18n.addLocale('zh-CN', { PLUGIN_MESSAGE: '${first} ${second}', EMPTY: '', UPLOAD_FAILED: '' })
    expect(i18n.translate<'PLUGIN_MESSAGE'>('PLUGIN_MESSAGE', { first: 'One' })).toBe('One ${second}')
    expect(i18n.translate('UNKNOWN_PLUGIN_KEY')).toBe('UNKNOWN_PLUGIN_KEY')
    expect(i18n.translate('EMPTY')).toBe('EMPTY')
    expect(i18n.translate('UPLOAD_FAILED')).toBe('UPLOAD_FAILED')
    expect(i18n.t('UPLOAD_FAILED')).toBe('UPLOAD_FAILED')
  })

  it('keeps dynamic language registration and the initial language fallback', () => {
    const { i18n } = createManager('en')
    expect(i18n.addLocale('fr', { PLUGIN_MESSAGE: 'Bonjour' })).toBe(false)
    expect(i18n.addLanguage('fr', { PLUGIN_MESSAGE: 'Bonjour' })).toBe(true)
    expect(i18n.addLanguage('fr', { PLUGIN_MESSAGE: 'Replacement' })).toBe(false)
    expect(i18n.getLanguageList()).toEqual(['zh-CN', 'zh-TW', 'en', 'fr'])
    i18n.setLanguage('fr')
    expect(i18n.translate('PLUGIN_MESSAGE')).toBe('Bonjour')
    expect(i18n.t('UPLOAD_FAILED')).toBe(EN.UPLOAD_FAILED)
    expect(i18n.addLocale('fr', { PLUGIN_MESSAGE: 'Salut' })).toBe(true)
    expect(i18n.translate('PLUGIN_MESSAGE')).toBe('Salut')
  })

  it('loads the saved custom YAML language before choosing the initial language', async () => {
    await fs.outputFile(path.join(baseDir, 'i18n-cli/fr.yml'), 'UPLOAD_FAILED: Échec\nPLUGIN_MESSAGE: Bonjour\n')
    const { i18n } = createManager('fr')
    expect(i18n.getLanguageList()).toContain('fr')
    expect(i18n.t('UPLOAD_FAILED')).toBe('Échec')
    expect(i18n.translate('PLUGIN_MESSAGE')).toBe('Bonjour')
    expect(i18n.addLocale('fr', { PLUGIN_MESSAGE: 'Salut' })).toBe(true)
    expect(i18n.translate('PLUGIN_MESSAGE')).toBe('Salut')
    // Missing built-in keys still return a string when the custom default is partial.
    expect(i18n.t('CHECK_SETTINGS')).toBe('CHECK_SETTINGS')
  })

  it('keeps YAML overrides available to typed, dynamic, and TUI translations', async () => {
    const key = tuiKey('Upload')!
    await fs.outputFile(path.join(baseDir, 'i18n-cli/en.yml'), `UPLOAD_FAILED: Custom failure\n${key}: Send\n`)
    const { ctx, i18n } = createManager('en')
    expect(i18n.t('UPLOAD_FAILED')).toBe('Custom failure')
    expect(i18n.translate('UPLOAD_FAILED')).toBe('Custom failure')
    expect(translator(ctx)('Upload')).toBe('Send')
  })

  it('isolates locale mutations and added languages between instances', () => {
    const first = createManager('en').i18n
    const second = createManager('en').i18n
    first.addLocale('en', { UPLOAD_FAILED: 'Overridden', PLUGIN_MESSAGE: 'First instance' })
    first.addLanguage('fr', { PLUGIN_MESSAGE: 'Bonjour' })
    expect(second.t('UPLOAD_FAILED')).toBe(EN.UPLOAD_FAILED)
    expect(second.translate('PLUGIN_MESSAGE')).toBe('PLUGIN_MESSAGE')
    expect(second.getLanguageList()).not.toContain('fr')
    expect(createManager('en').i18n.t('UPLOAD_FAILED')).toBe(EN.UPLOAD_FAILED)
  })

  it('isolates custom YAML languages between configuration directories', async () => {
    await fs.outputFile(path.join(baseDir, 'i18n-cli/fr.yml'), 'PLUGIN_MESSAGE: Bonjour\n')
    expect(createManager('fr').i18n.getLanguageList()).toContain('fr')
    const { i18n } = createManager('fr', path.join(baseDir, 'other'))
    expect(i18n.getLanguageList()).not.toContain('fr')
    expect(i18n.t('UPLOAD_FAILED')).toBe(ZH_CN.UPLOAD_FAILED)
  })
})
