import { IPicGo } from '../../types'

/** Normalizes repeated and boundary slashes with configurable leading, trailing, and root behavior. */
export function formatPathHelper({
  path,
  startSlash = false,
  endSlash = true,
  rootToEmpty = true,
}: {
  path?: string
  startSlash?: boolean
  endSlash?: boolean
  rootToEmpty?: boolean
}): string {
  const cleanPath = path?.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/')
  if (!cleanPath) {
    return rootToEmpty ? '' : '/'
  }
  return `${startSlash ? '/' : ''}${cleanPath}${endSlash ? '/' : ''}`
}

/** Encodes individual path segments while preserving separators and collapsing repeated slashes. */
export function encodePath(path: string): string {
  return path
    .replace(/\/{2,}/g, '/')
    .split('/')
    .map(p => encodeURIComponent(p))
    .join('/')
}

/** Stable registry IDs shared by built-in uploaders, configuration paths, and selection UIs. */
export const buildInUploaderNames = {
  advancedplist: 'advancedplist',
  alistplist: 'alistplist',
  aliyun: 'aliyun',
  'aws-s3-plist': 'aws-s3-plist',
  github: 'github',
  imgur: 'imgur',
  local: 'local',
  lskyplist: 'lskyplist',
  piclist: 'piclist',
  qiniu: 'qiniu',
  sftpplist: 'sftpplist',
  smms: 'smms',
  tcyun: 'tcyun',
  upyun: 'upyun',
  webdavplist: 'webdavplist',
}

/** Copies property descriptors so lazy translated getters remain live on the resulting form field. */
const applyExtraDescriptors = <T extends Record<string, any>>(field: T, extras?: any): T => {
  if (!extras) return field
  return Object.defineProperties(field, Object.getOwnPropertyDescriptors(extras))
}

/** Builds a configuration field with lazy translated labels and descriptor-preserving overrides. */
export const createField = (
  ctx: IPicGo,
  picBedName: string,
  name: string,
  type: any,
  defaultValue: any,
  required: boolean,
  i18nPrefix: string = 'PICBED',
  extras?: any,
): any =>
  applyExtraDescriptors(
    {
      name,
      type,
      get prefix() {
        return ctx.i18n.translate(`${i18nPrefix}_${picBedName.toUpperCase()}_${name.toUpperCase()}`)
      },
      get alias() {
        return ctx.i18n.translate(`${i18nPrefix}_${picBedName.toUpperCase()}_${name.toUpperCase()}`)
      },
      default: defaultValue,
      required,
    },
    extras,
  )
