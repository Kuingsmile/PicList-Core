import { spawn } from 'cross-spawn'

import {
  IPicGo,
  IPluginHandler,
  IPluginHandlerOptions,
  IPluginHandlerResult,
  IPluginProcessResult,
  IProcessEnv,
  IResult,
  Undefinable,
} from '../types'
import { getNormalPluginName, getProcessPluginName } from '../utils/common'
import { IBuildInEvent } from '../utils/enum'

/** Installs, removes, and updates user plugin packages through npm and reports operation events. */
export class PluginHandler implements IPluginHandler {
  // Thanks to feflow -> https://github.com/feflow/feflow/blob/master/lib/internal/install/plugin.js
  private readonly ctx: IPicGo
  constructor(ctx: IPicGo) {
    this.ctx = ctx
  }

  async getList(): Promise<string[]> {
    return this.ctx.pluginLoader.getList()
  }

  /**
   * Installs valid plugin names or paths, registers successful packages, and emits installation
   * results.
   */
  async install(
    plugins: string[],
    options: IPluginHandlerOptions = {},
    env?: IProcessEnv,
  ): Promise<IPluginHandlerResult<boolean>> {
    const installedPlugins: string[] = []
    const processPlugins = plugins
      .map((item: string) => handlePluginNameProcess(this.ctx, item))
      .filter(item => {
        // detect if has already installed
        // or will cause error
        if (this.ctx.pluginLoader.hasPlugin(item.pkgName)) {
          installedPlugins.push(item.pkgName)
          this.ctx.log.success(`PicList has already installed ${item.pkgName}`)
          return false
        }
        // if something wrong, filter it out
        if (!item.success) {
          return false
        }
        return true
      })
    const fullNameList = processPlugins.map(item => item.fullName)
    const pkgNameList = processPlugins.map(item => item.pkgName)
    if (fullNameList.length > 0) {
      // install plugins must use fullNameList:
      // 1. install remote pacage
      // 2. install local pacage
      const result = await this.execCommand('install', fullNameList, this.ctx.baseDir, options, env)
      if (!result.code) {
        // Load installed packages by name, without version suffixes or local source paths.
        for (const item of pkgNameList) {
          await this.ctx.pluginLoader.registerPlugin(item)
        }
        this.ctx.log.success(this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_INSTALL_SUCCESS'))
        this.ctx.emit('installSuccess', {
          title: this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_INSTALL_SUCCESS'),
          body: [...pkgNameList, ...installedPlugins],
        })
        const res: IPluginHandlerResult<true> = {
          success: true,
          body: [...pkgNameList, ...installedPlugins],
        }
        return res
      } else {
        const err = this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_INSTALL_FAILED_REASON', {
          code: `${result.code}`,
          data: result.data,
        })
        this.ctx.log.error(err)
        this.ctx.emit('installFailed', {
          title: this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_INSTALL_FAILED'),
          body: err,
        })
        const res: IPluginHandlerResult<false> = {
          success: false,
          body: err,
        }
        return res
      }
    } else if (installedPlugins.length === 0) {
      const err = this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UNINSTALL_FAILED_VALID')
      this.ctx.log.error(err)
      this.ctx.emit('installFailed', {
        title: this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_INSTALL_FAILED'),
        body: err,
      })
      const res: IPluginHandlerResult<false> = {
        success: false,
        body: err,
      }
      return res
    } else {
      this.ctx.log.success(this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_INSTALL_SUCCESS'))
      this.ctx.emit('installSuccess', {
        title: this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_INSTALL_SUCCESS'),
        body: [...pkgNameList, ...installedPlugins],
      })
      const res: IPluginHandlerResult<true> = {
        success: true,
        body: [...pkgNameList, ...installedPlugins],
      }
      return res
    }
  }

  /**
   * Uninstalls resolved plugin packages, unregisters their handlers on success, and emits result
   * events.
   */
  async uninstall(plugins: string[], options: IPluginHandlerOptions = {}): Promise<IPluginHandlerResult<boolean>> {
    const processPlugins = plugins
      .map((item: string) => handlePluginNameProcess(this.ctx, item))
      .filter(item => item.success)
    const pkgNameList = processPlugins.map(item => item.pkgName)
    if (pkgNameList.length > 0) {
      // uninstall plugins must use pkgNameList:
      // npm uninstall will use the package.json's name
      const result = await this.execCommand('uninstall', pkgNameList, this.ctx.baseDir, options)
      if (!result.code) {
        pkgNameList.forEach((pluginName: string) => {
          this.ctx.pluginLoader.unregisterPlugin(pluginName)
        })
        this.ctx.log.success(this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UNINSTALL_SUCCESS'))
        this.ctx.emit('uninstallSuccess', {
          title: this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UNINSTALL_SUCCESS'),
          body: pkgNameList,
        })
        const res: IPluginHandlerResult<true> = {
          success: true,
          body: pkgNameList,
        }
        return res
      } else {
        const err = this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UNINSTALL_FAILED_REASON', {
          code: `${result.code}`,
          data: result.data,
        })
        this.ctx.log.error(err)
        this.ctx.emit('uninstallFailed', {
          title: this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UNINSTALL_FAILED'),
          body: err,
        })
        const res: IPluginHandlerResult<false> = {
          success: false,
          body: err,
        }
        return res
      }
    } else {
      const err = this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UNINSTALL_FAILED_VALID')
      this.ctx.log.error(err)
      this.ctx.emit('uninstallFailed', {
        title: this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UNINSTALL_FAILED'),
        body: err,
      })
      const res: IPluginHandlerResult<false> = {
        success: false,
        body: err,
      }
      return res
    }
  }

  /** Updates resolved plugin packages through npm and emits success or failure events. */
  async update(
    plugins: string[],
    options: IPluginHandlerOptions = {},
    env?: IProcessEnv,
  ): Promise<IPluginHandlerResult<boolean>> {
    const processPlugins = plugins
      .map((item: string) => handlePluginNameProcess(this.ctx, item))
      .filter(item => item.success)
    const pkgNameList = processPlugins.map(item => item.pkgName)
    if (pkgNameList.length > 0) {
      // update plugins must use pkgNameList:
      // npm update will use the package.json's name
      const result = await this.execCommand('update', pkgNameList, this.ctx.baseDir, options, env)
      if (!result.code) {
        this.ctx.log.success(this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UPDATE_SUCCESS'))
        this.ctx.emit('updateSuccess', {
          title: this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UPDATE_SUCCESS'),
          body: pkgNameList,
        })
        const res: IPluginHandlerResult<true> = {
          success: true,
          body: pkgNameList,
        }
        return res
      } else {
        const err = this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UPDATE_FAILED_REASON', {
          code: `${result.code}`,
          data: result.data,
        })
        this.ctx.log.error(err)
        this.ctx.emit('updateFailed', {
          title: this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UPDATE_FAILED'),
          body: err,
        })
        const res: IPluginHandlerResult<false> = {
          success: false,
          body: err,
        }
        return res
      }
    } else {
      const err = this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UPDATE_FAILED_VALID')
      this.ctx.log.error(err)
      this.ctx.emit('updateFailed', {
        title: this.ctx.i18n.t('PLUGIN_HANDLER_PLUGIN_UPDATE_FAILED'),
        body: err,
      })
      const res: IPluginHandlerResult<false> = {
        success: false,
        body: err,
      }
      return res
    }
  }

  /**
   * Runs npm in the user plugin directory with effective registry, proxy, and environment settings.
   *
   * @returns Combined stdout/stderr and exit code; startup failures return code 1.
   */
  private async execCommand(
    cmd: string,
    modules: string[],
    where: string,
    options: IPluginHandlerOptions = {},
    env: IProcessEnv = {},
  ): Promise<IResult> {
    // options first
    const registry = options.registry || this.ctx.getConfig<Undefinable<string>>('settings.registry')
    const proxy = options.proxy || this.ctx.getConfig<Undefinable<string>>('settings.proxy')
    return await new Promise((resolve: any): void => {
      let args = [cmd].concat(modules).concat('--color=always').concat('--save')
      if (registry) {
        args = args.concat(`--registry=${registry}`)
      }
      if (proxy) {
        args = args.concat(`--proxy=${proxy}`)
      }
      try {
        const npm = spawn('npm', args, {
          cwd: where,
          env: { ...process.env, ...env },
        })

        let output = ''
        npm.stdout?.on('data', (data: string) => {
          output += data
        })
        npm.stderr?.on('data', (data: string) => {
          output += data
        })
        if (!options.silent) {
          npm.stdout?.pipe(process.stdout)
          npm.stderr?.pipe(process.stderr)
        }

        npm.on('close', (code: number) => {
          if (!code) {
            resolve({ code: 0, data: output })
          } else {
            resolve({ code, data: output })
          }
        })
        // for users who haven't installed node.js
        npm.on('error', (err: Error) => {
          this.ctx.log.error(err)
          this.ctx.log.error('NPM is not installed')
          this.ctx.emit(IBuildInEvent.FAILED, 'NPM is not installed')
          resolve({ code: 1, data: 'Unable to start npm' })
        })
      } catch (e) {
        this.ctx.log.error(e as Error)
        this.ctx.emit(IBuildInEvent.FAILED, e)
        resolve({ code: 1, data: 'Unable to start npm' })
      }
    })
  }
}

/**
 * Resolves plugin shorthand, package specifiers, or local paths for npm operations.
 *
 * @param ctx - Client providing the logger for invalid plugin inputs.
 * @param nameOrPath - Plugin shorthand, full package name, or local plugin directory.
 * @returns Installation target and package identity, or a result with success set to false.
 */
const handlePluginNameProcess = (ctx: IPicGo, nameOrPath: string): IPluginProcessResult => {
  const res = {
    success: false,
    fullName: '',
    pkgName: '',
  }
  const result = getProcessPluginName(nameOrPath, ctx.log)
  if (!result) {
    return res
  }
  // first get result then do this process
  // or some error will log twice
  const pkgName = getNormalPluginName(result, ctx.log)
  if (!pkgName) {
    return res
  }
  return {
    success: true,
    fullName: result,
    pkgName,
  }
}

export default PluginHandler
