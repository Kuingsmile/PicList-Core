import { IBuildInWaterMarkOptions, IPicGo, IPluginConfig } from '../../types'
import { createField } from '../uploader/utils'

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IBuildInWaterMarkOptions>('buildIn.watermark') || {}
  const config: IPluginConfig[] = [
    createField(ctx, 'watermark', 'isAddWatermark', 'confirm', userConfig.isAddWatermark || false, false, 'BUILDIN'),
    createField(ctx, 'watermark', 'watermarkType', 'list', userConfig.watermarkType || 'text', false, 'BUILDIN', {
      choices: ['text', 'image']
    }),
    createField(
      ctx,
      'watermark',
      'isFullScreenWatermark',
      'confirm',
      userConfig.isFullScreenWatermark || false,
      false,
      'BUILDIN'
    ),
    createField(ctx, 'watermark', 'watermarkDegree', 'input', userConfig.watermarkDegree || 0, false, 'BUILDIN'),
    createField(ctx, 'watermark', 'watermarkText', 'input', userConfig.watermarkText || '', false, 'BUILDIN'),
    createField(ctx, 'watermark', 'watermarkFontPath', 'input', userConfig.watermarkFontPath || '', false, 'BUILDIN'),
    createField(
      ctx,
      'watermark',
      'watermarkScaleRatio',
      'input',
      userConfig.watermarkScaleRatio || 0.15,
      false,
      'BUILDIN'
    ),
    createField(
      ctx,
      'watermark',
      'watermarkColor',
      'input',
      userConfig.watermarkColor || 'rgba(204, 204, 204, 0.45)',
      false,
      'BUILDIN'
    ),
    createField(ctx, 'watermark', 'watermarkImagePath', 'input', userConfig.watermarkImagePath || '', false, 'BUILDIN'),
    createField(
      ctx,
      'watermark',
      'watermarkImageOpacity',
      'input',
      userConfig.watermarkImageOpacity || 255,
      false,
      'BUILDIN'
    ),
    createField(
      ctx,
      'watermark',
      'watermarkPosition',
      'list',
      userConfig.watermarkPosition || 'southeast',
      false,
      'BUILDIN',
      {
        choices: [
          'north',
          'northeast',
          'southeast',
          'south',
          'southwest',
          'northwest',
          'west',
          'east',
          'center',
          'centre'
        ]
      }
    )
  ]
  return config
}

export default {
  config
}
