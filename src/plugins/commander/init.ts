import type { IConfigItem, IPicGo, IPlugin } from '../../types'
import { invalidFields, isEmptyValue, isSecretQuestion } from '../../utils/configPrompts'
import { uploaderTranslators } from './utils'

/**
 * Collects and validates a named uploader profile before saving it as the active default.
 *
 * @remarks
 * Existing profiles require overwrite confirmation. Secret fields are not prefilled, and cancellation
 * before the final save leaves profile migration and persisted settings untouched.
 */
const setupUploader = async (ctx: IPicGo): Promise<void> => {
  const { t } = ctx.i18n
  const uploaders = ctx.helper.uploader.getIdList()
  if (!uploaders.length) throw new Error('No uploaders available')
  const labels = uploaderTranslators(ctx)
  const { uploader } = await ctx.cmd.inquirer.prompt<{ uploader: string }>([
    {
      type: 'list',
      name: 'uploader',
      message: t('CLI_INIT_UPLOADER'),
      choices: uploaders.map(value => ({ name: `${labels[value] || value} (${value})`, value })),
      default: ctx.getConfig<string>('picBed.uploader') || ctx.getConfig<string>('picBed.current'),
    },
  ])
  const plugin = ctx.helper.uploader.get(uploader)
  if (!plugin) throw new Error('Uploader unavailable')

  const { configName } = await ctx.cmd.inquirer.prompt<{ configName: string }>([
    {
      type: 'input',
      name: 'configName',
      message: t('CLI_INIT_CONFIG_NAME'),
      default: 'Default',
      validate: (value: string) => !!value.trim() || t('CLI_INIT_REQUIRED'),
      filter: (value: string) => value.trim(),
    },
  ])
  if (!configName) throw new Error('Configuration name required')

  // Read without triggering legacy migration: cancellation must leave saved settings alone.
  const configs = ctx.getConfig<IConfigItem[] | undefined>(`uploader.${uploader}.configList`)
  const legacy = ctx.getConfig<Partial<IConfigItem> | undefined>(`picBed.${uploader}`)
  const existing = configs
    ? configs.find(config => config._configName === configName)
    : legacy &&
        Object.values(legacy).some(value => !isEmptyValue(value)) &&
        (legacy._configName || 'Default') === configName
      ? legacy
      : undefined
  if (existing) {
    const { overwrite } = await ctx.cmd.inquirer.prompt<{ overwrite: boolean }>([
      { type: 'confirm', name: 'overwrite', message: t('CLI_INIT_OVERWRITE'), default: false },
    ])
    if (!overwrite) {
      ctx.log.info(t('CLI_INIT_CANCELLED'))
      return
    }
  }

  const questions = (plugin.config?.(ctx) || []).map(question => {
    const secret = isSecretQuestion(question)
    return {
      ...question,
      type: secret ? 'password' : question.type,
      default: secret ? undefined : (existing?.[question.name] ?? question.default),
      transformer: secret ? undefined : question.transformer,
      /**
       * Validates a setup answer while replacing provider messages and exceptions with generic
       * localized errors.
       */
      validate: async (value: unknown) => {
        if (isEmptyValue(value)) return !question.required || t('CLI_INIT_REQUIRED')
        try {
          const result = question.validate ? await question.validate(value) : true
          return result === true || t('CLI_INIT_INVALID')
        } catch {
          return t('CLI_INIT_INVALID')
        }
      },
    }
  })
  const answers = await ctx.cmd.inquirer.prompt(questions)
  // Filters may change answers after prompt validation.
  if ((await invalidFields(questions, answers)).length) throw new Error('Invalid configuration')

  const saved = ctx.configManager.getConfigByName(uploader, configName)
  if (saved) {
    ctx.configManager.updateUploaderConfig(uploader, saved._id, { ...saved, ...answers })
  }
  const config = saved || ctx.configManager.addUploaderConfig(uploader, configName, answers)
  ctx.configManager.setDefaultConfig(uploader, config._id)
  ctx.saveConfig({ 'picBed.current': uploader, 'picBed.uploader': uploader })
  ctx.log.success(t('CLI_INIT_SUCCESS'))
}

const init: IPlugin = {
  /** Registers interactive first-run setup and converts provider errors to a safe generic CLI failure. */
  handle: (ctx: IPicGo) => {
    ctx.cmd.program
      .command('init')
      .description(ctx.i18n.t('CLI_INIT'))
      .action(async () => {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
          throw new Error(ctx.i18n.t('CLI_INIT_TERMINAL'))
        }
        try {
          await setupUploader(ctx)
        } catch (error) {
          if (error instanceof Error && ['ExitPromptError', 'AbortPromptError'].includes(error.name)) {
            ctx.log.info(ctx.i18n.t('CLI_INIT_CANCELLED'))
            process.exitCode = 130
            return
          }
          // Plugin forms and validators can include credentials in their errors.
          // eslint-disable-next-line preserve-caught-error -- Do not expose credentials through the error cause.
          throw new Error(ctx.i18n.t('CLI_INIT_FAILED'))
        }
      })
  },
}

export default init
