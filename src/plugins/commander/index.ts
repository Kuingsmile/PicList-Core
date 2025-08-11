import { IPicGo } from '../../types'
import config from './config'
import i18n from './i18n'
import pluginHandler from './pluginHandler'
import proxy from './proxy'
import setting from './setting'
import upload from './upload'
import use from './use'

export default (ctx: IPicGo): void => {
  ctx.cmd.register('pluginHandler', pluginHandler)
  ctx.cmd.register('config', config)
  ctx.cmd.register('setting', setting)
  ctx.cmd.register('upload', upload)
  ctx.cmd.register('use', use)
  ctx.cmd.register('proxy', proxy)
  ctx.cmd.register('i18n', i18n)
}
