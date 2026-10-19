/**
 * E-7/EK4402: `node:child_process`, `node:fs`, `node:fs/promises`, `node:os`,
 * `node:path`, `node:util`, `process` and `Buffer` are platform APIs, which
 * VibeLang code does not call directly (as in flows/database's hatches).
 * `NodeJj.vibe` reads them through these.
 *
 * {@link runDirect} adapts `node:child_process`'s event API. Wrapping a
 * callback API whose cancellation must wait for the child is boundary code that
 * belongs in TypeScript (spec chapter 6, "Adapting a callback API"): the
 * `callback` hatch's cleanup cannot wait. It never fails; `NodeJj.vibe`
 * classifies what it reports.
 *
 * The lock helpers are the source's promise-based `node:fs/promises` code,
 * byte for byte.
 */
import * as ChildProcess from "node:child_process"
import { readFileSync, realpathSync, statSync, type Stats } from "node:fs"
import { readdir, rename, rmdir, unlink } from "node:fs/promises"
import { hostname } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { stripVTControlCharacters } from "node:util"
import * as Effect from "effect/Effect"

/** @vibelang trusted */
export const stripControl = (text: string): string => stripVTControlCharacters(text)

/** @vibelang trusted */
export const statOf = (path: string): Stats => statSync(path)

/** @vibelang trusted */
export const parentOf = (path: string): string => dirname(path)

/** @vibelang trusted */
export const joinPath = (...segments: Array<string>): string => join(...segments)

/** @vibelang trusted */
export const resolvePath = (...segments: Array<string>): string => resolve(...segments)

/** @vibelang trusted */
export const realpathOf = (path: string): string => realpathSync(path)

/** @vibelang trusted */
export const readText = (path: string): string => readFileSync(path, "utf8")

/** @vibelang trusted */
export const isAbsolutePath = (path: string): boolean => isAbsolute(path)

/** @vibelang trusted */
export const currentDirectory = (): string => process.cwd()

const errnoIs = (cause: unknown, code: string): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === code

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (cause) {
    return !errnoIs(cause, "ESRCH")
  }
}

/**
 * Remove only this unique owner's entry, then remove the directory IF empty.
 * Another claimant may already have replaced the empty directory with its own
 * populated one; rmdir cannot delete that live lock. A read-then-unlink of a
 * single lock file would instead let two stale-lock reclaimers delete a new owner.
 */
export const removeLockOwner = async (lockPath: string, owner: string): Promise<void> => {
  try {
    await unlink(join(lockPath, owner))
  } catch (cause) {
    if (!errnoIs(cause, "ENOENT")) throw cause
  }
  try {
    await rmdir(lockPath)
  } catch (cause) {
    if (!errnoIs(cause, "ENOENT") && !errnoIs(cause, "ENOTEMPTY") && !errnoIs(cause, "EEXIST")) throw cause
  }
}

const reclaimDeadLock = async (lockPath: string): Promise<void> => {
  try {
    const owners = await readdir(lockPath)
    for (const owner of owners) {
      const match = /^(.*)-(\d+)-[^-]+$/.exec(owner)
      if (match !== null && match[1] === hostname() && !processIsAlive(Number(match[2]))) {
        await removeLockOwner(lockPath, owner)
      }
    }
  } catch (cause) {
    if (!errnoIs(cause, "ENOENT")) throw cause
  }
}

/**
 * One attempt to publish the populated candidate as the lock: `true` when the
 * rename won, `false` after reclaiming a dead owner's lock for the next try.
 */
export const claimLock = async (candidate: string, lockPath: string): Promise<boolean> => {
  try {
    await rename(candidate, lockPath)
    return true
  } catch (cause) {
    if (!errnoIs(cause, "ENOTEMPTY") && !errnoIs(cause, "EEXIST")) throw cause
    await reclaimDeadLock(lockPath)
    return false
  }
}

/** A finished child: what it printed and how it ended. */
export interface DirectOutput {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly signal: NodeJS.Signals | null
}

/** How one direct `jj` invocation ended, for `NodeJj.vibe` to classify. */
export type DirectOutcome =
  | { readonly _tag: "Exited"; readonly output: DirectOutput }
  | { readonly _tag: "SpawnFailed"; readonly cause: unknown; readonly missingBinary: boolean }
  | { readonly _tag: "TooLarge" }

/** Runs `command` with argv (never a shell string) in `cwd`. */
export const runDirect = (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string | undefined,
  outputLimit: number
): Effect.Effect<DirectOutcome> =>
  Effect.callback<DirectOutcome>((resume) => {
    let child: ChildProcess.ChildProcess
    try {
      // `node:child_process` delivers only EACCES, EAGAIN, EMFILE, ENFILE, and
      // ENOENT as an `error` event and THROWS every other spawn failure, so an
      // argument carrying a NUL byte or a `cwd` that is a file would leave the
      // typed channel as a defect no caller of `Jj` can catch.
      child = ChildProcess.spawn(command, [...args], { cwd, stdio: ["ignore", "pipe", "pipe"] })
    } catch (cause) {
      resume(Effect.succeed({ _tag: "SpawnFailed", cause, missingBinary: false }))
      return Effect.void
    }
    let stdout = ""
    let stderr = ""
    // The first outcome wins. Stopping an over-talkative child makes its
    // `close` arrive after the invocation has already failed, and a spawn
    // `error` is followed by a `close` of its own.
    let settled = false
    const finish = (outcome: DirectOutcome): void => {
      if (settled) return
      settled = true
      resume(Effect.succeed(outcome))
    }
    // `setEncoding` puts Node's own `StringDecoder` on the stream, so a
    // multibyte code point split across two chunks decodes once rather than
    // becoming two replacement characters. `layerSpawner` gets that property
    // from `Stream.decodeText`, and the two layers must not disagree.
    child.stdout?.setEncoding("utf8")
    child.stderr?.setEncoding("utf8")
    // Past the ceiling the child is stopped rather than read further: leaving
    // it running would keep filling a buffer nobody will ever look at. The
    // count is of BYTES received, not of decoded characters, so it matches the
    // spawner runner, which counts before it decodes.
    let stdoutBytes = 0
    let stderrBytes = 0
    const bound = (bytes: number): void => {
      if (bytes <= outputLimit) return
      child.kill("SIGKILL")
      finish({ _tag: "TooLarge" })
    }
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk
      stdoutBytes += Buffer.byteLength(chunk, "utf8")
      bound(stdoutBytes)
    })
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk
      stderrBytes += Buffer.byteLength(chunk, "utf8")
      bound(stderrBytes)
    })
    child.on("error", (error: NodeJS.ErrnoException) =>
      finish({ _tag: "SpawnFailed", cause: error, missingBinary: error.code === "ENOENT" }))
    child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) =>
      // The signal is half the termination diagnosis: a killed child has a null
      // exit code, and discarding the signal leaves a silent kill with an empty
      // error message (review finding flows-jj/robustness/2).
      finish({ _tag: "Exited", output: { stdout, stderr, exitCode: exitCode ?? 1, signal } }))
    return Effect.callback<void>((done) => {
      settled = true
      // Close our pipes even if a wrapper left a descendant holding its ends.
      // Await the direct child's close event so cancellation does not return
      // while that child is still alive.
      child.stdout?.destroy()
      child.stderr?.destroy()
      if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
        done(Effect.void)
        return
      }
      child.once("close", () => done(Effect.void))
      child.kill("SIGKILL")
    })
  })
