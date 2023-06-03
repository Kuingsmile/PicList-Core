
import { IPicGo, IPluginConfig } from '../../types'
import { ILocalesKey } from '../../i18n/zh-CN'

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<any>('buildIn.rename') || {}
  const config: IPluginConfig[] = [
    {
      name: 'format',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_RENAME_FORMAT') },
      required: false,
      default: userConfig.format || '{filename}'
    },
    {
      name: 'enable',
      type: 'confirm',
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
