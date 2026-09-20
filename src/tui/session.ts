import type { IPicGo } from '../types'
import { IBuildInEvent } from '../utils/enum'
import type { IInquirerAdapter, IInquirerQuestion } from '../utils/inquirerShim'
import { english, type Translate, translator } from './i18n'

export { isSecretQuestion } from '../utils/configPrompts'

/** Signals that a pending UI form was cancelled without treating cancellation as an operation error. */
export class PromptCancelledError extends Error {
  constructor() {
    super('Cancelled. No pending form was saved.')
  }
}

/** Only errors created by the UI are safe to present; provider errors can contain credentials. */
export class TuiError extends Error {}

export interface PromptPosition {
  current: number
  total: number
}

/**
 * Adapts sequential legacy questions to UI prompts, resolving conditional visibility, defaults, and
 * filters.
 */
export function createPromptAdapter(
  ask: (question: IInquirerQuestion, position?: PromptPosition) => Promise<any>,
): IInquirerAdapter {
  return {
    /**
     * Asks visible questions in order, passing prior answers to dynamic defaults and visibility
     * guards.
     */
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

/** Immutable session snapshot consumed by the terminal UI through useSyncExternalStore. */
export interface SessionState {
  busy: boolean
  title: string
  status: string
  error: boolean
  outcome?: 'success' | 'warning' | 'cancelled' | 'error'
  progress?: number
  results: string[]
  resultTitle?: string
  /**
   * Increments only when an operation supplies nonempty results so the UI can reopen the result panel.
   */
  resultRevision: number
  prompt?: { id: number; question: IInquirerQuestion; position?: PromptPosition }
}

/** Serializes UI actions and bridges prompts, progress, and safe operation status to React. */
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
  /** Resolver pair for the single active prompt, cleared before submission or cancellation. */
  private pending?: { resolve: (value: any) => void; reject: (error: Error) => void }
  /** Monotonic prompt identity used to reset component state between questions. */
  private sequence = 0
  /**
   * Tracks core error logs and failure progress without retaining their potentially sensitive
   * payloads.
   */
  private failed = false
  /** Tracks whether core services reported warnings during the active action. */
  private warned = false
  private disposed = false
  /** Active action promise awaited during disposal before restoring normal logging. */
  private task?: Promise<void>
  /** Restores the client's original logger and prompt adapter and detaches progress forwarding. */
  private restore?: () => void
  private t: Translate = english

  getSnapshot = (): SessionState => this.state

  /** Registers a snapshot listener and returns a function that removes it. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Replaces the session snapshot and synchronously notifies subscribers. */
  private update(change: Partial<SessionState>): void {
    this.state = { ...this.state, ...change }
    this.listeners.forEach(listener => listener())
  }

  /** Installs UI prompts and status-only logging, and subscribes to upload progress on the client. */
  attach(ctx: IPicGo): void {
    this.t = translator(ctx)
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
    /** Marks negative progress as failure and clamps finite progress values for an active operation. */
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

  /** Opens one prompt and resolves when answered; rejects if disposed or another prompt is pending. */
  ask = (question: IInquirerQuestion, position?: PromptPosition): Promise<any> => {
    if (this.disposed) return Promise.reject(new PromptCancelledError())
    if (this.pending) return Promise.reject(new TuiError('Another form is already open.'))
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject }
      this.update({ prompt: { id: ++this.sequence, question, position } })
    })
  }

  /** Clears the active prompt before resolving its pending answer. */
  answer = (value: any): void => {
    const pending = this.pending
    this.pending = undefined
    this.update({ prompt: undefined })
    pending?.resolve(value)
  }

  /** Rejects the active prompt with a cancellation error; does not abort an in-flight core upload. */
  cancel = (): void => {
    const pending = this.pending
    this.pending = undefined
    this.update({ prompt: undefined })
    pending?.reject(new PromptCancelledError())
  }

  /**
   * Runs one action, retains prior results when none are returned, and converts errors to safe UI
   * messages.
   *
   * @returns A settled action promise; busy or disposed sessions ignore new actions.
   */
  run(title: string, action: () => Promise<string[] | void>): Promise<void> {
    if (this.state.busy || this.disposed) return Promise.resolve()
    this.failed = false
    this.warned = false
    this.update({
      busy: true,
      title,
      status: this.t('Working…'),
      error: false,
      outcome: undefined,
      progress: undefined,
    })
    this.task = (async () => {
      try {
        const results = await action()
        this.update({
          ...(results?.length ? { results, resultTitle: title, resultRevision: this.state.resultRevision + 1 } : {}),
          error: this.failed,
          outcome: this.failed ? 'error' : this.warned ? 'warning' : 'success',
          status: this.t(
            this.failed
              ? 'The operation reported an error. Check your configuration and try again.'
              : this.warned
                ? 'Finished with a warning. Review the selected configuration.'
                : 'Done',
          ),
        })
      } catch (error) {
        this.update({
          error: !(error instanceof PromptCancelledError),
          outcome: error instanceof PromptCancelledError ? 'cancelled' : 'error',
          status:
            error instanceof PromptCancelledError || error instanceof TuiError
              ? this.t(error.message)
              : this.t('The operation failed. Check your configuration and connection, then try again.'),
        })
      } finally {
        this.update({ busy: false, prompt: undefined })
      }
    })()
    return this.task
  }

  /** Cancels pending input, awaits active work, then restores client services and removes subscribers. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.cancel()
    // Core uploads have no abort API. Keep logs isolated until in-flight work settles.
    await this.task
    this.restore?.()
    this.listeners.clear()
  }
}
