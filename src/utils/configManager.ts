import { v4 as uuid } from 'uuid'

import { IConfig, IConfigItem, IPicGo, IUploaderConfigList } from '../types'

/** Manages named uploader profiles and synchronizes active and secondary uploader settings. */
export class ConfigManager {
  private readonly ctx: IPicGo

  constructor(ctx: IPicGo) {
    this.ctx = ctx
  }

  /** Persists legacy uploader settings as a named profile if no multi-profile entry exists. */
  migrateToMultiConfig(uploaderName: string): void {
    const config = this.ctx.getConfig<IConfig>()
    const uploaderConfig = this.ctx.getConfig<any>(`picBed.${uploaderName}`)

    if (config.uploader && config.uploader[uploaderName]) {
      return
    }

    if (!config.uploader) {
      config.uploader = {}
    }

    if (uploaderConfig && Object.keys(uploaderConfig).length > 0) {
      const configItem: IConfigItem = {
        ...uploaderConfig,
        _id: uploaderConfig._id || uuid(),
        _configName: uploaderConfig._configName || 'Default',
        _createdAt: uploaderConfig._createdAt || Date.now(),
        _updatedAt: uploaderConfig._updatedAt || Date.now(),
      }

      config.uploader[uploaderName] = {
        configList: [configItem],
        defaultId: configItem._id,
      }

      this.ctx.saveConfig({
        uploader: config.uploader,
      })
      this.ctx.saveConfig({
        [`picBed.${uploaderName}`]: configItem,
      })
    } else {
      config.uploader[uploaderName] = {
        configList: [],
        defaultId: '',
      }
      this.ctx.saveConfig({
        uploader: config.uploader,
      })
    }
  }

  /** Migrates legacy settings if needed and returns the default profile, or null if none matches. */
  getCurrentUploaderConfig(uploaderName: string): IConfigItem | null {
    this.migrateToMultiConfig(uploaderName)

    const uploaderData = this.ctx.getConfig<IUploaderConfigList>(`uploader.${uploaderName}`)
    if (!uploaderData || !uploaderData.defaultId) {
      return null
    }

    const currentConfig = uploaderData.configList.find(item => item._id === uploaderData.defaultId)
    return currentConfig || null
  }

  /** Migrates legacy settings if needed and returns every saved profile for an uploader. */
  getAllUploaderConfigs(uploaderName: string): IConfigItem[] {
    this.migrateToMultiConfig(uploaderName)

    const uploaderData = this.ctx.getConfig<IUploaderConfigList>(`uploader.${uploaderName}`)
    return uploaderData?.configList || []
  }

  /** Persists a profile with fresh identity and timestamps, making the first profile the default. */
  addUploaderConfig(uploaderName: string, configName: string, configData: any): IConfigItem {
    this.migrateToMultiConfig(uploaderName)

    const uploaderData = this.ctx.getConfig<IUploaderConfigList>(`uploader.${uploaderName}`)

    const newConfig: IConfigItem = {
      ...configData,
      _id: uuid(),
      _configName: configName,
      _createdAt: Date.now(),
      _updatedAt: Date.now(),
    }

    uploaderData.configList.push(newConfig)

    if (uploaderData.configList.length === 1) {
      uploaderData.defaultId = newConfig._id
    }

    this.ctx.saveConfig({
      [`uploader.${uploaderName}`]: uploaderData,
    })

    if (uploaderData.defaultId === newConfig._id) {
      this.syncConfigToPicBed(uploaderName, newConfig)
    }

    return newConfig
  }

  /**
   * Replaces a profile's settings while preserving identity and creation time, then synchronizes
   * active copies.
   *
   * @returns False if the profile ID does not exist.
   */
  updateUploaderConfig(uploaderName: string, configId: string, configData: any): boolean {
    this.migrateToMultiConfig(uploaderName)

    const uploaderData = this.ctx.getConfig<IUploaderConfigList>(`uploader.${uploaderName}`)
    const configIndex = uploaderData.configList.findIndex(item => item._id === configId)

    if (configIndex === -1) {
      return false
    }

    const existingConfig = uploaderData.configList[configIndex]
    uploaderData.configList[configIndex] = {
      ...configData,
      _id: existingConfig._id,
      _configName: configData._configName || existingConfig._configName,
      _createdAt: existingConfig._createdAt,
      _updatedAt: Date.now(),
    }

    this.ctx.saveConfig({
      [`uploader.${uploaderName}`]: uploaderData,
    })

    if (uploaderData.defaultId === configId) {
      this.syncConfigToPicBed(uploaderName, uploaderData.configList[configIndex])
    }
    this.syncSecondUploaderConfig(uploaderName, uploaderData.configList[configIndex])

    return true
  }

  /**
   * Deletes an eligible profile and clears secondary-uploader settings when they refer to it.
   *
   * @returns False for an unknown ID, the current uploader's only profile, or a default with other
   * profiles.
   */
  deleteUploaderConfig(uploaderName: string, configId: string): boolean {
    this.migrateToMultiConfig(uploaderName)

    const uploaderData = this.ctx.getConfig<IUploaderConfigList>(`uploader.${uploaderName}`)
    const currentUploader =
      this.ctx.getConfig<string>('picBed.uploader') || this.ctx.getConfig<string>('picBed.current') || 'smms'

    if (uploaderData.configList.length === 1 && uploaderName === currentUploader) {
      this.ctx.log.warn('Cannot delete the only config of the current uploader.')
      return false
    }

    const configIndex = uploaderData.configList.findIndex(item => item._id === configId)

    if (configIndex === -1) {
      return false
    }

    if (uploaderData.defaultId === configId && uploaderData.configList.length > 1) {
      this.ctx.log.warn('Cannot delete the default config. Please set another config as default first.')
      return false
    }

    uploaderData.configList.splice(configIndex, 1)

    if (uploaderData.defaultId === configId) {
      uploaderData.defaultId = uploaderData.configList.length > 0 ? uploaderData.configList[0]._id : ''
    }

    this.ctx.saveConfig({
      [`uploader.${uploaderName}`]: uploaderData,
    })

    if (uploaderData.configList.length === 0) {
      this.ctx.removeConfig('picBed', uploaderName)
    }
    if (this.isSecondUploaderConfig(uploaderName, configId)) {
      this.ctx.saveConfig({
        'picBed.secondUploader': '',
        'picBed.secondUploaderConfig': {},
        'settings.enableSecondUploader': false,
      })
    }
    this.ctx.log.info(`${uploaderName} is deleted everywhere.`)

    return true
  }

  /**
   * Selects an existing profile as the default and copies its settings to the legacy picBed entry.
   *
   * @returns False if the profile ID does not exist.
   */
  setDefaultConfig(uploaderName: string, configId: string): boolean {
    this.migrateToMultiConfig(uploaderName)

    const uploaderData = this.ctx.getConfig<IUploaderConfigList>(`uploader.${uploaderName}`)
    const config = uploaderData.configList.find(item => item._id === configId)

    if (!config) {
      return false
    }

    uploaderData.defaultId = configId

    this.ctx.saveConfig({
      [`uploader.${uploaderName}`]: uploaderData,
    })

    this.syncConfigToPicBed(uploaderName, config)

    return true
  }

  /** Copies a profile into the legacy picBed location consumed by uploader implementations. */
  private syncConfigToPicBed(uploaderName: string, config: IConfigItem): void {
    this.ctx.saveConfig({
      [`picBed.${uploaderName}`]: config,
    })
  }

  /** Checks both uploader type and profile identity against the configured secondary destination. */
  private isSecondUploaderConfig(uploaderName: string, configId: string): boolean {
    return (
      this.ctx.getConfig<string>('picBed.secondUploader') === uploaderName &&
      this.ctx.getConfig<IConfigItem>('picBed.secondUploaderConfig')?._id === configId
    )
  }

  /** Persists profile edits to the secondary destination when it references the same profile. */
  private syncSecondUploaderConfig(uploaderName: string, config: IConfigItem): void {
    if (this.isSecondUploaderConfig(uploaderName, config._id)) {
      this.ctx.saveConfig({ 'picBed.secondUploaderConfig': config })
    }
  }

  /** Migrates legacy settings if needed and returns the first matching profile name, or null. */
  getConfigByName(uploaderName: string, configName: string): IConfigItem | null {
    this.migrateToMultiConfig(uploaderName)

    const uploaderData = this.ctx.getConfig<IUploaderConfigList>(`uploader.${uploaderName}`) || {}
    return uploaderData?.configList?.find(item => item._configName === configName) || null
  }

  /**
   * Persists a profile name and modification time, synchronizing active and secondary copies.
   *
   * @returns False if the profile ID does not exist.
   */
  renameConfig(uploaderName: string, configId: string, newName: string): boolean {
    this.migrateToMultiConfig(uploaderName)

    const uploaderData = this.ctx.getConfig<IUploaderConfigList>(`uploader.${uploaderName}`)
    const config = uploaderData.configList.find(item => item._id === configId)

    if (!config) {
      return false
    }

    config._configName = newName
    config._updatedAt = Date.now()

    this.ctx.saveConfig({
      [`uploader.${uploaderName}`]: uploaderData,
    })

    if (uploaderData.defaultId === configId) {
      this.syncConfigToPicBed(uploaderName, config)
    }
    this.syncSecondUploaderConfig(uploaderName, config)

    return true
  }
}
