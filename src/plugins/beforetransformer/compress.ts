
import { IPicGo, IPluginConfig, IBuildInCompressOptions } from '../../types'
import { ILocalesKey } from '../../i18n/zh-CN'

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IBuildInCompressOptions>('buildIn.compress') || {}
  const config: IPluginConfig[] = [
    {
      name: 'quality',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_QUALITY') },
      required: false,
      default: userConfig.quality || 100
    },
    {
      name: 'isConvert',
      type: 'confirm',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISCONVERT') },
      required: false,
      default: userConfig.isConvert || false
    },
    {
      name: 'convertFormat',
      type: 'list',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_CONVERTFORMAT') },
      required: false,
      choices: ['avif', 'dz', 'fits', 'gif', 'heif', 'input', 'jpeg', 'jpg', 'jp2', 'jxl', 'magick', 'openslide', 'pdf', 'png', 'ppm', 'raw', 'svg', 'tiff', 'tif', 'v', 'webp'],
      default: 'jpg'
    },
    {
      name: 'isReSize',
      type: 'confirm',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISRESIZE') },
      required: false,
      default: userConfig.isReSize || false
    },
    {
      name: 'reSizeWidth',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_RESIZEWIDTH') },
      required: false,
      default: userConfig.reSizeWidth || 500
    },
    {
      name: 'reSizeHeight',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_RESIZEHEIGHT') },
      required: false,
      default: userConfig.reSizeHeight || 500
    },
    {
      name: 'isReSizeByPercent',
      type: 'confirm',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISRESIZEBYPERCENT') },
      required: false,
      default: userConfig.isReSizeByPercent || false
    },
    {
      name: 'reSizePercent',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_RESIZEPERCENT') },
      required: false,
      default: userConfig.reSizePercent || 50
    },
    {
      name: 'isRotate',
      type: 'confirm',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISROTATE') },
      required: false,
      default: userConfig.isRotate || false
    },
    {
      name: 'rotateDegree',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ROTATEDEGREE') },
      required: false,
      default: userConfig.rotateDegree || 90
    },
    {
      name: 'isRemoveExif',
      type: 'confirm',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISREMOVEEXIF') },
      required: false,
      default: userConfig.isRemoveExif || false
    }
  ]
  return config
}

export default {
  config
}
