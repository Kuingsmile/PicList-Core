import { IPicGo, IPlugin } from '../../types'

type actionFunc = (plugins: string[], program: any) => void

const createCommand = (
  cmd: any,
  command: string,
  description: string,
  alias: string,
  action: actionFunc,
  options?: { proxy: boolean; registry: boolean },
): void => {
  let program = cmd.program.command(command).description(description).alias(alias)
  if (options?.proxy) {
    program = program.option('-p, --proxy <proxy>', 'Add proxy for installing plugins')
  }
  if (options?.registry) {
    program = program.option('-r, --registry <registry>', 'Choose a registry for installing plugins')
  }
  program.action(action)
}

const pluginHandler: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    createCommand(cmd, 'list', 'list installed plugins', 'ls', () => {
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
      cmd,
      'install <plugins...>',
      'install picgo plugin',
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
    createCommand(cmd, 'uninstall <plugins...>', 'uninstall picgo plugin', 'rm', (plugins: string[]) => {
      ctx.pluginHandler.uninstall(plugins).catch(e => {
        ctx.log.error(e)
      })
    })
    createCommand(
      cmd,
      'update <plugins...>',
      'update picgo plugin',
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
