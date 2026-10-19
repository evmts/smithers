// E-7 (EK4402) and A-2/E-4: Detached's launcher is Node process and file
// work (node:child_process, node:fs, node:path, process.*, timers) in async,
// Promise-returning functions, which VibeLang code does not write. Detached.vibe
// keeps every export and calls these bodies, copied verbatim from Detached.ts.
import type { ChildProcess } from "node:child_process"
import { spawn } from "node:child_process"
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, renameSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import type { Launched, Options, Rejected } from "./Detached.vibe"
import { admissionVariable, announcedRunIds, defaultTerminationGraceMs, defaultTimeoutMs } from "./Detached.vibe"
import * as Failure from "./internal/Failure.ts"
import * as Project from "./Project.vibe"

/** The extra multiple of the timeout a still-running child is granted. */
const liveChildGraceMultiple = 4

/** How much of the log tail is reported with a failed launch. */
export const tailBytes = 32 * 1024

/** How often the parent re-reads the log while waiting. */
const pollIntervalMs = 50

/** The body of `Detached.logTail`. */
export const logTail = (file: string, maxBytes: number = tailBytes): string => {
  if (!existsSync(file)) return ""
  let descriptor: number | undefined
  try {
    descriptor = openSync(file, "r")
    const size = fstatSync(descriptor).size
    const length = Math.min(size, Math.max(1, maxBytes))
    const buffer = Buffer.alloc(length)
    readSync(descriptor, buffer, 0, length, Math.max(0, size - length))
    return buffer.toString("utf8")
  } catch {
    return ""
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

/**
 * Reads a log from `offset` to its current end. The bytes are decoded as
 * latin1 so a read that splits a multi-byte character cannot corrupt the
 * ASCII admission line around it.
 */
const readFrom = (file: string, offset: number): { readonly text: string; readonly next: number } => {
  let descriptor: number | undefined
  try {
    descriptor = openSync(file, "r")
    const size = fstatSync(descriptor).size
    if (size <= offset) return { text: "", next: offset }
    const buffer = Buffer.alloc(size - offset)
    const read = readSync(descriptor, buffer, 0, buffer.length, offset)
    return { text: buffer.toString("latin1", 0, read), next: offset + read }
  } catch {
    return { text: "", next: offset }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

/** The longest unterminated line kept between reads; an admission line is far shorter. */
const carryBytes = 4 * 1024

/** Whether a POSIX process group still has a member. */
const processGroupAlive = (pid: number): boolean => {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return (error as { readonly code?: string } | null)?.code !== "ESRCH"
  }
}

const childAlive = (child: ChildProcess): boolean => child.exitCode === null && child.signalCode === null

const waitUntil = async (predicate: () => boolean, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (predicate()) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return false
    await sleep(Math.min(pollIntervalMs, remaining))
  }
  return true
}

const signalGroup = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if ((error as { readonly code?: string } | null)?.code !== "ESRCH") throw error
  }
}

/** SIGTERM, then SIGKILL, aimed at the child's process group. */
const terminateGroup = async (pid: number, grace: number): Promise<boolean> => {
  if (!processGroupAlive(pid)) return true
  try {
    signalGroup(pid, "SIGTERM")
  } catch {
    return false
  }
  if (await waitUntil(() => processGroupAlive(pid), grace)) return true
  try {
    signalGroup(pid, "SIGKILL")
  } catch {
    return false
  }
  return waitUntil(() => processGroupAlive(pid), grace)
}

/**
 * SIGTERM, then SIGKILL, aimed at the child handle alone.
 *
 * The whole containment claim is then about the leader rather than the group,
 * which is exactly what a host without process groups can promise.
 */
const terminateHandle = async (child: ChildProcess, grace: number): Promise<boolean> => {
  if (!childAlive(child)) return true
  try {
    child.kill("SIGTERM")
  } catch {
    return !childAlive(child)
  }
  if (await waitUntil(() => childAlive(child), grace)) return true
  try {
    child.kill("SIGKILL")
  } catch {
    return !childAlive(child)
  }
  return waitUntil(() => childAlive(child), grace)
}

/** The body of `Detached.terminate`.
 *
 * Terminates and reaps a child that never reached admission.
 *
 * On POSIX the group, not just its leader, must disappear before this resolves.
 * A cooperative group gets SIGTERM; a group still present after the grace
 * window gets SIGKILL and another bounded reap window. The boolean is false
 * when the host could not confirm containment, so a caller never reports an
 * orphan-prone launch as successfully terminated.
 *
 * `platform` is the host whose process model the containment is judged against,
 * and it is a parameter for the same reason `@smthrs/flows`'s containment
 * options take one: Windows has no process groups, so the handle is the only
 * thing that can be signalled there, and a host that runs its coverage on POSIX
 * has no other way to exercise what it ships to Windows.
 *
 * @category destructors
 * @since 1.0.0
 */
export const terminate = async (
  child: ChildProcess,
  graceMs: number = defaultTerminationGraceMs,
  platform: NodeJS.Platform = process.platform
): Promise<boolean> => {
  const grace = Number.isFinite(graceMs) ? Math.max(1, Math.trunc(graceMs)) : defaultTerminationGraceMs
  const pid = child.pid
  // A spawn that never became a process. Node reports the failure
  // asynchronously and leaves the handle with no pid, and it sets `exitCode`
  // to -2, so `terminateHandle`'s liveness check reads the handle as already
  // ended and this function used to answer `true`. That is a containment claim
  // for a child the host never reached: the caller renders "was terminated" for
  // something it never had. There is no group to signal and no exit to
  // observe, so the honest answer is that containment was not confirmed.
  if (pid === undefined) return false
  return platform === "win32" ? terminateHandle(child, grace) : terminateGroup(pid, grace)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The body of `Detached.launch`. */
export const launch = async (options: Options): Promise<Launched | Rejected> => {
  options.signal?.throwIfAborted()
  const timeoutMs = Math.max(1, options.timeoutMs ?? defaultTimeoutMs)
  const maxWaitMs = timeoutMs * liveChildGraceMultiple
  const intervalMs = Math.max(1, options.intervalMs ?? pollIntervalMs)
  const nonce = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const directory = Project.logDirectory(options.root)
  mkdirSync(directory, { recursive: true })
  // The run id does not exist until the child is admitted, so the log opens
  // under the nonce and is renamed onto the run id afterwards. On POSIX the
  // child keeps writing through its open descriptor across the rename, so no
  // output is lost and no second file appears.
  const pending = join(directory, `pending-${nonce}.log`)
  const descriptor = openSync(pending, "a")

  let child: ChildProcess
  try {
    child = spawn(
      options.execPath ?? process.execPath,
      [options.entry ?? process.argv[1]!, "flow", "execute", options.payload, ...(options.passthrough ?? [])],
      {
        cwd: options.root,
        detached: true,
        stdio: ["ignore", descriptor, descriptor],
        env: { ...(options.environment ?? process.env), [admissionVariable]: nonce }
      }
    )
  } finally {
    closeSync(descriptor)
  }
  // Keep the child referenced until admission or cleanup completes. An
  // interrupted CLI must remain alive long enough to escalate and reap it.
  let handedOff = false
  let termination: Promise<boolean> | undefined
  const cleanup = () => termination ??= terminate(child, options.terminationGraceMs)
  let wake = () => {}
  const onAbort = () => wake()
  let spawnError: Error | undefined
  const onError = (error: Error) => {
    spawnError = error
    wake()
  }
  child.on("error", onError)
  options.signal?.addEventListener("abort", onAbort, { once: true })

  const startedAt = Date.now()
  let notified = false
  // The log is scanned forward from the last offset, not re-read as a tail:
  // a chatty run can push the honest line out of any bounded tail between
  // two polls, and a forged line written after it must not be all that is
  // left to see. Refused ids stay refused; the store, not the log, decides.
  let scanned = 0
  let carry = ""
  const candidates: Array<string> = []
  const refused = new Set<string>()
  let lastVerifyError: unknown
  const refusal = (): string => {
    const named = [...refused].slice(0, 8).join(", ")
    const refusedText = refused.size === 0
      ? ""
      : ` The engine announced ${named}${
        refused.size > 8 ? ` and ${refused.size - 8} more` : ""
      }, but the control store holds no run for this launch's plan under ${
        refused.size === 1 ? "that id" : "those ids"
      }.`
    const errorText = lastVerifyError === undefined
      ? ""
      : ` The control store could not confirm admission: ${
        Failure.operatorSentence(lastVerifyError).replace(/\.$/, "")
      }.`
    return `${refusedText}${errorText}`
  }
  const nominate = (final: boolean) => {
    const read = readFrom(pending, scanned)
    scanned = read.next
    const text = carry + read.text
    // Only whole lines are parsed until the child is gone, so an id split
    // across two reads is never nominated by its prefix.
    const cut = final ? text.length : text.lastIndexOf("\n") + 1
    carry = text.slice(cut).slice(-carryBytes)
    for (const runId of announcedRunIds(text.slice(0, cut), nonce)) {
      if (!candidates.includes(runId)) candidates.push(runId)
    }
  }
  const confirmed = async (final: boolean): Promise<string | undefined> => {
    nominate(final)
    for (const runId of candidates) {
      if (refused.has(runId)) continue
      try {
        if (await options.admission(runId)) return runId
        refused.add(runId)
      } catch (error) {
        lastVerifyError = error
      }
    }
    return undefined
  }
  try {
    for (;;) {
      if (options.signal?.aborted) {
        return { reason: "Detached launch interrupted before admission.", tail: logTail(pending), logFile: pending }
      }
      if (spawnError !== undefined) throw spawnError
      const exited = child.exitCode !== null || child.signalCode !== null
      const runId = await confirmed(exited)
      // The readiness proof wins over a later child exit: once the run row is
      // durable, a child that dies afterwards is the stale-run sweep's
      // problem, not the launcher's.
      if (runId !== undefined) {
        const file = Project.logFile(options.root, runId)
        // A run id can arrive at a path that already holds a log — a resumed
        // run keeps its id, and so does anything that replays one. Renaming
        // straight over it destroyed the earlier run's only record. Move it
        // aside under this launch's nonce instead: the receipt still names the
        // canonical path, and nothing an operator may still be reading is
        // deleted to get there.
        if (existsSync(file)) renameSync(file, join(directory, `${runId}.superseded-${nonce}.log`))
        renameSync(pending, file)
        handedOff = true
        child.unref()
        return { runId, logFile: file, pid: child.pid }
      }
      const tail = logTail(pending)
      if (exited) {
        const status = child.signalCode === null ? `exit ${child.exitCode}` : `signal ${child.signalCode}`
        const loadTimeout = /["']?code["']?\s*:\s*["']load_timeout["']/.test(tail) ||
          tail.includes("(load_timeout; SMITHERS_FLOW_LOAD_TIMEOUT_MS catalog limit)")
        const loadDuration = /timed out after ([\d.]+)ms/.exec(tail)?.[1]
        const loadLimit = loadTimeout
          ? ` The flow catalog load limit (SMITHERS_FLOW_LOAD_TIMEOUT_MS${
            loadDuration === undefined ? "" : `, ${loadDuration}ms`
          }) was reported before admission.`
          : ""
        return {
          reason: `Detached engine exited before admission (${status}).${loadLimit}${refusal()}`,
          tail,
          logFile: pending
        }
      }
      const elapsedMs = Date.now() - startedAt
      if (elapsedMs >= maxWaitMs) {
        const terminated = await cleanup()
        return {
          reason: `Detached engine did not reach admission within ${maxWaitMs}ms. The engine process (pid ${
            child.pid ?? "unknown"
          }) was still alive and ${
            terminated ? "was terminated" : "could not be confirmed terminated"
          }.${refusal()} Admission limit: SMITHERS_DETACHED_ADMISSION_TIMEOUT_MS (${timeoutMs}ms, ${maxWaitMs}ms with live-child grace). Set SMITHERS_DETACHED_ADMISSION_TIMEOUT_MS to raise the window.`,
          tail,
          logFile: pending
        }
      }
      if (elapsedMs >= timeoutMs && !notified) {
        notified = true
        const notify = options.onSlowBoot ??
          ((line: string) => {
            process.stderr.write(`${line}\n`)
          })
        notify(
          `smthrs: detached engine (pid ${child.pid ?? "unknown"}) is still booting after ${
            Math.round(elapsedMs / 1000)
          }s; waiting up to ${Math.round(maxWaitMs / 1000)}s.`
        )
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(intervalMs, maxWaitMs - elapsedMs))
        wake = () => {
          clearTimeout(timer)
          resolve()
        }
        // onSlowBoot can synchronously abort the launch before this wait.
        if (options.signal?.aborted) wake()
      })
    }
  } catch (error) {
    return {
      reason: `Detached launch failed before admission: ${Failure.operatorSentence(error)}`,
      tail: logTail(pending),
      logFile: pending
    }
  } finally {
    options.signal?.removeEventListener("abort", onAbort)
    wake()
    if (!handedOff) await cleanup()
    child.removeListener("error", onError)
  }
}

/** The body of `Detached.discard`. */
export const discard = (rejected: Rejected): void => {
  try {
    unlinkSync(rejected.logFile)
  } catch {
    // A log that is already gone needs no cleanup.
  }
}

