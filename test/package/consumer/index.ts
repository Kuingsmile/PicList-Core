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

export async function upload(picgo: PicGo, options: IUploadOptions): Promise<IImgInfo[] | Error> {
  const context: IPicGo = picgo
  const deepContext: DeepIPicGo = context
  const uploader: string = deepContext.getConfig<string>('picBed.current')
  deepContext.changeCurrentUploader(uploader, {})
  return picgo.upload([], options)
}

export const requestOptions: IRequestPromiseOptions = { method: 'GET' }

// These directives fail if broken declarations silently turn the API into any.
// @ts-expect-error getMd5 requires a string or binary input.
PicGoUtils.getMd5(123)
// @ts-expect-error The constructor accepts a configuration path, not a number.
new PicGo(123)
