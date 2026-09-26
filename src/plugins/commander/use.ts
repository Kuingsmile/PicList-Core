import { IConfigItem, IPicGo, IPlugin, IStringKeyMap, Undefinable } from '../../types'
import type { IInquirerQuestion } from '../../utils/inquirerShim'
import { uploaderTranslators } from './utils'

/** Resolves the uploader and prompts for its saved profile when available. */
const selectUploaderConfig = async (
  ctx: IPicGo,
  uploader: string,
  configName?: string,
): Promise<IConfigItem | undefined | null> => {
  if (!ctx.helper.uploader.getIdList().includes(uploader)) {
    ctx.log.error(`No uploader named ${uploader}`)
    return null
  }

  const configs = ctx.configManager.getAllUploaderConfigs(uploader)
  let selectedConfig: IConfigItem | undefined
  if (configName !== undefined) {
    selectedConfig = configs.find(config => config._configName === configName)
    if (!selectedConfig) {
      ctx.log.error(`Config "${configName}" not found for ${uploader}`)
      return null
    }
  } else if (configs.length > 0) {
    const current = ctx.configManager.getCurrentUploaderConfig(uploader)
    const { configId } = await ctx.cmd.inquirer.prompt<{ configId: string }>([
      {
        type: 'list',
        name: 'configId',
        message: `Choose a default config for ${uploader}`,
        choices: configs.map(config => ({
          name: `${config._configName}${config._id === current?._id ? ' (default)' : ''}`,
          value: config._id,
        })),
        default: current?._id,
      },
    ])
    selectedConfig = configs.find(config => config._id === configId)
    if (!selectedConfig) {
      ctx.log.error(`No config selected for ${uploader}`)
      return null
    }
  }

  return selectedConfig
}

/** Activates the chosen uploader and profile after all interactive prompts succeed. */
const useUploader = (ctx: IPicGo, uploader: string, selectedConfig?: IConfigItem): boolean => {
  if (selectedConfig && !ctx.configManager.setDefaultConfig(uploader, selectedConfig._id)) {
    ctx.log.error(`Failed to set "${selectedConfig._configName}" as default for ${uploader}`)
    return false
  }
  ctx.saveConfig({ 'picBed.current': uploader, 'picBed.uploader': uploader })
  return true
}

const use: IPlugin = {
  /**
   * Registers module selection, including interactive or named default uploader profile selection.
   */
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('use')
      .argument('[module]')
      .argument('[name]')
      .argument('[configName]')
      .description(ctx.i18n.t('CLI_USE'))
      .action(async (module?: string, name?: string, configName?: string) => {
        try {
          const installedPlugins = ctx.pluginLoader.getFullList()
          const config: Record<string, IInquirerQuestion> = {
            uploader: {
              type: 'list',
              name: 'uploader',
              message: 'Use an uploader',
              choices: ctx.helper.uploader.getIdList().map((item: string) => ({
                name: uploaderTranslators(ctx)[item] || item,
                value: item,
              })),
              default: ctx.getConfig('picBed.uploader') || ctx.getConfig('picBed.current') || 'smms',
            },
            transformer: {
              type: 'list',
              name: 'transformer',
              message: 'Use a transformer',
              choices: ctx.helper.transformer.getIdList(),
              default: ctx.getConfig<Undefinable<string>>('picBed.transformer') || 'path',
            },
            plugins: {
              type: 'checkbox',
              name: 'plugins',
              message: 'Use plugins',
              choices: installedPlugins,
              when: installedPlugins.length > 0,
              default: Object.keys(ctx.getConfig('picgoPlugins')).filter((item: string) =>
                ctx.getConfig(`picgoPlugins.${item}`),
              ),
            },
          }
          if (module && !Object.hasOwn(config, module)) {
            ctx.log.warn(`No module named ${module}`)
            ctx.log.warn('Available modules are uploader|transformer|plugins')
            return
          }
          if (module !== 'uploader' && (name !== undefined || configName !== undefined)) {
            ctx.log.error('Uploader and config names are only supported by "use uploader"')
            return
          }

          const answer: { uploader?: string; transformer?: string; plugins?: string[] } = {}
          let selectedConfig: IConfigItem | undefined
          if (!module || module === 'uploader') {
            answer.uploader =
              name === undefined ? (await cmd.inquirer.prompt<{ uploader: string }>([config.uploader])).uploader : name
            if (answer.uploader !== undefined) {
              const selection = await selectUploaderConfig(ctx, answer.uploader, configName)
              if (selection === null) return
              selectedConfig = selection
            }
          }

          const remainingPrompts = !module
            ? [config.transformer, config.plugins]
            : module === 'uploader'
              ? []
              : [config[module]]
          if (remainingPrompts.length > 0) {
            Object.assign(
              answer,
              await cmd.inquirer.prompt<{ transformer?: string; plugins?: string[] }>(remainingPrompts),
            )
          }

          if (answer.uploader !== undefined && !useUploader(ctx, answer.uploader, selectedConfig)) return

          if (answer.plugins) {
            const plugins = ctx.getConfig<IStringKeyMap<boolean>>('picgoPlugins')
            for (const item of Object.keys(plugins)) {
              plugins[item] = answer.plugins.includes(item)
            }
            ctx.saveConfig({ picgoPlugins: plugins })
          }
          if (answer.transformer) {
            ctx.saveConfig({ 'picBed.transformer': answer.transformer })
          }
          ctx.log.success('Configure saved successfully!')
        } catch {
          // Prompt and persistence errors may contain private configuration values.
          ctx.log.error('Failed to save configuration.')
        }
      })
  },
}

export default use
