import path from 'node:path'

import fs from 'fs-extra'

import { IPicGo, IPlugin } from '../../types'
import { isUrl } from '../../utils/common'

const upload: IPlugin = {
  handle: (ctx: IPicGo) => {
    ctx.cmd.program
      .command('upload')
      .description('upload, go go go')
      .arguments('[input...]')
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
          await ctx.upload(inputList)
        })().catch(e => {
          ctx.log.error(e)
        })
      })
  }
}

export default upload
