import { IPicGo, IPluginConfig } from '../../types'
import { ILocalesKey } from '../../i18n/zh-CN'

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<{ skipProcessExtList?: string }>('buildIn.skipProcess') || {}
  const config: IPluginConfig[] = [
    {
      name: 'skipProcessExtList',
      type: 'input',
      get prefix() {
        return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_SKIPPROCESS_EXTLIST')
      },
      get alias() {
        return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_SKIPPROCESS_EXTLIST')
      },
      required: false,
      default: userConfig.skipProcessExtList || 'zip,rar,7z,tar,gz,tar.gz,tar.bz2,tar.xz'
    }
  ]
  return config
}

export default {
  config
}
