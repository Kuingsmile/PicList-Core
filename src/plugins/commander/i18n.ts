import { IPicGo, IPlugin, IStringKeyMap } from '../../types'

const i18n: IPlugin = {
  /** Registers language selection by argument or prompt and persists supported selections. */
  handle: (ctx: IPicGo) => {
    const cmd = ctx.cmd
    cmd.program
      .command('i18n')
      .argument('[lang]')
      .description(ctx.i18n.t('CLI_I18N'))
      .action(async (lang: string = '') => {
        const list = ctx.i18n.getLanguageList()
        if (!lang) {
          const prompts = [
            {
              type: 'list',
              name: 'i18n',
              choices: list,
              message: 'Choose a language',
              default: ctx.getConfig('settings.language') || 'zh-CN',
            },
          ]
          const answer = await ctx.cmd.inquirer.prompt<IStringKeyMap<string>>(prompts)
          lang = answer.i18n
        }
        if (!list.includes(lang)) {
          ctx.log.warn('No such language')
        } else {
          ctx.i18n.setLanguage(lang)
          ctx.log.success(`Language set to ${lang}`)
        }
      })
  },
}

export default i18n
