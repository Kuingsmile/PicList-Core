import { IPicGo, IPlugin } from '../../types'

const config: IPlugin = {
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program.option('-c, --config <path>', ctx.i18n.t('CLI_OPTION_CONFIG'))
  },
}

export default config
