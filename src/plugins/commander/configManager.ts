import { IConfigItem, IPicGo, IStringKeyMap } from '../../types'

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

const getConfigOrLogError = (ctx: IPicGo, uploader: string, configName: string): IConfigItem | undefined => {
  const config = ctx.configManager.getConfigByName(uploader, configName)

  if (!config) {
    ctx.log.error(`Config "${configName}" not found for ${uploader}`)
    return undefined
  }

  return config
}

const configCmd = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('config-list')
      .description('list all configs names for an uploader')
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

    cmd.program
      .command('config-use')
      .description('set a config as default for an uploader')
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

    cmd.program
      .command('config-remove')
      .description('remove a config for an uploader')
      .argument('<uploader>')
      .argument('<configName>')
      .action((uploader: string, configName: string) => {
        ;(async () => {
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
        })().catch(e => {
          ctx.log.error(e)
        })
      })

    cmd.program
      .command('config-rename')
      .description('rename a config for an uploader')
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

    cmd.program
      .command('config-show')
      .description('show details of a config')
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
  },
}

export default configCmd
