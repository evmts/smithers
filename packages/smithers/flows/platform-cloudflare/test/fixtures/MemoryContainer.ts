/**
 * In-memory stand-ins for a container and a server WebSocket: the platform
 * APIs `ContainerTerminal` and `SandboxObject` take, not doubles of this
 * package's code. The real container and socket run in
 * `ContainerTerminal.workerd.test.ts`.
 *
 * A command answers through `script`: an exit code for a command that runs
 * to completion, or `"interactive"` for one the test drives (`tmux attach`),
 * whose output the test writes and whose stdin, resizes and signals it
 * reads. Faults are injected through the options.
 */
import * as Cause from "effect/Cause"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import type { ContainerTerminal, SandboxObject } from "../../src/index.ts"

/** The container's own failure, as an Alchemy container client's `ContainerError`. */
export class ContainerFailure extends Schema.TaggedError<ContainerFailure>()("ContainerFailure", {
  message: Schema.String
}) {}

/** One process the test drives. */
export interface Interactive {
  readonly argv: ReadonlyArray<string>
  readonly options: ContainerTerminal.ExecOptions | undefined
  /** Writes the shell's output. */
  readonly write: (bytes: Uint8Array) => Effect.Effect<void>
  /** Ends the output and exits the process, as a tmux client whose session ended. */
  readonly exit: (code: number) => Effect.Effect<void>
  /** Fails the output stream. */
  readonly breakOutput: Effect.Effect<void>
  /** The next bytes stdin received. */
  readonly typed: Effect.Effect<Uint8Array>
  readonly resizes: Array<readonly [number, number]>
  readonly kills: Array<number | undefined>
  /** The exit code, once the process exits. */
  readonly exited: Effect.Effect<number>
}

export interface Faults {
  /** `exec` fails for every command. */
  readonly exec?: boolean
  /** The process has no stdout. */
  readonly noStdout?: boolean
  /** The process has no stdin even when it was asked for. */
  readonly noStdin?: boolean
  /** Writing to stdin fails. */
  readonly stdin?: boolean
  /** Resizing fails. */
  readonly resize?: boolean
  /** Every `exec` waits for this, after announcing itself on `entered`. */
  readonly hold?: Deferred.Deferred<void>
}

export interface MemoryContainer {
  readonly container: ContainerTerminal.Container<ContainerFailure>
  /** Every command run, in order. */
  readonly commands: Array<{ readonly argv: ReadonlyArray<string>; readonly options: unknown }>
  /** The next interactive process started. */
  readonly started: Effect.Effect<Interactive>
  /** The next `exec` call, once it has begun. */
  readonly entered: Effect.Effect<void>
}

export const make = (
  script: (argv: ReadonlyArray<string>) => number | "interactive",
  faults: Faults = {}
): MemoryContainer => {
  const commands: Array<{ readonly argv: ReadonlyArray<string>; readonly options: unknown }> = []
  const started = Effect.runSync(Queue.unbounded<Interactive>())
  const entered = Effect.runSync(Queue.unbounded<void>())

  const interactive = (argv: ReadonlyArray<string>, options: ContainerTerminal.ExecOptions | undefined) =>
    Effect.gen(function*() {
      const output = yield* Queue.unbounded<Uint8Array, ContainerFailure | Cause.Done>()
      const typed = yield* Queue.unbounded<Uint8Array>()
      const exitCode = yield* Deferred.make<number>()
      const resizes: Array<readonly [number, number]> = []
      const kills: Array<number | undefined> = []
      const exit = (code: number) =>
        Effect.andThen(Queue.end(output), Deferred.succeed(exitCode, code)).pipe(Effect.asVoid)
      const handle: Interactive = {
        argv,
        options,
        write: (bytes) => Effect.asVoid(Queue.offer(output, bytes)),
        exit,
        breakOutput: Effect.asVoid(Queue.fail(output, new ContainerFailure({ message: "output broke" }))),
        typed: Queue.take(typed),
        resizes,
        kills,
        exited: Deferred.await(exitCode)
      }
      yield* Queue.offer(started, handle)
      const process: ContainerTerminal.Process<ContainerFailure> = {
        stdin: options?.stdin === "pipe" && faults.noStdin !== true
          ? faults.stdin === true
            ? Sink.forEach(() => Effect.fail(new ContainerFailure({ message: "stdin broke" })))
            : Sink.forEach((chunk: Uint8Array) => Queue.offer(typed, chunk.slice()))
          : undefined,
        stdout: faults.noStdout === true ? undefined : Stream.fromQueue(output),
        exitCode: Deferred.await(exitCode),
        kill: (signal) =>
          Effect.suspend(() => {
            kills.push(signal)
            return exit(128 + (signal ?? 15))
          }),
        resize: (cols, rows) =>
          faults.resize === true
            ? Effect.fail(new ContainerFailure({ message: "resize broke" }))
            : Effect.sync(() => {
              resizes.push([cols, rows])
            })
      }
      return process
    })

  const finished = (code: number): ContainerTerminal.Process<ContainerFailure> => ({
    stdin: undefined,
    stdout: Stream.empty,
    exitCode: Effect.succeed(code),
    kill: () => Effect.void,
    resize: () => Effect.void
  })

  return {
    commands,
    started: Queue.take(started),
    entered: Queue.take(entered),
    container: {
      exec: (cmd, options) =>
        Effect.gen(function*() {
          commands.push({ argv: [...cmd], options })
          yield* Queue.offer(entered, undefined)
          if (faults.hold !== undefined) yield* Deferred.await(faults.hold)
          if (faults.exec === true) return yield* new ContainerFailure({ message: "exec broke" })
          const answer = script(cmd)
          return answer === "interactive" ? yield* interactive(cmd, options) : finished(answer)
        })
    }
  }
}

/** One frame the socket sent: text as a string, binary as a copy of its bytes. */
export type Sent = string | Uint8Array

export interface MemorySocket {
  readonly socket: ContainerTerminal.Socket
  /** The next frame the server sent. */
  readonly next: Effect.Effect<Sent>
  /** The close code the server sent, once it closed the socket. */
  readonly closed: Effect.Effect<number | undefined>
  /** Delivers an event to the server's listeners, as the viewer's side does. */
  readonly emit: (type: "message" | "close" | "error", data?: unknown) => void
  /** Makes every later send throw, as a send on a socket that went away does. */
  readonly breakSends: () => void
}

/** A server WebSocket the test plays the viewer of. */
export const socket = (): MemorySocket => {
  const listeners = new Map<string, Array<(event: ContainerTerminal.SocketEvent) => void>>()
  const sent = Effect.runSync(Queue.unbounded<Sent>())
  const closed = Effect.runSync(Deferred.make<number | undefined>())
  let broken = false
  return {
    next: Queue.take(sent),
    closed: Deferred.await(closed),
    breakSends: () => {
      broken = true
    },
    emit: (type, data) => {
      for (const listener of listeners.get(type) ?? []) listener({ type, data })
    },
    socket: {
      send: (message) => {
        if (broken) throw new TypeError("WebSocket send() after close")
        Queue.offerUnsafe(sent, typeof message === "string" ? message : new Uint8Array(message).slice())
      },
      close: (code) => {
        Deferred.doneUnsafe(closed, Effect.succeed(code))
      },
      addEventListener: (type, listener) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener])
      }
    }
  }
}

/** One call a machine received, in order. */
export type Call =
  | { readonly _tag: "start"; readonly options: unknown }
  | { readonly _tag: "timeout"; readonly ms: number }
  | { readonly _tag: "intercept"; readonly host: string; readonly fetcher: string }
  | { readonly _tag: "interceptAll"; readonly fetcher: string }
  | { readonly _tag: "interceptHttps"; readonly host: string; readonly fetcher: string }

/** A container client's lifecycle half, recording each call; `fail` names the call that fails. */
export const machine = (
  running: boolean,
  fail?: Call["_tag"]
): { readonly machine: SandboxObject.Machine<string, ContainerFailure>; readonly calls: Array<Call> } => {
  const calls: Array<Call> = []
  const record = (call: Call) =>
    Effect.suspend(() => {
      calls.push(call)
      return call._tag === fail ? Effect.fail(new ContainerFailure({ message: `${call._tag} broke` })) : Effect.void
    })
  return {
    calls,
    machine: {
      running: Effect.sync(() => running),
      start: (options) => record({ _tag: "start", options }),
      setInactivityTimeout: (ms) => record({ _tag: "timeout", ms }),
      interceptOutboundHttp: (host, fetcher) => record({ _tag: "intercept", host, fetcher }),
      interceptAllOutboundHttp: (fetcher) => record({ _tag: "interceptAll", fetcher }),
      interceptOutboundHttps: (host, fetcher) => record({ _tag: "interceptHttps", host, fetcher })
    }
  }
}
