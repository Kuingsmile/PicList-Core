import { ILocalesKey } from '../../i18n/zh-CN'
import { IPicGo, IPluginConfig, IStringKeyMap } from '../../types'
import compress from '../beforetransformer/compress'
import skipProcess from '../beforetransformer/skipProcess'
import watermark from '../beforetransformer/watermark'
import rename from '../beforeupload/buildInRename'
import { uploaderTranslators } from './utils'

// Built-in modules configuration mapping
const BUILDIN_MODULES = {
  compress: { config: compress.config, key: 'BUILDIN_COMPRESS' as ILocalesKey },
  watermark: { config: watermark.config, key: 'BUILDIN_WATERMARK' as ILocalesKey },
  rename: { config: rename.config, key: 'BUILDIN_RENAME' as ILocalesKey },
  skipProcess: { config: skipProcess.config, key: 'BUILDIN_SKIPPROCESS' as ILocalesKey }
} as const

type BuildinModuleName = keyof typeof BUILDIN_MODULES

const handleConfig = async (ctx: IPicGo, prompts: IPluginConfig[], module: string, name: string): Promise<void> => {
  const answer = await ctx.cmd.inquirer.prompt(prompts)
  const configName = getConfigName(module, name)

  ctx.saveConfig({ [configName]: answer })

  // Handle additional config for specific modules
  if (module === 'uploader') {
    ctx.saveConfig({
      'picBed.current': name,
      'picBed.uploader': name
    })
  } else if (module === 'transformer') {
    ctx.saveConfig({
      'picBed.transformer': name
    })
  }
}

const getConfigName = (module: string, name: string): string => {
  const configMap: Record<string, string> = {
    uploader: `picBed.${name}`,
    transformer: `transformer.${name}`,
    buildin: `buildIn.${name}`
  }
  return configMap[module] || name
}

const handleBuildinModule = async (ctx: IPicGo, name?: string): Promise<void> => {
  if (name && name in BUILDIN_MODULES) {
    const module = BUILDIN_MODULES[name as BuildinModuleName]
    await handleConfig(ctx, module.config(ctx), 'buildin', name)
    return
  }

  // Show selection prompt
  const choices = Object.entries(BUILDIN_MODULES).map(([value, { key }]) => ({
    name: ctx.i18n.translate<ILocalesKey>(key),
    value
  }))

  const prompts = [
    {
      type: 'list',
      name: 'buildin',
      choices,
      message: 'Choose a buildin module'
    }
  ]

  const answer = await ctx.cmd.inquirer.prompt<IStringKeyMap<string>>(prompts)
  const selectedModule = BUILDIN_MODULES[answer.buildin as BuildinModuleName]
  await handleConfig(ctx, selectedModule.config(ctx), 'buildin', answer.buildin)
}

const handleUploaderOrTransformer = async (
  ctx: IPicGo,
  module: 'uploader' | 'transformer',
  name?: string
): Promise<void> => {
  if (name) {
    const item = ctx.helper[module].get(name)
    if (!item) {
      ctx.log.error(`No ${module} named ${name}`)
      return
    }
    if (item.config) {
      await handleConfig(ctx, item.config(ctx), module, name)
    }
    return
  }

  // Show selection prompt
  const choices = ctx.helper[module].getIdList().map((item: string) => ({
    name: uploaderTranslators(ctx)[item] || item,
    value: item
  }))

  const prompts = [
    {
      type: 'list',
      name: module,
      choices,
      message: `Choose a(n) ${module}`
    }
  ]

  const answer = await ctx.cmd.inquirer.prompt<IStringKeyMap<string>>(prompts)
  const item = ctx.helper[module].get(answer[module])
  if (item?.config) {
    await handleConfig(ctx, item.config(ctx), module, answer[module])
  }
}

const handlePlugin = async (ctx: IPicGo, name?: string): Promise<void> => {
  if (name) {
    const pluginName = name.includes('picgo-plugin-') ? name : `picgo-plugin-${name}`

    if (!Object.keys(ctx.getConfig('picgoPlugins')).includes(pluginName)) {
      ctx.log.error(`No plugin named ${pluginName}`)
      return
    }

    const plugin = ctx.pluginLoader.getPlugin(pluginName)
    if (plugin?.config) {
      await handleConfig(ctx, plugin.config(ctx), 'plugin', pluginName)
    }
    return
  }

  // Show selection prompt
  const prompts = [
    {
      type: 'list',
      name: 'plugin',
      choices: ctx.pluginLoader.getFullList(),
      message: 'Choose a plugin'
    }
  ]

  const answer = await ctx.cmd.inquirer.prompt<IStringKeyMap<string>>(prompts)
  const plugin = ctx.pluginLoader.getPlugin(answer.plugin)
  if (plugin?.config) {
    await handleConfig(ctx, plugin.config(ctx), 'plugin', answer.plugin)
  }
}

const setting = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('set')
      .alias('config')
      .arguments('<module> [name]')
      .description('configure config of picgo modules, uploader|transformer|plugin|buildin')
      .action((module: string, name: string) => {
        ;(async () => {
          try {
            // Handle different module types
            switch (module) {
              case 'buildin':
                await handleBuildinModule(ctx, name)
                break
              case 'uploader':
              case 'transformer':
                await handleUploaderOrTransformer(ctx, module, name)
                break
              case 'plugin':
                await handlePlugin(ctx, name)
                break
              default:
                ctx.log.warn(`No module named ${module}`)
                ctx.log.warn('Available modules are uploader|transformer|plugin|buildin')
                return
            }

            ctx.log.success('Configure config successfully!')
            if (module === 'plugin') {
              ctx.log.info("If you want to use this config, please run 'picgo use plugins'")
            }
          } catch (e: any) {
            ctx.log.error(e)
            if (process.argv.includes('--debug')) {
              throw e
            }
          }
        })().catch(e => {
          ctx.log.error(e)
        })
      })
  }
}

export default setting
