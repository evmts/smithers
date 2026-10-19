/**
 * E-7/EK4402: `node:child_process`'s `spawn`, its event listeners and
 * `process` are platform APIs, which VibeLang code does not call directly.
 * {@link start} is the source's acquire body in `PipedProcess.spawn`, byte for
 * byte: it spawns the native child, records its startup, exit and pipe errors
 * as data, and throws a synchronous spawn failure, which `PipedProcess.vibe`
 * reports through its own `failure`. Everything the handle does with that
 * state stays in `PipedProcess.vibe`.
 */
import * as Native from "node:child_process"
import type * as ChildProcess from "effect/process/ChildProcess"

const promise = <A>() => {
  let resolve!: (value: A) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<A>((onSuccess, onFailure) => {
    resolve = onSuccess
    reject = onFailure
  })
  void promise.catch(() => {})
  return { promise, resolve, reject }
}

/** One native child and what its events have reported so far. */
export interface NativeState {
  readonly child: Native.ChildProcess
  readonly ready: Promise<void>
  readonly exited: Promise<readonly [number | null, NodeJS.Signals | null]>
  ended: boolean
  started: boolean
  referenced: boolean
  readonly pipeErrors: WeakMap<object, Error>
  error: Error | undefined
}

/**
 * Spawns the native child with the prepared stdio table. `outputs` are the
 * physical descriptors kept in readable mode for their whole lifetime.
 */
export const start = (
  command: ChildProcess.StandardCommand,
  windowsVerbatimArguments: boolean | undefined,
  stdio: Array<Native.IOType | number>,
  outputs: ReadonlyArray<number>
): NativeState => {
  const ready = promise<void>()
  // Startup errors reject ready before any handle is exposed. Once
  // started, the native exit event or retained native status supplies
  // this result.
  let recordExit!: (result: readonly [number | null, NodeJS.Signals | null]) => void
  const exited = new Promise<readonly [number | null, NodeJS.Signals | null]>((resolve) => {
    recordExit = resolve
  })
  const options = command.options
  const child = Native.spawn(command.command, [...command.args], {
    cwd: options.cwd,
    env: options.extendEnv ? { ...process.env, ...options.env } : options.env,
    shell: options.shell,
    detached: options.detached ?? process.platform !== "win32",
    windowsHide: options.windowsHide ?? true,
    windowsVerbatimArguments,
    stdio
  })
  const state: NativeState = {
    child,
    ready: ready.promise,
    exited,
    ended: false,
    started: false,
    referenced: true,
    pipeErrors: new WeakMap<object, Error>(),
    error: undefined as Error | undefined
  }
  child.once("spawn", () => {
    state.started = true
    ready.resolve()
  })
  child.on("error", (error) => {
    state.error = error
    if (!state.started) {
      state.ended = true
      ready.reject(error)
    }
  })
  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    state.ended = true
    recordExit([code, signal])
  }
  child.once("exit", onExit)
  // Bun can emit spawn before Native.spawn returns on a cold start.
  // A returned pid proves that the native child was created; failed
  // native spawns have no pid and still reject through the error event.
  if (child.pid !== undefined) {
    state.started = true
    ready.resolve()
  }
  // Likewise retain an exit already reflected by the native handle
  // before listeners could attach. Later events settle the same result.
  if (child.exitCode != null || child.signalCode != null) {
    onExit(child.exitCode ?? null, child.signalCode ?? null)
  }
  // A pipe can fail before a consumer has started reading or writing.
  // Preserve the cause for consumers that attach after its error event.
  for (const pipe of child.stdio) {
    pipe?.on("error", (error: Error) => {
      state.pipeErrors.set(pipe, error)
    })
  }
  // Node resumes unread stdio after exit to deliver its close event.
  // A fast target can exit before activation returns the public handle;
  // flowing at that point discards bytes before any consumer subscribes.
  // Keep declared outputs in readable mode for their entire lifetime.
  // This listener does not drain or copy data: the native high-water
  // mark still applies backpressure until NodeStream pulls the bytes.
  for (const fd of outputs) {
    const pipe = child.stdio[fd]
    pipe?.on("readable", () => {})
    // POSIX sockets can close the unused writer independently. Bun
    // needs this to retain buffered output after child exit. Windows
    // named-pipe shutdown instead starts libuv's EOF timer, which can
    // close both directions before the child writes. Leave it open.
    if (process.platform !== "win32" && fd > 2 && pipe !== null && pipe !== undefined && "end" in pipe) {
      pipe.end()
    }
  }
  return state
}

/**
 * Sends one native signal. Native kill returns false for an exit whose event
 * is still queued; only a recorded native error makes that a failure.
 */
export const signal = (state: NativeState, signal: ChildProcess.Signal): void => {
  if (!state.child.kill(signal) && state.error !== undefined) throw state.error
}

/** Destroys every owned pipe. */
export const destroyPipes = (state: NativeState): void => {
  for (const pipe of state.child.stdio) {
    if (pipe !== null && pipe !== undefined && "destroy" in pipe && typeof pipe.destroy === "function") {
      pipe.destroy()
    }
  }
}

/** `child.unref()`. */
export const unref = (state: NativeState): void => {
  state.child.unref()
}

/** `child.ref()`. */
export const ref = (state: NativeState): void => {
  state.child.ref()
}
