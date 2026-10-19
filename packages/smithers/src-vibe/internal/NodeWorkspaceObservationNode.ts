// E-7 (EK4402): node:fs, node:fs/promises, node:crypto, process.pid and timers
// are platform APIs that VibeLang code does not call directly, and async code
// stays in a boundary (A-2/E-5). NodeWorkspaceObservation.vibe keeps the Effect
// structure; the directory listing, the per-entry lstat and the fs.watch feed
// with its fences run here, exactly as NodeWorkspaceObservation.ts runs them.
import type * as WorkspaceObservation from "@smthrs/agent/WorkspaceObservation"
import { Option } from "effect"
import type * as PlatformError from "effect/PlatformError"
import { randomUUID } from "node:crypto"
import { type Dirent, type FSWatcher, rmSync, watch } from "node:fs"
import { lstat, readdir, rm, writeFile } from "node:fs/promises"

/** NodeWorkspaceObservation.vibe's `platformError`. */
export type Failure = (method: string, path: string, error: unknown) => PlatformError.PlatformError

const measure = async (
  directory: string,
  entry: Dirent,
  platformError: Failure
): Promise<WorkspaceObservation.Measured> => {
  if (entry.isDirectory()) return { _tag: "Directory" }
  if (!entry.isFile()) return { _tag: "Skipped" }
  const path = `${directory}/${entry.name}`
  try {
    // `bigint`, as Effect's Node `FileSystem` asks: its millisecond mtime is
    // truncated from nanoseconds, and the default float one can round up. A
    // run journaled on one host and resumed on the other must read the same
    // tree as the same digest.
    const info = await lstat(path, { bigint: true })
    // Replaced by a link or a directory between the listing and the lstat.
    if (!info.isFile()) return { _tag: "Skipped" }
    return { _tag: "File", size: Number(info.size), modified: info.mtime.getTime() }
  } catch (error) {
    return { _tag: "Failed", method: "stat", cause: platformError("stat", path, error) }
  }
}

/** Lists one directory with its entry types and measures its kept files together. */
export const list = async (directory: string, keep: (name: string) => boolean, platformError: Failure) => {
  const listed = (await readdir(directory, { withFileTypes: true })).filter((entry) => keep(entry.name))
  return Promise.all(
    listed.map(async (entry) => ({ name: entry.name, measured: await measure(directory, entry, platformError) }))
  )
}

/** The first pruned directory other than node_modules under `base`, or undefined. */
export const fenceHome = async (base: string, prune: ReadonlyArray<string>): Promise<string | undefined> => {
  for (const name of prune) {
    // Invocation permits only pinned library links here. An observer's
    // transient fence would make an otherwise valid closure refuse.
    if (name === "node_modules") continue
    const info = await lstat(`${base}/${name}`).catch(() => undefined)
    if (info?.isDirectory()) return name
  }
  return undefined
}

/** The watch, its count and its fences over one root. */
export interface Feed {
  readonly open: () => FSWatcher | undefined
  readonly close: (watcher: FSWatcher | undefined) => void
  readonly start: () => () => Promise<Option.Option<number>>
  readonly delivered: () => Option.Option<number>
}

/** The change feed's state, exactly as NodeWorkspaceObservation.ts keeps it in `changes`. */
export const feed = (
  base: string,
  home: string,
  skipped: (relative: string) => boolean,
  fencePrefix: string,
  fenceTimeoutMillis: number
): Feed => {
  let generation = 0
  let broken = false
  const waiters = new Map<string, (arrived: boolean) => void>()
  // Fence files not yet removed: each fence removes its own, and a close
  // removes those still in flight.
  const outstanding = new Set<string>()
  const fail = (): void => {
    broken = true
    for (const arrive of waiters.values()) arrive(false)
    waiters.clear()
  }
  const open = (): FSWatcher | undefined => {
    try {
      return watch(base, { recursive: true, persistent: false }, (_event, filename) => {
        const relative = filename === null ? undefined : String(filename).replaceAll("\\", "/")
        if (relative !== undefined) {
          const arrive = waiters.get(relative)
          if (arrive !== undefined) {
            waiters.delete(relative)
            return arrive(true)
          }
          if (relative.startsWith(`${home}/${fencePrefix}`) || skipped(relative)) return
        }
        generation++
      }).on("error", fail)
    } catch {
      return undefined
    }
  }
  const close = (watcher: FSWatcher | undefined): void => {
    watcher?.close()
    fail()
    for (const path of outstanding) rmSync(path, { force: true })
  }
  const start = () => {
    const nonce = `${process.pid}-${randomUUID()}`
    let fences = 0
    const fence = async (): Promise<Option.Option<number>> => {
      if (broken) return Option.none()
      const relative = `${home}/${fencePrefix}${nonce}-${fences++}`
      const path = `${base}/${relative}`
      outstanding.add(path)
      let timer: ReturnType<typeof setTimeout> | undefined
      const arrived = new Promise<boolean>((resolve) => {
        waiters.set(relative, resolve)
        timer = setTimeout(() => {
          waiters.delete(relative)
          resolve(false)
        }, fenceTimeoutMillis)
        // A fence never holds the process open.
        timer.unref()
      })
      if (!(await writeFile(path, "").then(() => true, () => false))) {
        waiters.get(relative)?.(false)
        waiters.delete(relative)
      }
      const vouched = await arrived
      clearTimeout(timer)
      // Also after a close, whose sweep may have run before this write landed.
      await rm(path, { force: true }).catch(() => undefined)
      outstanding.delete(path)
      return vouched && !broken ? Option.some(generation) : Option.none()
    }
    void fence()
    return fence
  }
  return { open, close, start, delivered: () => broken ? Option.none() : Option.some(generation) }
}
