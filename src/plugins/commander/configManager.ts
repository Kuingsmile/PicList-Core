import { IConfigItem, IPicGo, IStringKeyMap } from '../../types'

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
            const isDefault = defaultConfig && config._id === defaultConfig._id
            const marker = isDefault ? ' (default)' : ''
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
          const config = ctx.configManager.getConfigByName(uploader, configName)

          if (!config) {
            ctx.log.error(`Config "${configName}" not found for ${uploader}`)
            return
          }

          const success = ctx.configManager.setDefaultConfig(uploader, config._id)

          if (success) {
            ctx.log.success(`Set "${configName}" as default config for ${uploader}`)
          } else {
            ctx.log.error(`Failed to set "${configName}" as default`)
          }
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
            const config = ctx.configManager.getConfigByName(uploader, configName)

            if (!config) {
              ctx.log.error(`Config "${configName}" not found for ${uploader}`)
              return
            }

            const prompts = [
              {
                type: 'confirm',
                name: 'confirm',
                message: `Are you sure you want to delete config "${configName}"?`,
                default: false,
              },
            ]

            const answer = await ctx.cmd.inquirer.prompt<IStringKeyMap<boolean>>(prompts)

            if (!answer.confirm) {
              ctx.log.info('Cancelled')
              return
            }

            const success = ctx.configManager.deleteUploaderConfig(uploader, config._id)

            if (success) {
              ctx.log.success(`Deleted config "${configName}" for ${uploader}`)
            } else {
              ctx.log.error(`Failed to delete config "${configName}"`)
            }
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
          const config = ctx.configManager.getConfigByName(uploader, oldName)

          if (!config) {
            ctx.log.error(`Config "${oldName}" not found for ${uploader}`)
            return
          }

          const success = ctx.configManager.renameConfig(uploader, config._id, newName)

          if (success) {
            ctx.log.success(`Renamed config from "${oldName}" to "${newName}"`)
          } else {
            ctx.log.error(`Failed to rename config`)
          }
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
            configs.forEach(config => {
              ctx.log.info(`Config details for "${config._configName}":`)
              ctx.log.info(`  ID: ${config._id}`)
              ctx.log.info(`  Created: ${new Date(config._createdAt).toLocaleString()}`)
              ctx.log.info(`  Updated: ${new Date(config._updatedAt).toLocaleString()}`)
              ctx.log.info(`Config values:`)

              Object.keys(config).forEach(key => {
                if (!key.startsWith('_')) {
                  const value = config[key]
                  const displayValue = JSON.stringify(value)
                  ctx.log.info(`  ${key}: ${displayValue}`)
                }
              })
            })
            return
          }
          const config = ctx.configManager.getConfigByName(uploader, configName)

          if (!config) {
            ctx.log.error(`Config "${configName}" not found for ${uploader}`)
            return
          }

          ctx.log.info(`Config details for "${configName}":`)
          ctx.log.info(`  ID: ${config._id}`)
          ctx.log.info(`  Created: ${new Date(config._createdAt).toLocaleString()}`)
          ctx.log.info(`  Updated: ${new Date(config._updatedAt).toLocaleString()}`)
          ctx.log.info(`Config values:`)
          Object.keys(config).forEach(key => {
            if (!key.startsWith('_')) {
              const value = config[key]
              const displayValue = JSON.stringify(value)
              ctx.log.info(`  ${key}: ${displayValue}`)
            }
          })
        } catch (e: any) {
          ctx.log.error(e)
        }
      })
  },
}

export default configCmd
