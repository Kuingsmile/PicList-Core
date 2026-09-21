import path from 'node:path'
import util from 'node:util'

import chalk from 'chalk'
import dayjs from 'dayjs'
import fs from 'fs-extra'

import { ILogArgvType, ILogArgvTypeWithError, ILogger, IPicGo, Undefinable } from '../types'
import { forceNumber, isDev } from '../utils/common'
import { ILogType } from '../utils/enum'

const TIMESTAMP_FORMAT = 'YYYY-MM-DD HH:mm:ss'
const DEFAULT_LOG_SIZE_MB = 10
const BYTES_PER_MB = 1024 * 1024

/** Writes timestamped console and file logs according to the client's current logging settings. */
export class Logger implements ILogger {
  private readonly ctx: IPicGo
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(ctx: IPicGo) {
    this.ctx = ctx
  }

  success(...args: ILogArgvType[]): void {
    this.log(ILogType.success, ...args)
  }

  info(...args: ILogArgvType[]): void {
    this.log(ILogType.info, ...args)
  }

  error(...args: ILogArgvTypeWithError[]): void {
    this.log(ILogType.error, ...args)
  }

  warn(...args: ILogArgvType[]): void {
    this.log(ILogType.warn, ...args)
  }

  /** Emits an info-level log only when the process runs in development mode. */
  debug(...args: ILogArgvType[]): void {
    if (isDev()) {
      this.log(ILogType.info, ...args)
    }
  }

  flush(): Promise<void> {
    return this.writeQueue
  }

  private log(type: ILogType, ...args: ILogArgvTypeWithError[]): void {
    if (!this.shouldLog(type)) return

    const timestamp = this.getTimestamp()

    this.writeToConsole(timestamp, type, args)

    const logPath = this.getLogPath()

    this.enqueueFileWrite(async () => {
      await this.writeToFile(logPath, timestamp, type, args)
    })
  }

  private shouldLog(type: ILogType): boolean {
    const silent = this.ctx.getConfig<Undefinable<boolean>>('silent') ?? false

    if (silent) return false

    const level = this.ctx.getConfig<Undefinable<string | string[]>>('settings.logLevel')

    if (level === undefined || level === 'all') {
      return true
    }

    if (Array.isArray(level)) {
      return level.includes('all') || level.includes(type)
    }

    return level === type
  }

  private getTimestamp(): string {
    return dayjs().format(TIMESTAMP_FORMAT)
  }

  private getColoredPrefix(type: ILogType): string {
    const label = `[PicList ${type.toUpperCase()}]:`

    switch (type) {
      case ILogType.success:
        return chalk.green(label)
      case ILogType.info:
        return chalk.blue(label)
      case ILogType.warn:
        return chalk.yellow(label)
      case ILogType.error:
        return chalk.red(label)
      default:
        return label
    }
  }

  /**
   * Immediately outputs the message to the appropriate console stream.
   */
  private writeToConsole(timestamp: string, type: ILogType, args: ILogArgvTypeWithError[]): void {
    const prefix = this.getColoredPrefix(type)

    switch (type) {
      case ILogType.error:
        console.error(timestamp, prefix, ...args)
        break

      case ILogType.warn:
        console.warn(timestamp, prefix, ...args)
        break

      default:
        console.log(timestamp, prefix, ...args)
    }
  }

  private getLogPath(): string {
    return this.ctx.getConfig<Undefinable<string>>('settings.logPath') || path.join(this.ctx.baseDir, 'piclist.log')
  }

  private enqueueFileWrite(task: () => Promise<void>): void {
    this.writeQueue = this.writeQueue.then(task).catch((error: unknown) => {
      this.reportInternalError('writing log file', error)
    })
  }

  private async writeToFile(
    logPath: string,
    timestamp: string,
    type: ILogType,
    args: ILogArgvTypeWithError[],
  ): Promise<void> {
    await fs.ensureDir(path.dirname(logPath))

    const entry = this.createLogEntry(timestamp, type, args)
    const rotationMessage = await this.rotateIfNeeded(logPath, Buffer.byteLength(entry, 'utf8'))

    const finalEntry = rotationMessage ? this.createLogEntry(timestamp, type, [rotationMessage, ...args]) : entry

    await fs.appendFile(logPath, finalEntry, 'utf8')
  }

  private createLogEntry(timestamp: string, type: ILogType, args: ILogArgvTypeWithError[]): string {
    const message = args.map(arg => this.formatArgument(arg)).join(' ')

    return `${timestamp} [PicList ${type.toUpperCase()}] ${message}\n`
  }

  private formatArgument(arg: ILogArgvTypeWithError): string {
    if (arg instanceof Error) {
      return ['', '------ Error Stack Begin ------', arg.stack ?? arg.message, '------- Error Stack End -------'].join(
        '\n',
      )
    }

    if (typeof arg === 'object' && arg !== null) {
      return util.inspect(arg, {
        colors: false,
        depth: 8,
        compact: false,
        breakLength: 120,
      })
    }

    return String(arg)
  }

  private async rotateIfNeeded(logPath: string, incomingBytes: number): Promise<string | undefined> {
    let stats: Awaited<ReturnType<typeof fs.promises.stat>>

    try {
      stats = await fs.promises.stat(logPath)
    } catch (error) {
      if (this.isFileNotFoundError(error)) return undefined

      throw error
    }

    const limit = this.getLogFileSizeLimit()

    if (stats.size + incomingBytes <= limit) return undefined

    const rotatedPath = `${logPath}.1`

    // Keep one previous log instead of permanently deleting it.
    await fs.remove(rotatedPath)
    await fs.move(logPath, rotatedPath, {
      overwrite: true,
    })

    const limitMB = limit / BYTES_PER_MB

    const message = `Log file reached ${limitMB} MB; ` + `rotated previous log to ${path.basename(rotatedPath)}`

    console.warn(this.getTimestamp(), chalk.yellow('[PicList WARN]:'), message)

    return message
  }

  private reportInternalError(operation: string, error: unknown): void {
    console.error(this.getTimestamp(), '[PicList ERROR]:', `Logger failed while ${operation}`, error)
  }

  private isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
  }

  private getLogFileSizeLimit(): number {
    const configured = this.ctx.getConfig<Undefinable<number>>('settings.logFileSizeLimit')

    const sizeMB = forceNumber(configured ?? DEFAULT_LOG_SIZE_MB)

    const normalizedSize = Number.isFinite(sizeMB) && sizeMB > 0 ? sizeMB : DEFAULT_LOG_SIZE_MB

    return normalizedSize * BYTES_PER_MB
  }
}

export default Logger
