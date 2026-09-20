import type { ILocales } from '../../src/i18n/zh-CN'
import type { IPicGo } from '../../src/types'

// Compiled by npm run typecheck; no runtime side effects.
/**
 * Compile-only assertions for checked built-in translation keys, required placeholders, and dynamic
 * plugin keys.
 */
export function checkI18nTypes(ctx: IPicGo, dynamicKey: string, locales: ILocales) {
  const { t } = ctx.i18n
  const text: string = t('UPLOAD_FAILED')
  t('UPLOAD_FAILED_REASON', { code: 403 })
  t('PLUGIN_HANDLER_PLUGIN_INSTALL_FAILED_REASON', { code: 1, data: 'Failed' })
  ctx.i18n.translate(dynamicKey)
  ctx.i18n.translate<'PIC_MIGRATER_CHOOSE_FILE'>('PIC_MIGRATER_CHOOSE_FILE')
  ctx.i18n.translate('PLUGIN_HANDLER_PLUGIN_INSTALL_FAILED_REASON', { code: '1' })
  ctx.i18n.addLocale('en', { PIC_MIGRATER_CHOOSE_FILE: 'Choose File' })
  locales.UPLOAD_FAILED = 'A different translation'

  // @ts-expect-error Built-in keys are checked.
  t('UPLOAD_FAIELD')
  // @ts-expect-error Dynamic plugin keys use translate().
  t(dynamicKey)
  // @ts-expect-error Plugin keys do not weaken built-in checking.
  t('PIC_MIGRATER_CHOOSE_FILE')
  // @ts-expect-error code is required by the template.
  t('UPLOAD_FAILED_REASON')
  // @ts-expect-error A placeholder cannot be misspelled.
  t('UPLOAD_FAILED_REASON', { codes: 403 })
  // @ts-expect-error data is also required by the template.
  t('PLUGIN_HANDLER_PLUGIN_INSTALL_FAILED_REASON', { code: 1 })
  // @ts-expect-error Messages without placeholders reject extra arguments.
  t('UPLOAD_FAILED', { code: 403 })
  return text
}
