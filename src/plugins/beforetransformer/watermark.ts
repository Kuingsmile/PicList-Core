import { type IPicGo, type IPluginConfig, type IBuildInWaterMarkOptions } from '../../types'
import { type ILocalesKey } from '../../i18n/zh-CN'

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IBuildInWaterMarkOptions>('buildIn.watermark') || {}
  const config: IPluginConfig[] = [
    {
      name: 'isAddWatermark',
      type: 'confirm',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_WATERMARK_ISADDWATERMARK') },
      required: false,
      default: userConfig.isAddWatermark || false
    },
    {
      name: 'watermarkType',
      type: 'list',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_WATERMARK_WATERMARKTYPE') },
      required: false,
      choices: ['text', 'image'],
      default: userConfig.watermarkType || 'text'
    },
    {
      name: 'isFullScreenWatermark',
      type: 'confirm',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_WATERMARK_ISFULLSCREENWATERMARK') },
      required: false,
      default: userConfig.isFullScreenWatermark || false
    },
    {
      name: 'watermarkDegree',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_WATERMARK_WATERMARKDEGREE') },
      required: false,
      default: userConfig.watermarkDegree || 0
    },
    {
      name: 'watermarkText',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_WATERMARK_WATERMARKTEXT') },
      required: false,
      default: userConfig.watermarkText || ''
    },
    {
      name: 'watermarkFontPath',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_WATERMARK_WATERMARKTEXTFONTPATH') },
      required: false,
      default: userConfig.watermarkFontPath || ''
    },
    {
      name: 'watermarkScaleRatio',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_WATERMARK_WATERMARKFONTRATIO') },
      required: false,
      default: userConfig.watermarkScaleRatio || 0.15
    },
    {
      name: 'watermarkColor',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_WATERMARK_WATERMARKFONTCOLOR') },
      required: false,
      default: userConfig.watermarkColor || 'rgba(204, 204, 204, 0.45)'
    },
    {
      name: 'watermarkImagePath',
      type: 'input',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_WATERMARK_WATERMARKIMAGEPATH') },
      required: false,
      default: userConfig.watermarkImagePath || ''
    },
    {
      name: 'watermarkPosition',
      type: 'list',
      get alias () { return ctx.i18n.translate<ILocalesKey>('BUILDIN_WATERMARK_WATERMARKPOSITION') },
      required: false,
      choices: ['north', 'northeast', 'southeast', 'south', 'southwest', 'northwest', 'west', 'east', 'center', 'centre'],
      default: userConfig.watermarkPosition || 'southeast'
    }
  ]
  return config
}

export default {
  config
}
