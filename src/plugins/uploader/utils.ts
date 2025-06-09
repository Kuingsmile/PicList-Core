import { ILocalesKey } from '../../i18n/zh-CN'
import { IPicGo } from '../../types'

export function formatPathHelper({
  path,
  startSlash = false,
  endSlash = true,
  rootToEmpty = true
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

export function encodePath(path: string): string {
  return path
    .replace(/\/{2,}/g, '/')
    .split('/')
    .map(p => encodeURIComponent(p))
    .join('/')
}

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
  webdavplist: 'webdavplist'
}

export const createField = (
  ctx: IPicGo,
  picBedName: string,
  name: string,
  type: any,
  defaultValue: any,
  required: boolean,
  i18nPrefix: string = 'PICBED',
  extras?: any
) => ({
  name,
  type,
  get prefix() {
    return ctx.i18n.translate<ILocalesKey>(
      `${i18nPrefix}_${picBedName.toUpperCase()}_${name.toUpperCase()}` as ILocalesKey
    )
  },
  get alias() {
    return ctx.i18n.translate<ILocalesKey>(
      `${i18nPrefix}_${picBedName.toUpperCase()}_${name.toUpperCase()}` as ILocalesKey
    )
  },
  default: defaultValue,
  required,
  ...extras
})
