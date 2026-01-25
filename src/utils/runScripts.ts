import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

import axios from 'axios'
import fs from 'fs-extra'

import { IPicGo } from '../types'

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

export async function runScript(ctx: IPicGo, script: string): Promise<any> {
  try {
    const b64d = (str: string): string => Buffer.from(str, 'base64').toString('utf-8')
    const b64e = (data: Buffer | string): string =>
      (Buffer.isBuffer(data) ? data : Buffer.from(String(data))).toString('base64')
    const exposedAPI = {
      ctx,
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
      b64d,
      b64e,
      os,
      Buffer,
    }
    vm.createContext(exposedAPI)
    ctx.log.info('start to run script')
    vm.runInContext(script, exposedAPI)
    const promise = vm.runInContext(
      `(async () => {
        const result = main(ctx)
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
    return null
  }
}
