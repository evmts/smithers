/**
 * E-7/EK4402 and spec chapter 6 ("Adapting a callback API"): one helper child
 * over `node:child_process`'s event API. Its cancellation must wait for the
 * operating system to report the child closed, which the `callback` hatch's
 * cleanup cannot do, so the adapter stays TypeScript (as flows/jj's
 * `runDirect`). It is the source's `Effect.callback` body with the helper's
 * answer reported as data: it never fails, and
 * `AtomicFileSystemTransport.vibe` decodes and classifies what it reports.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { parse } from "node:path"
import * as Effect from "effect/Effect"

let startedHelpers = 0

/** @vibelang trusted */
export const started = (): number => startedHelpers

/** An inert working directory: nothing the helper could import lives there. */
const inertDirectory = parse(process.execPath).root

/** How one helper run ended, before its answer is decoded. */
export type HelperExit =
  /** `spawn` threw before a child existed; nothing was started or waited for. */
  | { readonly _tag: "SpawnThrew"; readonly cause: unknown }
  /** The wall-clock backstop fired. */
  | { readonly _tag: "TimedOut" }
  /** stdout outgrew its ceiling. */
  | { readonly _tag: "Overflowed" }
  /** The child emitted `error`. */
  | { readonly _tag: "Errored"; readonly cause: unknown }
  /** The child closed with this status and output. */
  | {
    readonly _tag: "Closed"
    readonly code: number | null
    readonly stdout: Buffer
    readonly stderr: string
    readonly truncated: boolean
    readonly writeFailure: unknown
  }

/** The byte ceilings and deadline one run enforces. */
export interface Bounds {
  /** stdout bytes retained, response ceiling plus the frame header. */
  readonly stdout: number
  /** stderr bytes retained. */
  readonly stderr: number
  readonly timeoutMs: number
}

/**
 * Runs one helper over one framed payload. Every exit path kills the child,
 * releases its pipes, and waits for the operating system to report that the
 * process has closed.
 */
export const run = (executable: string, payload: Buffer, bounds: Bounds): Effect.Effect<HelperExit> =>
  Effect.callback<HelperExit>((resume) => {
    let settled = false
    const stdout: Array<Buffer> = []
    let stdoutBytes = 0
    const stderr: Array<Buffer> = []
    let stderrBytes = 0
    let truncated = false
    let writeFailure: unknown

    // The packaged helper runs with an inert cwd and empty environment. The
    // configured executable is validated outside the confined root first.
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(executable, ["--atomic-fs"], {
        cwd: inertDirectory,
        env: {},
        stdio: ["pipe", "pipe", "pipe"]
      })
      startedHelpers++
    } catch (cause) {
      // libuv reports some exec failures — `ENOEXEC` for a file that is
      // neither a script nor a binary — by throwing rather than by emitting an
      // `error` event, so both arrivals have to end in the same refusal.
      resume(Effect.succeed({ _tag: "SpawnThrew", cause }))
      return Effect.void
    }
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()))
    // `deadline` is armed below, after the completion it resumes through
    // exists. Reading it here is safe because nothing calls `cleanup` before
    // then: the one earlier exit, a spawn that threw, resumes and returns.
    const cleanup = () => {
      clearTimeout(deadline)
      child.stdin.destroy()
      child.stdout.destroy()
      child.stderr.destroy()
      child.kill("SIGKILL")
    }
    const complete = (exit: HelperExit) => {
      if (settled) return
      settled = true
      // Every exit path drains and kills, so an overflowing, hung, or already
      // finished helper leaves no descriptor and no child behind.
      cleanup()
      resume(Effect.andThen(Effect.promise(() => closed), Effect.succeed(exit)))
    }
    // A wall-clock backstop, independent of every byte ceiling.
    const deadline = setTimeout(() => {
      complete({ _tag: "TimedOut" })
    }, bounds.timeoutMs)
    deadline.unref()
    // Raw buffers, never decoded strings, concatenated once at the end.
    // Retained bytes are bounded by the ceiling plus at most one pipe chunk:
    // an overflowing chunk is sliced before it is retained.
    child.stdout.on("data", (chunk: Buffer) => {
      const remaining = bounds.stdout - stdoutBytes
      if (chunk.byteLength > remaining) {
        if (remaining > 0) {
          stdout.push(chunk.subarray(0, remaining))
          stdoutBytes += remaining
        }
        complete({ _tag: "Overflowed" })
        return
      }
      stdoutBytes += chunk.byteLength
      stdout.push(chunk)
    })
    // stderr is bounded on its own budget. Destroying the pipe stops the
    // helper at its next write.
    child.stderr.on("data", (chunk: Buffer) => {
      const slice = chunk.subarray(0, bounds.stderr - stderrBytes)
      stderrBytes += slice.byteLength
      stderr.push(slice)
      if (stderrBytes >= bounds.stderr) {
        truncated = true
        child.stderr.destroy()
      }
    })
    child.on("error", (cause) => complete({ _tag: "Errored", cause }))
    // A helper that exits before draining stdin makes the request write fail
    // with EPIPE. It is recorded rather than resumed on, so that a helper which
    // did report a real errno keeps precedence over the broken pipe.
    child.stdin.on("error", (cause) => {
      writeFailure = cause
    })
    child.on("close", (code) => {
      complete({
        _tag: "Closed",
        code,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString("utf8"),
        truncated,
        writeFailure
      })
    })
    child.stdin.end(payload)
    return Effect.promise(async () => {
      cleanup()
      await closed
    })
  })
