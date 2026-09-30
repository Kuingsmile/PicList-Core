import { v4 as uuid } from 'uuid'

import type { IConfig, IConfigItem, IPicGo, IStringKeyMap, IUploaderConfigList } from '../types'

/** Normalizes profile names before validation, persistence, or lookup. */
const normalizeConfigName = (configName: string): string => {
  if (typeof configName !== 'string' || !configName.trim()) {
    throw new Error('Uploader profile name must be a nonempty string')
  }
  return configName.trim()
}

/** Resolves a trimmed profile name without migrating settings or selecting an ambiguous match. */
export const findUploaderConfigByName = (configList: IConfigItem[], configName: string): IConfigItem | null => {
  const name = normalizeConfigName(configName)
  let selected: IConfigItem | null = null
  for (const item of configList) {
    if (typeof item._configName !== 'string' || item._configName.trim() !== name) continue
    if (selected) {
      throw new Error('Uploader profile name is ambiguous; rename profiles by ID to make names unique')
    }
    selected = item
  }
  return selected
}

/** Manages named uploader profiles and synchronizes active and secondary uploader settings. */
export class ConfigManager {
  private readonly ctx: IPicGo

  constructor(ctx: IPicGo) {
    this.ctx = ctx
  }

  /** Persists legacy uploader settings as a named profile if no multi-profile entry exists. */
  migrateToMultiConfig(uploaderName: string): void {
    this.getUploaderData(uploaderName, this.ctx.getConfig<IConfig>())
  }

  /** Migrates legacy settings if needed and returns the default profile, or null if none matches. */
  getCurrentUploaderConfig(uploaderName: string): IConfigItem | null {
    const uploaderData = this.getUploaderData(uploaderName, this.ctx.getConfig<IConfig>())
    if (!uploaderData.defaultId) {
      return null
    }

    const currentConfig = uploaderData.configList.find(item => item._id === uploaderData.defaultId)
    return currentConfig || null
  }

  /** Migrates legacy settings if needed and returns every saved profile for an uploader. */
  getAllUploaderConfigs(uploaderName: string): IConfigItem[] {
    return this.getUploaderData(uploaderName, this.ctx.getConfig<IConfig>()).configList
  }

  /**
   * Persists a profile with fresh identity and timestamps, making the first profile the default.
   *
   * @throws If the name is empty, invalid, or already used by this uploader.
   */
  addUploaderConfig(uploaderName: string, configName: string, configData: any): IConfigItem {
    const name = normalizeConfigName(configName)
    const config = this.ctx.getConfig<IConfig>()
    const uploaderData = this.getUploaderData(uploaderName, config)
    this.validateConfigName(name, uploaderData.configList)
    const now = Date.now()

    const newConfig: IConfigItem = {
      ...configData,
      _id: uuid(),
      _configName: name,
      _createdAt: now,
      _updatedAt: now,
    }

    const updatedData: IUploaderConfigList = {
      ...uploaderData,
      configList: [...uploaderData.configList, newConfig],
      defaultId: uploaderData.configList.length === 0 ? newConfig._id : uploaderData.defaultId,
    }
    this.saveUploaderData(uploaderName, updatedData, config, newConfig)

    return newConfig
  }

  /**
   * Replaces a profile's settings while preserving identity and creation time, then synchronizes
   * active copies.
   *
   * @returns False if the profile ID does not exist.
   * @throws If the resulting name is empty, invalid, or used by another profile of this uploader.
   */
  updateUploaderConfig(uploaderName: string, configId: string, configData: any): boolean {
    const config = this.ctx.getConfig<IConfig>()
    const uploaderData = this.getUploaderData(uploaderName, config)
    const configIndex = uploaderData.configList.findIndex(item => item._id === configId)

    if (configIndex === -1) {
      return false
    }

    const existingConfig = uploaderData.configList[configIndex]
    const updatedConfig: IConfigItem = {
      ...configData,
      _id: existingConfig._id,
      _configName: this.validateConfigName(
        Object.hasOwn(configData, '_configName') ? configData._configName : existingConfig._configName,
        uploaderData.configList,
        configId,
      ),
      _createdAt: existingConfig._createdAt,
      _updatedAt: Date.now(),
    }

    const configList = [...uploaderData.configList]
    configList[configIndex] = updatedConfig
    this.saveUploaderData(uploaderName, { ...uploaderData, configList }, config, updatedConfig)

    return true
  }

  /**
   * Deletes an eligible profile and clears secondary-uploader settings when they refer to it.
   *
   * @returns False for an unknown ID, the current uploader's only profile, or a default with other
   * profiles.
   */
  deleteUploaderConfig(uploaderName: string, configId: string): boolean {
    const config = this.ctx.getConfig<IConfig>()
    const uploaderData = this.getUploaderData(uploaderName, config)
    const configIndex = uploaderData.configList.findIndex(item => item._id === configId)

    if (configIndex === -1) {
      return false
    }

    const currentUploader = config.picBed?.uploader || config.picBed?.current || 'smms'

    if (uploaderData.configList.length === 1 && uploaderName === currentUploader) {
      this.ctx.log.warn('Cannot delete the only config of the current uploader.')
      return false
    }

    if (uploaderData.defaultId === configId && uploaderData.configList.length > 1) {
      this.ctx.log.warn('Cannot delete the default config. Please set another config as default first.')
      return false
    }

    const configList = uploaderData.configList.filter((_item, index) => index !== configIndex)
    const changes: IStringKeyMap<any> = {
      [`uploader.${uploaderName}`]: {
        ...uploaderData,
        configList,
        defaultId: uploaderData.defaultId === configId ? '' : uploaderData.defaultId,
      },
    }
    if (this.isSecondUploaderConfig(config, uploaderName, configId)) {
      changes['picBed.secondUploader'] = ''
      changes['picBed.secondUploaderConfig'] = {}
      changes['settings.enableSecondUploader'] = false
    }
    this.ctx.saveConfig(changes)

    if (configList.length === 0) {
      this.ctx.removeConfig('picBed', uploaderName)
    }
    this.ctx.log.info(`Deleted a config for ${uploaderName}.`)

    return true
  }

  /**
   * Selects an existing profile as the default and copies its settings to the legacy picBed entry.
   *
   * @returns False if the profile ID does not exist.
   */
  setDefaultConfig(uploaderName: string, configId: string): boolean {
    const config = this.ctx.getConfig<IConfig>()
    const uploaderData = this.getUploaderData(uploaderName, config)
    const selectedConfig = uploaderData.configList.find(item => item._id === configId)

    if (!selectedConfig) {
      return false
    }

    this.saveUploaderData(uploaderName, { ...uploaderData, defaultId: configId }, config, selectedConfig)

    return true
  }

  /**
   * Migrates legacy settings if needed and returns the uniquely matching trimmed profile name, or null.
   *
   * @throws If the name is empty, invalid, or ambiguous in existing settings.
   */
  getConfigByName(uploaderName: string, configName: string): IConfigItem | null {
    const name = normalizeConfigName(configName)
    const uploaderData = this.getUploaderData(uploaderName, this.ctx.getConfig<IConfig>())
    return findUploaderConfigByName(uploaderData.configList, name)
  }

  /**
   * Persists a profile name and modification time, synchronizing active and secondary copies.
   *
   * @returns False if the profile ID does not exist.
   * @throws If the name is empty, invalid, or used by another profile of this uploader.
   */
  renameConfig(uploaderName: string, configId: string, newName: string): boolean {
    const config = this.ctx.getConfig<IConfig>()
    const uploaderData = this.getUploaderData(uploaderName, config)
    const configIndex = uploaderData.configList.findIndex(item => item._id === configId)

    if (configIndex === -1) {
      return false
    }

    const updatedConfig: IConfigItem = {
      ...uploaderData.configList[configIndex],
      _configName: this.validateConfigName(newName, uploaderData.configList, configId),
      _updatedAt: Date.now(),
    }
    const configList = [...uploaderData.configList]
    configList[configIndex] = updatedConfig
    this.saveUploaderData(uploaderName, { ...uploaderData, configList }, config, updatedConfig)

    return true
  }

  /** Enforces nonempty names and uniqueness within an uploader, excluding the profile being edited. */
  private validateConfigName(configName: string, configList: IConfigItem[], configId?: string): string {
    const name = normalizeConfigName(configName)
    if (
      configList.some(
        item => item._id !== configId && typeof item._configName === 'string' && item._configName.trim() === name,
      )
    ) {
      throw new Error('Uploader profile name already exists')
    }
    return name
  }

  /** Resolves or migrates one uploader from a single fresh snapshot without rewriting other uploaders. */
  private getUploaderData(uploaderName: string, config: IConfig): IUploaderConfigList {
    const uploaderData = config.uploader?.[uploaderName]
    if (uploaderData !== undefined && uploaderData !== null) {
      if (
        !Array.isArray(uploaderData.configList) ||
        typeof uploaderData.defaultId !== 'string' ||
        uploaderData.configList.some(item => !item || typeof item._id !== 'string')
      ) {
        throw new Error('Invalid uploader profile configuration')
      }
      return uploaderData
    }

    const legacy = config.picBed?.[uploaderName]
    if (legacy !== undefined && legacy !== null && (typeof legacy !== 'object' || Array.isArray(legacy))) {
      throw new Error('Invalid legacy uploader configuration')
    }

    const migrated: IUploaderConfigList = { configList: [], defaultId: '' }
    const changes: IStringKeyMap<any> = { [`uploader.${uploaderName}`]: migrated }
    if (legacy && Object.keys(legacy).length > 0) {
      const now = Date.now()
      const profile: IConfigItem = {
        ...legacy,
        _id: legacy._id || uuid(),
        _configName: normalizeConfigName(legacy._configName || 'Default'),
        _createdAt: legacy._createdAt ?? now,
        _updatedAt: legacy._updatedAt ?? now,
      }
      migrated.configList = [profile]
      migrated.defaultId = profile._id
      changes[`picBed.${uploaderName}`] = profile
    }
    this.ctx.saveConfig(changes)
    return migrated
  }

  /** Saves the profile list and matching active copies in one persistence batch. */
  private saveUploaderData(
    uploaderName: string,
    uploaderData: IUploaderConfigList,
    config: IConfig,
    profile: IConfigItem,
  ): void {
    const changes: IStringKeyMap<any> = { [`uploader.${uploaderName}`]: uploaderData }
    if (uploaderData.defaultId === profile._id) {
      changes[`picBed.${uploaderName}`] = profile
    }
    if (this.isSecondUploaderConfig(config, uploaderName, profile._id)) {
      changes['picBed.secondUploaderConfig'] = profile
    }
    this.ctx.saveConfig(changes)
  }

  /** Checks uploader type and profile identity using the operation's configuration snapshot. */
  private isSecondUploaderConfig(config: IConfig, uploaderName: string, configId: string): boolean {
    return config.picBed?.secondUploader === uploaderName && config.picBed?.secondUploaderConfig?._id === configId
  }
}
