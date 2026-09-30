import type { IInquirerQuestion } from './inquirerShim'

/** Identifies password fields and credential-like question names for validation-message redaction. */
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

/** Applies required-field checks before the field's explicit validator. */
export async function validateQuestion(question: IInquirerQuestion, value: unknown): Promise<boolean | string> {
  if (question.required && isEmptyValue(value)) return 'This field is required.'
  return question.validate ? await question.validate(value) : true
}

/** Evaluate the existing form contract without saving defaults or exposing validation payloads. */
export async function invalidFields(
  questions: IInquirerQuestion[],
  config: Record<string, unknown>,
): Promise<string[]> {
  const invalid: string[] = []
  for (const question of questions) {
    const visible = typeof question.when === 'function' ? await question.when(config) : question.when
    if (visible === false) continue
    const result = await validateQuestion(question, config[question.name])
    if (result === false || typeof result === 'string') invalid.push(question.name)
  }
  return invalid
}

/** Rejects invalid form values before persistence without exposing provider errors or credentials. */
export async function assertValidConfig(
  questions: IInquirerQuestion[],
  config: Record<string, unknown>,
): Promise<void> {
  let valid = false
  try {
    valid = (await invalidFields(questions, config)).length === 0
  } catch {
    /* Provider validation errors are not safe to display. */
  }
  if (!valid) throw new Error('Invalid configuration: check required fields and validation rules before saving.')
}
