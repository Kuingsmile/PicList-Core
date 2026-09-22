import path from 'node:path'

import fs from 'fs-extra'

import { IPicGo, IPlugin, IUploadOptions } from '../../types'
import { isUrl } from '../../utils/common'

const upload: IPlugin = {
  /**
   * Registers uploads with per-call uploader/profile selection, using clipboard input only when no
   * arguments were supplied.
   */
  handle: (ctx: IPicGo) => {
    ctx.cmd.program
      .command('upload')
      .description(ctx.i18n.t('CLI_UPLOAD'))
      .argument('[input...]')
      .alias('u')
      .option('--picbed <uploader>', ctx.i18n.t('CLI_OPTION_UPLOAD_PICBED'))
      .option('--configName <name>', ctx.i18n.t('CLI_OPTION_UPLOAD_CONFIG_NAME'))
      .action(async (input: string[], options: { picbed?: string; configName?: string }) => {
        try {
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
          let uploadOptions: IUploadOptions | undefined
          if (options.picbed || options.configName) {
            const picBed =
              options.picbed ||
              ctx.getConfig<string>('picBed.uploader') ||
              ctx.getConfig<string>('picBed.current') ||
              'smms'
            if (!ctx.helper.uploader.get(picBed)) {
              throw new Error(`No uploader named ${picBed}`)
            }
            uploadOptions = { picBed, configName: options.configName }
          }
          await ctx.uploadReturnCtx(inputList, uploadOptions)
        } catch (e: any) {
          ctx.log.error(e)
        }
      })
  },
}

export default upload
