import path from 'node:path'

import fs from 'fs-extra'

import { IPicGo, IPlugin } from '../../types'
import { isUrl } from '../../utils/common'

const upload: IPlugin = {
  handle: (ctx: IPicGo) => {
    ctx.cmd.program
      .command('upload')
      .description(ctx.i18n.t('CLI_UPLOAD'))
      .argument('[input...]')
      .alias('u')
      .action((input: string[]) => {
        ;(async () => {
          const inputList = input
            .map((item: string) => {
              return isUrl(item) ? item : path.resolve(item)
            })
            .filter((item: string) => {
              const exist = fs.existsSync(item) || isUrl(item)
              if (!exist) {
                ctx.log.warn(`${item} does not exist.`)
              }
              return exist
            })
          // Only an invocation without inputs should fall back to the clipboard.
          if (input.length > 0 && inputList.length === 0) {
            return
          }
          await ctx.uploadReturnCtx(inputList)
        })().catch(e => {
          ctx.log.error(e)
        })
      })
  },
}

export default upload
