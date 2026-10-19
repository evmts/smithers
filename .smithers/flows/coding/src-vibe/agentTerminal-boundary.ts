// A-2/E-4 (D38): runner boundaries that hand a Promise, a running fiber or an
// async iterator to TypeScript callers stay in TypeScript: VibeLang has no
// async or await outside a hatch's body (EK1003), and the TerminalPort hands
// TypeScript an AsyncGenerator. E-7/EK4402: existsSync and process.getuid are
// platform APIs that VibeLang code does not call directly.
import type * as StandardFlows from "@smthrs/agent/StandardFlows"
import type { StdError } from "@smthrs/std/StdError"
import { Effect } from "effect"
import { existsSync } from "node:fs"

/** A single-consumer frame channel: the client's output in arrival order. */
export class Channel {
  private readonly frames: Array<StandardFlows.TerminalFrame> = []
  private failure: StdError | undefined
  private done = false
  private wake: (() => void) | undefined

  push(frame: StandardFlows.TerminalFrame): void {
    this.frames.push(frame)
    this.notify()
  }
  end(failure?: StdError): void {
    this.failure = failure
    this.done = true
    this.notify()
  }
  private notify(): void {
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }
  async *iterate(): AsyncGenerator<StandardFlows.TerminalFrame> {
    while (true) {
      const frame = this.frames.shift()
      if (frame !== undefined) {
        yield frame
        continue
      }
      if (this.done) {
        if (this.failure !== undefined) throw this.failure
        return
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve
      })
    }
  }
}

export const runPromise = <A, E>(effect: Effect.Effect<A, E>): Promise<A> => Effect.runPromise(effect)

export const runFork = <A, E>(effect: Effect.Effect<A, E>): void => {
  Effect.runFork(effect)
}

export const clientInstalled = (client: string, socket: string): boolean =>
  existsSync(client) && existsSync(socket) && process.getuid?.() === 19999
