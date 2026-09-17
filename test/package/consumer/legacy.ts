// Bundler resolution has historically allowed these extensionless deep type imports.
import type { PicGo } from 'piclist/dist/core/PicGo'
import type { IPicGo } from 'piclist/dist/types'
import type { IRequestPromiseOptions } from 'piclist/dist/types/oldRequest'

export function context(picgo: PicGo): IPicGo {
  return picgo
}

export const requestOptions: IRequestPromiseOptions = { method: 'POST' }
