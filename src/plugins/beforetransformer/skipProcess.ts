import { IPicGo, IPluginConfig } from '../../types'
import { createField } from '../uploader/utils'

/**
 * Builds the image-processing extension exclusion form with defaults from saved global processing
 * settings.
 */
const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<{ skipProcessExtList?: string }>('buildIn.skipProcess') || {}
  const config: IPluginConfig[] = [
    createField(
      ctx,
      'skipProcess',
      'skipProcessExtList',
      'input',
      userConfig.skipProcessExtList || 'zip,rar,7z,tar,gz,tar.gz,tar.bz2,tar.xz',
      false,
      'BUILDIN',
    ),
  ]
  return config
}

export default {
  config,
}
