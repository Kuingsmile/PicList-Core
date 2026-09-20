import {
  Commander,
  type IImgInfo,
  type IPicGo,
  type IUploadOptions,
  Lifecycle,
  LifecyclePlugins,
  Logger,
  PicGo,
  PicGoUtils,
  PluginHandler,
  PluginLoader,
  Request,
} from 'piclist'
import { PicGo as DeepPicGo } from 'piclist/dist/index.js'
import type { IPicGo as DeepIPicGo } from 'piclist/dist/types/index.js'
import type { IRequestPromiseOptions } from 'piclist/dist/types/oldRequest.js'

// Check that the root exports retain useful types, including the full declaration graph.
export const constructors = { Commander, Lifecycle, LifecyclePlugins, Logger, PluginHandler, PluginLoader, Request }
export const sameConstructor: typeof PicGo = DeepPicGo
export const digest: string = PicGoUtils.getMd5('consumer')

/** Exercises public and deep-import upload contracts during packaged declaration type checking. */
export async function upload(picgo: PicGo, options: IUploadOptions): Promise<IImgInfo[] | Error> {
  const context: IPicGo = picgo
  const deepContext: DeepIPicGo = context
  const uploader: string = deepContext.getConfig<string>('picBed.current')
  deepContext.changeCurrentUploader(uploader, {})
  return picgo.upload([], options)
}

export const requestOptions: IRequestPromiseOptions = { method: 'GET' }

/** Checks packaged translation declarations retain key validation and dynamic plugin-key support. */
export function translations(ctx: IPicGo, pluginKey: string): string {
  const { t } = ctx.i18n
  const message: string = t('UPLOAD_FAILED_REASON', { code: 403 })
  t('UPLOAD_FAILED')
  t('PLUGIN_HANDLER_PLUGIN_INSTALL_FAILED_REASON', { code: 1, data: 'Failed' })
  ctx.i18n.addLocale('en', { PIC_MIGRATER_CHOOSE_FILE: 'Choose File' })
  ctx.i18n.translate(pluginKey)
  ctx.i18n.translate<'PIC_MIGRATER_CHOOSE_FILE'>('PIC_MIGRATER_CHOOSE_FILE')
  // @ts-expect-error Unknown built-in keys must not become any in published declarations.
  t('UPLOAD_FAIELD')
  // @ts-expect-error Placeholder arguments are required.
  t('UPLOAD_FAILED_REASON')
  // @ts-expect-error Both code and data must be supplied.
  t('PLUGIN_HANDLER_PLUGIN_INSTALL_FAILED_REASON', { code: 1 })
  // @ts-expect-error Dynamic plugin keys use translate().
  t(pluginKey)
  return message
}

// These directives fail if broken declarations silently turn the API into any.
// @ts-expect-error getMd5 requires a string or binary input.
PicGoUtils.getMd5(123)
// @ts-expect-error The constructor accepts a configuration path, not a number.
new PicGo(123)
