import { type IPicGo, type IPluginConfig } from '../../types'
import { type ILocalesKey } from '../../i18n/zh-CN'

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<any>('buildIn.rename') || {}
  const config: IPluginConfig[] = [
    {
      name: 'format',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_RENAME_FORMAT') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_RENAME_FORMAT') },
      required: false,
      default: userConfig.format || '{filename}'
    },
    {
      name: 'enable',
      type: 'confirm',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_RENAME_ENABLE') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_RENAME_ENABLE') },
      required: false,
      default: userConfig.enable || false
    }
  ]
  return config
}

export default {
  config
}
