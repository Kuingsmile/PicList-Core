import type { IInquirerQuestion } from './inquirerShim'

/** Identifies password fields and credential-like question names for masked display and redaction. */
export const isSecretQuestion = (question: IInquirerQuestion): boolean =>
  question.type === 'password' ||
  /password|passwd|secret|token|credential|authorization|api.?key|private.?key|access.?key|^key$|^auth$/i.test(
    question.name,
  )

/**
 * Treats missing values, whitespace-only strings, and empty arrays as empty while preserving false and
 * zero.
 */
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
