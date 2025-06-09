import { IPicGo, IPluginConfig } from '../../types'
import { createField } from '../uploader/utils'

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<any>('buildIn.rename') || {}
  const config: IPluginConfig[] = [
    createField(ctx, 'rename', 'format', 'input', userConfig.format || '{filename}', false, 'BUILDIN'),
    createField(ctx, 'rename', 'enable', 'confirm', userConfig.enable || false, false, 'BUILDIN')
  ]
  return config
}

export default {
  config
}
