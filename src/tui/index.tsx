import { render } from 'ink'

import type { IPicGo } from '../types'
import { App } from './App'
import { TuiSession } from './session'

/**
 * Runs the interactive terminal workspace until exit and restores client services after active work
 * settles.
 *
 * @throws If stdin or stdout is not an interactive terminal.
 */
export async function startTui(ctx: IPicGo): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('The TUI requires an interactive terminal. Use picgo --help for command-line usage.')
  }
  const session = new TuiSession()
  session.attach(ctx)
  let app: ReturnType<typeof render> | undefined
  try {
    app = render(<App ctx={ctx} session={session} />, { exitOnCtrlC: false, alternateScreen: true })
    await app.waitUntilExit()
  } finally {
    app?.unmount()
    await session.dispose()
  }
}
