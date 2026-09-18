import { IPicGo, IPlugin } from '../../types'

type actionFunc = (plugins: string[], program: any) => void

const createCommand = (
  ctx: IPicGo,
  command: string,
  description: string,
  alias: string,
  action: actionFunc,
  options?: { proxy: boolean; registry: boolean },
): void => {
  let program = ctx.cmd.program.command(command).description(description).alias(alias)
  if (options?.proxy) {
    program = program.option('-p, --proxy <proxy>', ctx.i18n.t('CLI_OPTION_PLUGIN_PROXY'))
  }
  if (options?.registry) {
    program = program.option('-r, --registry <registry>', ctx.i18n.t('CLI_OPTION_PLUGIN_REGISTRY'))
  }
  program.action(action)
}

const pluginHandler: IPlugin = {
  handle: (ctx: IPicGo) => {
    createCommand(ctx, 'list', ctx.i18n.t('CLI_LIST'), 'ls', () => {
      ctx.pluginHandler
        .getList()
        .then(plugins => {
          if (plugins.length === 0) {
            ctx.log.info('No plugins installed')
          } else {
            ctx.log.info('Installed plugins:')
            plugins.forEach(plugin => {
              ctx.log.info(`- ${plugin}`)
            })
          }
        })
        .catch(e => {
          ctx.log.error(e)
        })
    })
    createCommand(
      ctx,
      'install <plugins...>',
      ctx.i18n.t('CLI_INSTALL'),
      'add',
      (plugins: string[], program: any) => {
        const { proxy, registry } = program
        const options = { proxy, registry }
        ctx.pluginHandler.install(plugins, options).catch(e => {
          ctx.log.error(e)
        })
      },
      { proxy: true, registry: true },
    )
    createCommand(ctx, 'uninstall <plugins...>', ctx.i18n.t('CLI_UNINSTALL'), 'rm', (plugins: string[]) => {
      ctx.pluginHandler.uninstall(plugins).catch(e => {
        ctx.log.error(e)
      })
    })
    createCommand(
      ctx,
      'update <plugins...>',
      ctx.i18n.t('CLI_UPDATE'),
      'up',
      (plugins: string[], program: any) => {
        const { proxy, registry } = program
        const options = { proxy, registry }
        ctx.pluginHandler.update(plugins, options).catch((e: Error) => {
          ctx.log.error(e)
        })
      },
      { proxy: true, registry: true },
    )
  },
}

export default pluginHandler
