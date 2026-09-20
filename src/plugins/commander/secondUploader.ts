import { IConfigItem, IPicGo } from '../../types'
import { uploaderTranslators } from './utils'

/**
 * Prompts for secondary-upload enablement, destination, profile, and processing mode.
 *
 * @param ctx - Client whose settings and prompt adapter are used.
 * @param uploaderName - Optional uploader type to select without prompting for it.
 * @param configName - Optional saved profile name to select without prompting for it.
 * @returns Whether secondary settings were saved or disabled; false for an unavailable uploader or
 * profile.
 */
export const handleSecondUploader = async (
  ctx: IPicGo,
  uploaderName?: string,
  configName?: string,
): Promise<boolean> => {
  const { enableSecondUploader } = await ctx.cmd.inquirer.prompt<{ enableSecondUploader: boolean }>([
    {
      type: 'confirm',
      name: 'enableSecondUploader',
      message: 'Enable secondary upload?',
      default: ctx.getConfig<boolean>('settings.enableSecondUploader') || false,
    },
  ])

  if (!enableSecondUploader) {
    ctx.saveConfig({ 'settings.enableSecondUploader': false })
    return true
  }

  const currentUploader = ctx.getConfig<string>('picBed.secondUploader')
  const currentConfig = ctx.getConfig<IConfigItem>('picBed.secondUploaderConfig')
  const uploaders = ctx.helper.uploader.getIdList()
  if (!uploaderName) {
    if (uploaders.length === 0) {
      ctx.log.error('No uploaders available')
      return false
    }
    const answer = await ctx.cmd.inquirer.prompt<{ uploader: string }>([
      {
        type: 'list',
        name: 'uploader',
        message: 'Choose a secondary uploader',
        choices: uploaders.map(value => ({ name: uploaderTranslators(ctx)[value] || value, value })),
        default: currentUploader,
      },
    ])
    uploaderName = answer.uploader
  }

  if (!uploaders.includes(uploaderName)) {
    ctx.log.error(`No uploader named ${uploaderName}`)
    return false
  }

  const configs = ctx.configManager.getAllUploaderConfigs(uploaderName)
  if (configs.length === 0) {
    ctx.log.error(`No configs found for ${uploaderName}. Run 'picgo set uploader ${uploaderName}' first.`)
    return false
  }

  let selectedConfig: IConfigItem | undefined
  if (configName) {
    selectedConfig = configs.find(config => config._configName === configName)
  } else {
    const selectedId = currentUploader === uploaderName ? currentConfig?._id : undefined
    const defaultId = configs.some(config => config._id === selectedId)
      ? selectedId
      : ctx.configManager.getCurrentUploaderConfig(uploaderName)?._id
    const answer = await ctx.cmd.inquirer.prompt<{ configId: string }>([
      {
        type: 'list',
        name: 'configId',
        message: 'Choose a secondary uploader config',
        choices: configs.map(config => ({ name: config._configName, value: config._id })),
        default: defaultId,
      },
    ])
    selectedConfig = configs.find(config => config._id === answer.configId)
  }

  if (!selectedConfig) {
    ctx.log.error(`Config "${configName || ''}" not found for ${uploaderName}`)
    return false
  }

  const { secondPicBedMode } = await ctx.cmd.inquirer.prompt<{ secondPicBedMode: 'shared' | 'seperate' }>([
    {
      type: 'list',
      name: 'secondPicBedMode',
      message: 'Choose secondary upload processing mode',
      choices: [
        { name: "Share the primary uploader's processed files", value: 'shared' },
        { name: 'Process the original files separately', value: 'seperate' },
      ],
      default: ctx.getConfig<string>('settings.secondPicBedMode') === 'seperate' ? 'seperate' : 'shared',
    },
  ])

  ctx.saveConfig({
    'picBed.secondUploader': uploaderName,
    'picBed.secondUploaderConfig': selectedConfig,
    'settings.enableSecondUploader': true,
    'settings.secondPicBedMode': secondPicBedMode,
  })
  return true
}
