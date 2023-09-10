import chalk from 'chalk'
import dayjs from 'dayjs'
import fs from 'fs-extra'
import path from 'path'
import util from 'util'
import { ILogType } from '../utils/enum'
import {
  type ILogArgvType,
  type ILogArgvTypeWithError,
  type Undefinable,
  type ILogColor,
  type ILogger,
  type IPicGo
} from '../types'
import { forceNumber, isDev } from '../utils/common'

export class Logger implements ILogger {
  private readonly level = {
    [ILogType.success]: 'green',
    [ILogType.info]: 'blue',
    [ILogType.warn]: 'yellow',
    [ILogType.error]: 'red'
  }

  private readonly ctx: IPicGo
  private logLevel!: string | string[]
  private logPath!: string
  constructor (ctx: IPicGo) {
    this.ctx = ctx
  }

  private handleLog (type: ILogType, ...msg: ILogArgvTypeWithError[]): void {
    // check config.silent
    this.logLevel = this.ctx.getConfig('settings.logLevel')
    if (!this.ctx.getConfig<Undefinable<string>>('silent') && this.checkLogLevel(type, this.logLevel)) {
      const logHeader = chalk[this.level[type] as ILogColor](`[PicList ${type.toUpperCase()}]:`)
      console.log(logHeader, ...msg)
      this.logPath = this.ctx.getConfig<Undefinable<string>>('settings.logPath') || path.join(this.ctx.baseDir, './piclist.log')
      setTimeout(() => {
        // fix log file is too large, now the log file's default size is 10 MB
        try {
          const result = this.checkLogFileIsLarge(this.logPath)
          if (result.isLarge) {
            const warningMsg = `Log file is too large (> ${(result.logFileSizeLimit!) / 1024 / 1024 || '10'} MB), recreate log file`
            console.log(chalk.yellow('[PicList WARN]:'), warningMsg)
            this.recreateLogFile(this.logPath)
            msg.unshift(warningMsg)
          }
          this.handleWriteLog(this.logPath, type, ...msg)
        } catch (e) {
          // why???
          console.error('[PicList Error] on checking log file size', e)
        }
      }, 0)
    }
  }

  private checkLogFileIsLarge (logPath: string): {
    isLarge: boolean
    logFileSize?: number
    logFileSizeLimit?: number
  } {
    if (fs.existsSync(logPath)) {
      const logFileSize = fs.statSync(logPath).size
      const logFileSizeLimit = forceNumber(this.ctx.getConfig<Undefinable<number>>('settings.logFileSizeLimit') || 10) * 1024 * 1024 // 10 MB default
      return {
        isLarge: logFileSize > logFileSizeLimit,
        logFileSize,
        logFileSizeLimit
      }
    }
    return {
      isLarge: false
    }
  }

  private recreateLogFile (logPath: string): void {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath)
      fs.createFileSync(logPath)
    }
  }

  private handleWriteLog (logPath: string, type: string, ...msg: ILogArgvTypeWithError[]): void {
    try {
      let log = `${dayjs().format('YYYY-MM-DD HH:mm:ss')} [PicList ${type.toUpperCase()}] `
      msg.forEach((item: ILogArgvTypeWithError) => {
        if (item instanceof Error && type === 'error') {
          log += `\n------Error Stack Begin------\n${util.format(item?.stack)}\n-------Error Stack End------- `
        } else {
          if (typeof item === 'object') {
            item = JSON.stringify(item, null, 2)
          }
          log += `${item as string} `
        }
      })
      log += '\n'
      // A synchronized approach to avoid log msg sequence errors
      fs.appendFileSync(logPath, log)
    } catch (e) {
      console.error('[PicList Error] on writing log file', e)
    }
  }

  private checkLogLevel (type: string, level: undefined | string | string[]): boolean {
    if (level === undefined || level === 'all') {
      return true
    }
    if (Array.isArray(level)) {
      return level.some((item: string) => (item === type || item === 'all'))
    } else {
      return type === level
    }
  }

  success (...msg: ILogArgvType[]): void {
    this.handleLog(ILogType.success, ...msg)
  }

  info (...msg: ILogArgvType[]): void {
    this.handleLog(ILogType.info, ...msg)
  }

  error (...msg: ILogArgvTypeWithError[]): void {
    this.handleLog(ILogType.error, ...msg)
  }

  warn (...msg: ILogArgvType[]): void {
    this.handleLog(ILogType.warn, ...msg)
  }

  debug (...msg: ILogArgvType[]): void {
    if (isDev()) {
      this.handleLog(ILogType.info, ...msg)
    }
  }
}

export default Logger
