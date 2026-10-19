/**
 * Hatch for `NativeRuntime.vibe`.
 *
 * - E-7/EK4402: `node:path`, `node:os` and `process` are platform APIs, which
 *   VibeLang code does not call directly. Each wrapper is the source's own
 *   expression.
 * - D38/EK1005: a signal handler is a runner boundary. The platform calls it
 *   as a plain callback, and it starts the shutdown with `Effect.runFork`,
 *   arms a platform timer, and exits the process. `signalHandlers` is the
 *   source's handler construction from `onSignal`, with the shared deadline
 *   it clears on release.
 */
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Scope from "effect/Scope"
import { constants } from "node:os"
import { dirname, resolve } from "node:path"

/** @vibelang trusted */
export const resolvePath = (path: string): string => resolve(path)

/** @vibelang trusted */
export const directoryOf = (path: string): string => dirname(path)

/** `node:os`'s signal numbers, `constants.signals`. */
export const signalNumbers = (): Readonly<Record<string, number>> & { readonly SIGTERM: number } => constants.signals

/** @vibelang trusted */
export const processId = (): number => process.pid

/** The handlers `onSignal` installs, and the deadline they share. */
export interface SignalHandlers {
  readonly handlers: ReadonlyArray<{ readonly signal: NodeJS.Signals; readonly handler: () => void }>
  readonly clearDeadline: () => void
}

/** @vibelang trusted */
export const signalHandlers = (
  signals: ReadonlyArray<NodeJS.Signals>,
  runtime: Scope.Closeable,
  timeoutMs: number,
  signalExitCode: (signal: NodeJS.Signals) => number
): SignalHandlers => {
  let closing = false
  let deadline: NodeJS.Timeout | undefined
  const leave = (signal: NodeJS.Signals) => {
    process.exit(signalExitCode(signal))
  }
  const handlers = signals.map((signal) => {
    const handler = () => {
      if (closing) {
        // The operator asked twice. Whatever the shutdown is waiting for, it
        // has stopped being this program's decision.
        leave(signal)
        return
      }
      closing = true
      Effect.runFork(Scope.close(runtime, Exit.void))
      deadline = setTimeout(() => leave(signal), timeoutMs)
      // A shutdown that finishes on time must not be held open by its own
      // deadline timer.
      deadline.unref()
    }
    return { signal, handler }
  })
  return {
    handlers,
    clearDeadline: () => {
      if (deadline !== undefined) clearTimeout(deadline)
    }
  }
}
