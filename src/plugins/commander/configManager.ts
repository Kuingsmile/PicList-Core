import type { Command } from 'commander'

import { IConfigItem, IPicGo, IStringKeyMap } from '../../types'
import { handleSetting } from './setting'

/** Logs profile metadata and non-metadata configuration fields for the config show command. */
const printConfigDetails = (ctx: IPicGo, config: IConfigItem, name?: string) => {
  ctx.log.info(`Config details for "${name ?? config._configName}":`)
  ctx.log.info(`  ID: ${config._id}`)
  ctx.log.info(`  Created: ${new Date(config._createdAt).toLocaleString()}`)
  ctx.log.info(`  Updated: ${new Date(config._updatedAt).toLocaleString()}`)
  ctx.log.info('Config values:')

  Object.entries(config).forEach(([key, value]) => {
    if (!key.startsWith('_')) {
      ctx.log.info(`  ${key}: ${JSON.stringify(value)}`)
    }
  })
}

/** Looks up a named profile and logs a missing-profile error instead of throwing. */
const getConfigOrLogError = (ctx: IPicGo, uploader: string, configName: string): IConfigItem | undefined => {
  const config = ctx.configManager.getConfigByName(uploader, configName)

  if (!config) {
    ctx.log.error(`Config "${configName}" not found for ${uploader}`)
    return undefined
  }

  return config
}

/** Registers profile actions under `config`, and optionally as hidden legacy flat commands. */
const registerProfileCommands = (ctx: IPicGo, parent: Command, prefix = '', hidden = false) => {
  const command = (name: string) => parent.command(`${prefix}${name}`, { hidden })

  command('list')
    .description(ctx.i18n.t('CLI_CONFIG_LIST'))
    .argument('<uploader>')
    .action((uploader: string) => {
      try {
        const configs = ctx.configManager.getAllUploaderConfigs(uploader)
        const defaultConfig = ctx.configManager.getCurrentUploaderConfig(uploader)

        if (configs.length === 0) {
          ctx.log.info(`No configs found for ${uploader}`)
          return
        }

        ctx.log.info(`Configs for ${uploader}:`)
        configs.forEach((config: IConfigItem) => {
          const marker = defaultConfig && config._id === defaultConfig._id ? ' (default)' : ''
          ctx.log.info(`  - ${config._configName}${marker} [ID: ${config._id}]`)
        })
      } catch (e: any) {
        ctx.log.error(e)
      }
    })

  command('use')
    .description(ctx.i18n.t('CLI_CONFIG_USE'))
    .argument('<uploader>')
    .argument('<configName>')
    .action((uploader: string, configName: string) => {
      try {
        const config = getConfigOrLogError(ctx, uploader, configName)
        if (!config) return

        const success = ctx.configManager.setDefaultConfig(uploader, config._id)
        success
          ? ctx.log.success(`Set "${configName}" as default config for ${uploader}`)
          : ctx.log.error(`Failed to set "${configName}" as default`)
      } catch (e: any) {
        ctx.log.error(e)
      }
    })

  command('remove')
    .description(ctx.i18n.t('CLI_CONFIG_REMOVE'))
    .argument('<uploader>')
    .argument('<configName>')
    .action(async (uploader: string, configName: string) => {
      try {
        const config = getConfigOrLogError(ctx, uploader, configName)
        if (!config) return

        const answer = await ctx.cmd.inquirer.prompt<IStringKeyMap<boolean>>([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete config "${configName}"?`,
            default: false,
          },
        ])
        if (!answer.confirm) {
          ctx.log.info('Cancelled')
          return
        }
        const success = ctx.configManager.deleteUploaderConfig(uploader, config._id)
        success
          ? ctx.log.success(`Deleted config "${configName}" for ${uploader}`)
          : ctx.log.error(`Failed to delete config "${configName}"`)
      } catch (e: any) {
        ctx.log.error(e)
      }
    })

  command('rename')
    .description(ctx.i18n.t('CLI_CONFIG_RENAME'))
    .argument('<uploader>')
    .argument('<oldName>')
    .argument('<newName>')
    .action((uploader: string, oldName: string, newName: string) => {
      try {
        const config = getConfigOrLogError(ctx, uploader, oldName)
        if (!config) return
        const success = ctx.configManager.renameConfig(uploader, config._id, newName)
        success
          ? ctx.log.success(`Renamed config from "${oldName}" to "${newName}"`)
          : ctx.log.error(`Failed to rename config`)
      } catch (e: any) {
        ctx.log.error(e)
      }
    })

  command('show')
    .description(ctx.i18n.t('CLI_CONFIG_SHOW'))
    .argument('<uploader>')
    .argument('[configName]')
    .action((uploader: string, configName: string | undefined) => {
      try {
        if (!configName) {
          const configs = ctx.configManager.getAllUploaderConfigs(uploader)
          if (!configs || configs.length === 0) {
            ctx.log.info(`No configs found for ${uploader}`)
            return
          }
          configs.forEach(config => printConfigDetails(ctx, config))
          return
        }
        const config = getConfigOrLogError(ctx, uploader, configName)
        if (!config) return
        printConfigDetails(ctx, config, configName)
      } catch (e: any) {
        ctx.log.error(e)
      }
    })
}

const configCmd = {
  /** Registers the `config` group and its profile actions. */
  handle: (ctx: IPicGo) => {
    const config = ctx.cmd.program.command('config').description(ctx.i18n.t('CLI_CONFIG'))
    registerProfileCommands(ctx, config)
    registerProfileCommands(ctx, ctx.cmd.program, 'config-', true)

    for (const module of ['uploader', 'secondUploader', 'transformer', 'plugin', 'buildin']) {
      config
        .command(module, { hidden: true })
        .argument('[name]')
        .argument('[configName]')
        .argument('[uploaderName]')
        .action((name?: string, configName?: string, uploaderName?: string) =>
          handleSetting(ctx, module, name, configName, uploaderName),
        )
    }

    config
      .command('edit')
      .description(ctx.i18n.t('CLI_CONFIG_EDIT'))
      .argument('<uploader>')
      .argument('[configName]')
      .action(async (uploader: string, configName?: string) => {
        try {
          const saved = configName
            ? getConfigOrLogError(ctx, uploader, configName)
            : ctx.configManager.getCurrentUploaderConfig(uploader)
          if (!saved) {
            if (!configName) ctx.log.error(`No default config found for ${uploader}`)
            return
          }

          const uploaderPlugin = ctx.helper.uploader.get(uploader)
          if (!uploaderPlugin?.config) {
            ctx.log.error(`No editable uploader named ${uploader}`)
            return
          }

          const prompts = uploaderPlugin.config(ctx).map(question => ({
            ...question,
            default: question.name in saved ? saved[question.name] : question.default,
          }))
          const answer = await ctx.cmd.inquirer.prompt(prompts)
          const success = ctx.configManager.updateUploaderConfig(uploader, saved._id, { ...saved, ...answer })
          success
            ? ctx.log.success(`Updated config "${saved._configName}" for ${uploader}`)
            : ctx.log.error(`Failed to update config "${saved._configName}"`)
        } catch (e: any) {
          ctx.log.error(e)
        }
      })
  },
}

export default configCmd
