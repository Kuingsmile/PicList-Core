import type { IPicGo } from '../types'
import { IBuildInEvent } from '../utils/enum'
import type { IInquirerAdapter, IInquirerQuestion } from '../utils/inquirerShim'

export class PromptCancelledError extends Error {
  constructor() {
    super('Cancelled. No pending form was saved.')
  }
}

/** Only errors created by the UI are safe to present; provider errors can contain credentials. */
export class TuiError extends Error {}

export const isSecretQuestion = (question: IInquirerQuestion): boolean =>
  question.type === 'password' ||
  /password|passwd|secret|token|credential|authorization|api.?key|private.?key|access.?key|^key$|^auth$/i.test(
    question.name,
  )

export interface PromptPosition {
  current: number
  total: number
}

export function createPromptAdapter(
  ask: (question: IInquirerQuestion, position?: PromptPosition) => Promise<any>,
): IInquirerAdapter {
  return {
    async prompt<T>(questions: IInquirerQuestion[]): Promise<T> {
      const answers: Record<string, any> = {}
      for (const [index, question] of questions.entries()) {
        const visible = typeof question.when === 'function' ? await question.when(answers) : question.when
        if (visible === false) continue
        const resolved = {
          ...question,
          default: typeof question.default === 'function' ? await question.default(answers) : question.default,
        }
        const value = await ask(resolved, { current: index + 1, total: questions.length })
        answers[question.name] = question.filter ? await question.filter(value) : value
      }
      return answers as T
    },
  }
}

export interface SessionState {
  busy: boolean
  title: string
  status: string
  error: boolean
  progress?: number
  results: string[]
  resultTitle?: string
  resultRevision: number
  prompt?: { id: number; question: IInquirerQuestion; position?: PromptPosition }
}

export class TuiSession {
  private state: SessionState = {
    busy: false,
    title: '',
    status: 'Ready',
    error: false,
    results: [],
    resultRevision: 0,
  }
  private listeners = new Set<() => void>()
  private pending?: { resolve: (value: any) => void; reject: (error: Error) => void }
  private sequence = 0
  private failed = false
  private warned = false
  private disposed = false
  private task?: Promise<void>
  private restore?: () => void

  getSnapshot = (): SessionState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private update(change: Partial<SessionState>): void {
    this.state = { ...this.state, ...change }
    this.listeners.forEach(listener => listener())
  }

  attach(ctx: IPicGo): void {
    const previousPrompt = ctx.cmd.inquirer
    const previousLogger = ctx.log
    ctx.cmd.inquirer = createPromptAdapter(this.ask)
    // Do not send form values, provider responses or credentials to terminal/file logs.
    ctx.log = {
      info: () => {},
      success: () => {},
      debug: () => {},
      warn: () => {
        this.warned = true
      },
      error: () => {
        this.failed = true
      },
    }
    const onProgress = (progress: number) => {
      if (this.state.busy && Number.isFinite(progress)) {
        if (progress < 0) this.failed = true
        this.update({ progress: Math.max(0, Math.min(100, progress)) })
      }
    }
    ctx.on(IBuildInEvent.UPLOAD_PROGRESS, onProgress)
    this.restore = () => {
      ctx.cmd.inquirer = previousPrompt
      ctx.log = previousLogger
      ctx.removeListener(IBuildInEvent.UPLOAD_PROGRESS, onProgress)
    }
  }

  ask = (question: IInquirerQuestion, position?: PromptPosition): Promise<any> => {
    if (this.disposed) return Promise.reject(new PromptCancelledError())
    if (this.pending) return Promise.reject(new TuiError('Another form is already open.'))
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject }
      this.update({ prompt: { id: ++this.sequence, question, position } })
    })
  }

  answer = (value: any): void => {
    const pending = this.pending
    this.pending = undefined
    this.update({ prompt: undefined })
    pending?.resolve(value)
  }

  cancel = (): void => {
    const pending = this.pending
    this.pending = undefined
    this.update({ prompt: undefined })
    pending?.reject(new PromptCancelledError())
  }

  run(title: string, action: () => Promise<string[] | void>): Promise<void> {
    if (this.state.busy || this.disposed) return Promise.resolve()
    this.failed = false
    this.warned = false
    this.update({ busy: true, title, status: 'Working…', error: false, progress: undefined })
    this.task = (async () => {
      try {
        const results = await action()
        this.update({
          ...(results?.length ? { results, resultTitle: title, resultRevision: this.state.resultRevision + 1 } : {}),
          error: this.failed,
          status: this.failed
            ? 'The operation reported an error. Check your configuration and try again.'
            : this.warned
              ? 'Finished with a warning. Review the selected configuration.'
              : 'Done',
        })
      } catch (error) {
        this.update({
          error: !(error instanceof PromptCancelledError),
          status:
            error instanceof PromptCancelledError || error instanceof TuiError
              ? error.message
              : 'The operation failed. Check your configuration and connection, then try again.',
        })
      } finally {
        this.update({ busy: false, prompt: undefined })
      }
    })()
    return this.task
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.cancel()
    // Core uploads have no abort API. Keep logs isolated until in-flight work settles.
    await this.task
    this.restore?.()
    this.listeners.clear()
  }
}
