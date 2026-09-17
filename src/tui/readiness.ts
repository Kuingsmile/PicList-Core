import type { IPicGo } from '../types'
import type { IInquirerQuestion } from '../utils/inquirerShim'

export const currentUploader = (ctx: IPicGo): string =>
  ctx.getConfig<string>('picBed.uploader') || ctx.getConfig<string>('picBed.current') || 'smms'

export const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && !value.trim()) ||
  (Array.isArray(value) && value.length === 0)

/** Evaluate the existing form contract without saving defaults or exposing validation payloads. */
export async function invalidFields(
  questions: IInquirerQuestion[],
  config: Record<string, unknown>,
): Promise<string[]> {
  const invalid: string[] = []
  for (const question of questions) {
    const visible = typeof question.when === 'function' ? await question.when(config) : question.when
    if (visible === false) continue
    const value = config[question.name]
    if (question.required && isEmptyValue(value)) {
      invalid.push(question.name)
      continue
    }
    if (!isEmptyValue(value) && question.validate) {
      const result = await question.validate(value)
      if (result === false || typeof result === 'string') invalid.push(question.name)
    }
  }
  return invalid
}

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
