import path from 'node:path'
import util from 'node:util'

import chalk from 'chalk'
import dayjs from 'dayjs'
import fs from 'fs-extra'
import { createFileSync } from 'fs-extra/esm'

import { ILogArgvType, ILogArgvTypeWithError, ILogColor, ILogger, IPicGo, Undefinable } from '../types'
import { forceNumber, isDev } from '../utils/common'
import { ILogType } from '../utils/enum'

/** Writes timestamped console and file logs according to the client's current logging settings. */
export class Logger implements ILogger {
  private readonly level = {
    [ILogType.success]: 'green',
    [ILogType.info]: 'blue',
    [ILogType.warn]: 'yellow',
    [ILogType.error]: 'red',
  }

  private readonly ctx: IPicGo
  private logLevel!: string | string[]
  private logPath!: string
  constructor(ctx: IPicGo) {
    this.ctx = ctx
  }

  /** Filters by silence and level, prints immediately, then schedules file rotation and persistence. */
  private handleLog(type: ILogType, ...msg: ILogArgvTypeWithError[]): void {
    this.logLevel = this.ctx.getConfig('settings.logLevel')
    if (!this.ctx.getConfig<Undefinable<string>>('silent') && this.checkLogLevel(type, this.logLevel)) {
      const logHeader = chalk[this.level[type] as ILogColor](`[PicList ${type.toUpperCase()}]:`)
      console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${logHeader}`, ...msg)
      this.logPath =
        this.ctx.getConfig<Undefinable<string>>('settings.logPath') || path.join(this.ctx.baseDir, './piclist.log')
      setTimeout(() => {
        try {
          const result = this.checkLogFileIsLarge(this.logPath)
          if (result.isLarge) {
            const warningMsg = `Log file is too large (> ${result.logFileSizeLimit! / 1024 / 1024 || '10'} MB), recreate log file`
            console.log(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${chalk.yellow('[PicList WARN]:')}`, warningMsg)
            this.recreateLogFile(this.logPath)
            msg.unshift(warningMsg)
          }
          this.handleWriteLog(this.logPath, type, ...msg)
        } catch (e) {
          console.error(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} [PicList Error] on checking log file size`, e)
        }
      }, 0)
    }
  }

  /** Compares the log size with the configured limit in MiB, defaulting to 10 MiB. */
  private checkLogFileIsLarge(logPath: string): {
    isLarge: boolean
    logFileSize?: number
    logFileSizeLimit?: number
  } {
    if (fs.existsSync(logPath)) {
      const logFileSize = fs.statSync(logPath).size
      const logFileSizeLimit =
        forceNumber(this.ctx.getConfig<Undefinable<number>>('settings.logFileSizeLimit') || 10) * 1024 * 1024 // 10 MB default
      return {
        isLarge: logFileSize > logFileSizeLimit,
        logFileSize,
        logFileSizeLimit,
      }
    }
    return { isLarge: false }
  }

  /** Deletes and recreates an existing log file after it exceeds the configured size limit. */
  private recreateLogFile(logPath: string): void {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath)
      createFileSync(logPath)
    }
  }

  /** Appends a timestamped entry, serializing objects and including stacks for error messages. */
  private handleWriteLog(logPath: string, type: string, ...msg: ILogArgvTypeWithError[]): void {
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
      fs.appendFileSync(logPath, log)
    } catch (e) {
      console.error(`${dayjs().format('YYYY-MM-DD HH:mm:ss')} [PicList Error] on writing log file`, e)
    }
  }

  /**
   * Accepts all levels by default, or matches a configured level or list containing the requested
   * level.
   */
  private checkLogLevel(type: string, level: undefined | string | string[]): boolean {
    if (level === undefined || level === 'all') return true
    if (Array.isArray(level)) {
      return level.some((item: string) => item === type || item === 'all')
    }
    return type === level
  }

  success(...msg: ILogArgvType[]): void {
    this.handleLog(ILogType.success, ...msg)
  }

  info(...msg: ILogArgvType[]): void {
    this.handleLog(ILogType.info, ...msg)
  }

  error(...msg: ILogArgvTypeWithError[]): void {
    this.handleLog(ILogType.error, ...msg)
  }

  warn(...msg: ILogArgvType[]): void {
    this.handleLog(ILogType.warn, ...msg)
  }

  /** Emits an info-level log only when the process runs in development mode. */
  debug(...msg: ILogArgvType[]): void {
    if (isDev()) {
      this.handleLog(ILogType.info, ...msg)
    }
  }
}

export default Logger
