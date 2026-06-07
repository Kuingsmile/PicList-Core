import path from 'node:path'

import fs from 'fs-extra'
import { readJSONSync } from 'fs-extra/esm'

import type { ILogger, IPluginNameType } from '../../types'

export const getPluginNameType = (name: string): IPluginNameType => {
  if (/^@[^/]+\/picgo-plugin-/.test(name)) {
    return 'scope'
  } else if (name.startsWith('picgo-plugin-')) {
    return 'normal'
  } else if (isSimpleName(name)) {
    return 'simple'
  }
  return 'unknown'
}

export const isSimpleName = (nameOrPath: string): boolean => {
  if (path.isAbsolute(nameOrPath)) {
    return false
  }
  const pluginPath = path.join(process.cwd(), nameOrPath)
  if (fs.existsSync(pluginPath)) {
    return false
  }
  if (nameOrPath.includes('/') || nameOrPath.includes('\\')) {
    return false
  }
  return true
}

export const handleStreamlinePluginName = (name: string): string => {
  if (/^@[^/]+\/picgo-plugin-/.test(name)) {
    return name.replace(/^@[^/]+\/picgo-plugin-/, '')
  } else {
    return name.replace(/picgo-plugin-/, '')
  }
}

export const handleCompletePluginName = (name: string, scope = ''): string =>
  scope ? `@${scope}/picgo-plugin-${name}` : `picgo-plugin-${name}`

export const getProcessPluginName = (nameOrPath: string, logger: ILogger | Console = console): string => {
  const pluginNameType = getPluginNameType(nameOrPath)
  switch (pluginNameType) {
    case 'normal':
    case 'scope':
      return nameOrPath
    case 'simple':
      return handleCompletePluginName(nameOrPath)
    default: {
      let pluginPath = nameOrPath
      if (path.isAbsolute(nameOrPath) && fs.existsSync(nameOrPath)) {
        return handleUnixStylePath(pluginPath)
      }
      pluginPath = path.join(process.cwd(), nameOrPath)
      if (fs.existsSync(pluginPath)) {
        return handleUnixStylePath(pluginPath)
      }
      logger.warn(`Can't find plugin ${nameOrPath}`)
      return ''
    }
  }
}

export const getNormalPluginName = (nameOrPath: string, logger: ILogger | Console = console): string => {
  const pluginNameType = getPluginNameType(nameOrPath)
  switch (pluginNameType) {
    case 'normal':
      return removePluginVersion(nameOrPath)
    case 'scope':
      return removePluginVersion(nameOrPath, true)
    case 'simple':
      return removePluginVersion(handleCompletePluginName(nameOrPath))
    default: {
      if (!fs.existsSync(nameOrPath)) {
        logger.warn(`Can't find plugin: ${nameOrPath}`)
        return ''
      }
      const packageJSONPath = path.posix.join(nameOrPath, 'package.json')
      if (!fs.existsSync(packageJSONPath)) {
        logger.warn(`Can't find plugin: ${nameOrPath}`)
        return ''
      } else {
        const pkg = readJSONSync(packageJSONPath) || {}
        if (!pkg.name?.includes('picgo-plugin-')) {
          logger.warn(
            `The plugin package.json's name filed is ${(pkg.name as string) || 'empty'}, need to include the prefix: picgo-plugin-`,
          )
          return ''
        }
        return pkg.name
      }
    }
  }
}

export const handleUnixStylePath = (pathStr: string): string => {
  const pathArr = pathStr.split(path.sep)
  return pathArr.join('/')
}

export const removePluginVersion = (nameOrPath: string, scope: boolean = false): string => {
  if (!nameOrPath.includes('@')) {
    return nameOrPath
  }
  let reg = /(.+\/)?(picgo-plugin-[\w-]+)(@.+)*/
  if (scope) {
    reg = /(.+\/)?(^@[^/]+\/picgo-plugin-\w+)(@.+)*/
  }
  const matchArr = nameOrPath.match(reg)
  if (!matchArr) {
    console.warn('can not remove plugin version')
    return nameOrPath
  } else {
    return matchArr[2]
  }
}
