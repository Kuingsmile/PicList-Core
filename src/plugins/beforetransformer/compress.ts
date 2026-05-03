import { IBuildInCompressOptions, IPicGo, IPluginConfig } from '../../types'
import { createField } from '../uploader/utils'

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IBuildInCompressOptions>('buildIn.compress') || {}
  const config: IPluginConfig[] = [
    createField(ctx, 'compress', 'quality', 'input', userConfig.quality || 100, false, 'BUILDIN'),
    createField(ctx, 'compress', 'isConvert', 'confirm', userConfig.isConvert || false, false, 'BUILDIN'),
    createField(ctx, 'compress', 'convertFormat', 'list', userConfig.convertFormat || 'jpg', false, 'BUILDIN', {
      choices: [
        'avif',
        'dz',
        'fits',
        'gif',
        'heif',
        'input',
        'jpeg',
        'jpg',
        'jp2',
        'jxl',
        'magick',
        'openslide',
        'pdf',
        'png',
        'ppm',
        'raw',
        'svg',
        'tiff',
        'tif',
        'v',
        'webp',
      ],
    }),
    createField(ctx, 'compress', 'isReSize', 'confirm', userConfig.isReSize || false, false, 'BUILDIN'),
    createField(ctx, 'compress', 'reSizeWidth', 'input', userConfig.reSizeWidth || 500, false, 'BUILDIN'),
    createField(ctx, 'compress', 'reSizeHeight', 'input', userConfig.reSizeHeight || 500, false, 'BUILDIN'),
    createField(ctx, 'compress', 'longEdgeAsHeight', 'confirm', userConfig.longEdgeAsHeight || false, false, 'BUILDIN'),
    createField(
      ctx,
      'compress',
      'skipReSizeOfSmallImg',
      'confirm',
      userConfig.skipReSizeOfSmallImg || false,
      false,
      'BUILDIN',
    ),
    createField(
      ctx,
      'compress',
      'isReSizeByPercent',
      'confirm',
      userConfig.isReSizeByPercent || false,
      false,
      'BUILDIN',
    ),
    createField(ctx, 'compress', 'reSizePercent', 'input', userConfig.reSizePercent || 50, false, 'BUILDIN'),
    createField(ctx, 'compress', 'isFlip', 'confirm', userConfig.isFlip || false, false, 'BUILDIN'),
    createField(ctx, 'compress', 'isFlop', 'confirm', userConfig.isFlop || false, false, 'BUILDIN'),
    createField(ctx, 'compress', 'isRotate', 'confirm', userConfig.isRotate || false, false, 'BUILDIN'),
    createField(ctx, 'compress', 'rotateDegree', 'input', userConfig.rotateDegree || 90, false, 'BUILDIN'),
    createField(ctx, 'compress', 'isRemoveExif', 'confirm', userConfig.isRemoveExif || false, false, 'BUILDIN'),
  ]
  return config
}

export default {
  config,
}
