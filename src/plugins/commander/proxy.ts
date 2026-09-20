import { IPicGo, IPlugin } from '../../types'

const proxy: IPlugin = {
  /** Registers the CLI proxy option as an in-memory upload setting for the current process. */
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program.option('-p, --proxy <url>', ctx.i18n.t('CLI_OPTION_PROXY'), (proxy: string) => {
      ctx.setConfig({
        'picBed.proxy': proxy,
      })
    })
  },
}

export default proxy
