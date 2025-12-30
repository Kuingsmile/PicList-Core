import { ILocalesKey } from '../../i18n/zh-CN'
import { IPicGo, IStringKeyMap } from '../../types'

export const uploaderTranslators = (ctx: IPicGo) => {
  return {
    advancedplist: ctx.i18n.translate<ILocalesKey>('PICBED_ADVANCEDPLIST'),
    alistplist: ctx.i18n.translate<ILocalesKey>('PICBED_ALIST_PLIST'),
    aliyun: ctx.i18n.translate<ILocalesKey>('PICBED_ALICLOUD'),
    'aws-s3-plist': ctx.i18n.translate<ILocalesKey>('PICBED_AWSS3PLIST'),
    github: ctx.i18n.translate<ILocalesKey>('PICBED_GITHUB'),
    imgur: ctx.i18n.translate<ILocalesKey>('PICBED_IMGUR'),
    local: ctx.i18n.translate<ILocalesKey>('PICBED_LOCAL'),
    lskyplist: ctx.i18n.translate<ILocalesKey>('PICBED_LSKY_PLIST'),
    piclist: ctx.i18n.translate<ILocalesKey>('PICBED_PICLIST'),
    qiniu: ctx.i18n.translate<ILocalesKey>('PICBED_QINIU'),
    sftpplist: ctx.i18n.translate<ILocalesKey>('PICBED_SFTPPLIST'),
    smms: ctx.i18n.translate<ILocalesKey>('PICBED_SMMS'),
    tcyun: ctx.i18n.translate<ILocalesKey>('PICBED_TENCENTCLOUD'),
    upyun: ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN'),
    webdavplist: ctx.i18n.translate<ILocalesKey>('PICBED_WEBDAVPLIST'),
  } as IStringKeyMap<any>
}
