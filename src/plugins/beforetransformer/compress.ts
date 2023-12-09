import { type IPicGo, type IPluginConfig, type IBuildInCompressOptions } from '../../types'
import { type ILocalesKey } from '../../i18n/zh-CN'

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IBuildInCompressOptions>('buildIn.compress') || {}
  const config: IPluginConfig[] = [
    {
      name: 'quality',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_QUALITY') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_QUALITY') },
      required: false,
      default: userConfig.quality || 100
    },
    {
      name: 'isConvert',
      type: 'confirm',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISCONVERT') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISCONVERT') },
      required: false,
      default: userConfig.isConvert || false
    },
    {
      name: 'convertFormat',
      type: 'list',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_CONVERTFORMAT') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_CONVERTFORMAT') },
      required: false,
      choices: ['avif', 'dz', 'fits', 'gif', 'heif', 'input', 'jpeg', 'jpg', 'jp2', 'jxl', 'magick', 'openslide', 'pdf', 'png', 'ppm', 'raw', 'svg', 'tiff', 'tif', 'v', 'webp'],
      default: 'jpg'
    },
    {
      name: 'isReSize',
      type: 'confirm',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISRESIZE') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISRESIZE') },
      required: false,
      default: userConfig.isReSize || false
    },
    {
      name: 'reSizeWidth',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_RESIZEWIDTH') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_RESIZEWIDTH') },
      required: false,
      default: userConfig.reSizeWidth || 500
    },
    {
      name: 'reSizeHeight',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_RESIZEHEIGHT') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_RESIZEHEIGHT') },
      required: false,
      default: userConfig.reSizeHeight || 500
    },
    {
      name: 'skipReSizeOfSmallImg',
      type: 'confirm',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_SKIPRESIZEOFSMALLIMG') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_SKIPRESIZEOFSMALLIMG') },
      required: false,
      default: userConfig.skipReSizeOfSmallImg || false
    },
    {
      name: 'isReSizeByPercent',
      type: 'confirm',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISRESIZEBYPERCENT') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISRESIZEBYPERCENT') },
      required: false,
      default: userConfig.isReSizeByPercent || false
    },
    {
      name: 'reSizePercent',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_RESIZEPERCENT') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_RESIZEPERCENT') },
      required: false,
      default: userConfig.reSizePercent || 50
    },
    {
      name: 'isFlip',
      type: 'confirm',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISFLIP') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISFLIP') },
      required: false,
      default: userConfig.isFlip || false
    },
    {
      name: 'isFlop',
      type: 'confirm',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISFLOP') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISFLOP') },
      required: false,
      default: userConfig.isFlop || false
    },
    {
      name: 'isRotate',
      type: 'confirm',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISROTATE') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISROTATE') },
      required: false,
      default: userConfig.isRotate || false
    },
    {
      name: 'rotateDegree',
      type: 'input',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ROTATEDEGREE') },
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ROTATEDEGREE') },
      required: false,
      default: userConfig.rotateDegree || 90
    },
    {
      name: 'isRemoveExif',
      type: 'confirm',
      get prefix () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_COMPRESS_ISREMOVEEXIF') },
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
