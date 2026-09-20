import { checkbox, confirm, input, password, select } from '@inquirer/prompts'

/** Legacy-style question contract shared by CLI prompts and terminal UI adapters. */
export interface IInquirerQuestion {
  type: string
  name: string
  message?: string
  choices?: ({ name: string; value: any } | string)[]
  default?: any
  validate?: (val: any) => boolean | string | Promise<boolean | string>
  /** Controls visibility using answers collected from earlier questions. */
  when?: boolean | ((answers: Record<string, any>) => boolean | Promise<boolean>)
  /** Transforms a submitted value before it is stored in the answer map. */
  filter?: (val: any) => any
  /** Formats the displayed input without replacing its stored value. */
  transformer?: (val: any) => string
  [key: string]: any
}

/** Replaceable sequential prompt interface used by commands and embedded UI sessions. */
export interface IInquirerAdapter {
  /** Asks the supplied questions in order and returns answers keyed by question name. */
  prompt<T = Record<string, any>>(questions: IInquirerQuestion[]): Promise<T>
}

/** Expands string choices into explicit display-name/value pairs for modern Inquirer prompts. */
function normaliseChoices(
  choices: ({ name: string; value: any } | string)[] | undefined,
): { name: string; value: any }[] {
  if (!choices) return []
  return choices.map(c => (typeof c === 'string' ? { name: c, value: c } : c))
}

/** Evaluates visibility and dispatches a legacy question to its modern Inquirer prompt implementation. */
async function runQuestion(question: IInquirerQuestion, answers: Record<string, any>): Promise<any> {
  // evaluate the `when` guard
  if (question.when !== undefined) {
    const show = typeof question.when === 'function' ? await question.when(answers) : question.when
    if (!show) return undefined
  }

  const message = question.message ?? question.name
  const theme = question.prefix ? { prefix: question.prefix } : undefined
  const context = {} // use @inquirer/prompts defaults

  switch (question.type) {
    case 'input': {
      return input(
        {
          message,
          default: question.default !== undefined ? String(question.default) : undefined,
          validate: question.validate,
          transformer: question.transformer,
          theme,
        },
        context,
      )
    }

    case 'password': {
      return password(
        {
          message,
          mask: false,
          validate: question.validate,
          theme,
        },
        context,
      )
    }

    case 'confirm': {
      return confirm(
        {
          message,
          default: question.default !== undefined ? Boolean(question.default) : undefined,
          theme,
        },
        context,
      )
    }

    case 'list':
    case 'rawlist': {
      return select(
        {
          message,
          choices: normaliseChoices(question.choices),
          default: question.default,
          theme,
        },
        context,
      )
    }

    case 'checkbox': {
      const normChoices = normaliseChoices(question.choices)
      const defaultValues: string[] = Array.isArray(question.default) ? question.default : []
      return checkbox(
        {
          message,
          choices: normChoices.map(c => ({
            name: c.name,
            value: c.value,
            checked: defaultValues.includes(c.value),
          })),
          validate: question.validate,
          theme,
        },
        context,
      )
    }

    default: {
      // fallback: treat unknown types as plain input
      return input(
        {
          message,
          default: question.default !== undefined ? String(question.default) : undefined,
          theme,
        },
        context,
      )
    }
  }
}

/**
 * Creates an adapter whose `.prompt()` method mirrors the legacy
 * `inquirer.prompt(questions)` API.
 */
export function createInquirerAdapter(): IInquirerAdapter {
  return {
    /**
     * Collects visible answers sequentially and applies filters before exposing them to later
     * questions.
     */
    async prompt<T = Record<string, any>>(questions: IInquirerQuestion[]): Promise<T> {
      const answers: Record<string, any> = {}
      for (const q of questions) {
        let value = await runQuestion(q, answers)
        if (q.filter && value !== undefined) {
          value = q.filter(value)
        }
        if (value !== undefined) {
          answers[q.name] = value
        }
      }
      return answers as T
    },
  }
}
