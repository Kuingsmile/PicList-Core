import type { IPicGo } from '../types'
import { invalidFields } from '../utils/configPrompts'

export { invalidFields, isEmptyValue } from '../utils/configPrompts'

export const currentUploader = (ctx: IPicGo): string =>
  ctx.getConfig<string>('picBed.uploader') || ctx.getConfig<string>('picBed.current') || 'smms'

export async function uploaderReady(ctx: IPicGo, uploader = currentUploader(ctx)): Promise<boolean> {
  try {
    const plugin = ctx.helper.uploader.get(uploader)
    if (!plugin) return false
    const config = ctx.getConfig<Record<string, unknown>>(`picBed.${uploader}`)
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false
    const questions = plugin.config?.(ctx) || []
    return (await invalidFields(questions, config)).length === 0
  } catch {
    // A plugin's schema/validator may throw an error containing credentials.
    return false
  }
}
