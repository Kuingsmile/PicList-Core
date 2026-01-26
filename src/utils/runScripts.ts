import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

import axios from 'axios'
import fs from 'fs-extra'

import { IPicGo } from '../types'

interface ScriptObject {
  path: string
  compiledScript: vm.Script
}

function format(data: unknown): string {
  if (data instanceof Error) {
    return `${data.name}: ${data.message}\n${data.stack}`
  }
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

export class ScriptHandler {
  private scriptCache = new Map<string, ScriptObject[]>()
  private readonly stages = ['preProcess', 'beforeTransform', 'transform', 'beforeUpload', 'upload', 'afterUpload']

  constructor(private ctx: any) {}

  async refreshCache() {
    this.scriptCache.clear()
    const baseDir = path.join(this.ctx.baseDir, 'scripts')
    const allConfig = this.ctx.getConfig() || {}
    const disabledList: string[] = allConfig.scripts?.disabledList || []

    await Promise.all(
      this.stages.map(async stage => {
        const configKey = stage
        const scriptDir = path.join(baseDir, stage)
        try {
          const files = await fs.readdir(scriptDir)
          const stageScripts: ScriptObject[] = []

          for (const file of files) {
            if (file.endsWith('.js') && !disabledList.includes(`${configKey}/${file}`)) {
              const filePath = path.join(scriptDir, file)
              const content = await fs.readFile(filePath, 'utf-8')
              const compiledScript = new vm.Script(content, { filename: filePath })
              stageScripts.push({ path: filePath, compiledScript })
            }
          }
          this.scriptCache.set(stage, stageScripts)
        } catch (_e) {
          this.scriptCache.set(stage, [])
        }
      }),
    )
  }

  async runStage(stage: string, extra: Record<string, any> = {}) {
    const scripts = this.scriptCache.get(stage) || []
    if (scripts.length === 0) return

    for (const scriptObj of scripts) {
      try {
        const exposedAPI = this.createSandbox(extra)
        const context = vm.createContext(exposedAPI)
        scriptObj.compiledScript.runInContext(context)
        if (typeof context.main === 'function') {
          const result = context.main(this.ctx, extra)
          await (result instanceof Promise ? result : Promise.resolve(result))
          this.ctx.log.info(`[Script] ${scriptObj.path} executed successfully`)
        }
      } catch (e) {
        this.ctx.log.error(`[Script] ${scriptObj.path} failed: ${e}`)
      }
    }
  }

  private createSandbox(extra: Record<string, any>) {
    return {
      ctx: this.ctx,
      extra,
      console: Object.freeze({
        log: (...args: any[]) => this.ctx.log.info(args.map(format).join(' ')),
        info: (...args: any[]) => this.ctx.log.info(args.map(format).join(' ')),
        error: (...args: any[]) => this.ctx.log.error(args.map(format).join(' ')),
        debug: (...args: any[]) => this.ctx.log.debug(args.map(format).join(' ')),
      }),
      axios,
      crypto,
      fs,
      path,
      os,
      Buffer,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      base64Decode: (str: string) => Buffer.from(str, 'base64').toString('utf-8'),
      base64Encode: (data: any) => (Buffer.isBuffer(data) ? data : Buffer.from(String(data))).toString('base64'),
    }
  }
}

export async function runScript(ctx: IPicGo, script: string, extra: Record<string, any>): Promise<any> {
  try {
    const base64Decode = (str: string): string => Buffer.from(str, 'base64').toString('utf-8')
    const base64Encode = (data: Buffer | string): string =>
      (Buffer.isBuffer(data) ? data : Buffer.from(String(data))).toString('base64')
    const exposedAPI = {
      ctx,
      extra,
      console: Object.freeze({
        log: (...args: unknown[]) => ctx.log.info(args.map(format).join(' ')),
        info: (...args: unknown[]) => ctx.log.info(args.map(format).join(' ')),
        error: (...args: unknown[]) => ctx.log.error(args.map(format).join(' ')),
        debug: (...args: unknown[]) => ctx.log.debug(args.map(format).join(' ')),
      }),
      axios,
      crypto,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      fs,
      path,
      base64Decode,
      base64Encode,
      os,
      Buffer,
    }
    vm.createContext(exposedAPI)
    ctx.log.info('start to run script')
    vm.runInContext(script, exposedAPI)
    const promise = vm.runInContext(
      `(async () => {
        const result = main(ctx, extra)
        if (result instanceof Promise) return await result
        return result
      })()`,
      exposedAPI,
    )
    const result = await promise
    ctx.log.info('script executed successfully')
    return result
  } catch (e) {
    ctx.log.error(`script execution failed: ${e}`)
    throw e
  }
}
