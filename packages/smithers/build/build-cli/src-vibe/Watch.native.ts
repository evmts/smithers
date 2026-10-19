// A-2/E-4 (D38) and E-7: `run` hands a Promise to TypeScript callers through
// Effect.runPromiseExit, and `digest` walks the tree with node:fs and node:crypto. Both stay TypeScript, unchanged from
// Watch.ts. The watch loop itself is Watch.vibe's `watching`, passed in as an argument, and
// the loop's variables live in `State` so the Promise boundary reads them after the run.
import { Cause, Effect, Exit } from "effect"
import { createHash } from "node:crypto"
import { lstat, readdir } from "node:fs/promises"
import type { run as Run } from "./Watch.vibe"

type Options = Parameters<typeof Run>[0]

/** Watch.ts `run`'s variables, shared by the cycles, the watcher and this boundary. */
export interface State {
  baseline: string | undefined
  baselineObserved: number
  cycles: number
  exitCode: number
  failure: unknown
  observed: number
  covered: number
}

/** `run`'s Promise boundary, unchanged. */
export const run = async (
  options: Options,
  watching: (options: Options, state: State) => Effect.Effect<void, unknown, never>
) => {
  options.signal?.throwIfAborted()
  const state: State = {
    baseline: undefined,
    baselineObserved: 0,
    cycles: 0,
    exitCode: 0,
    failure: undefined,
    observed: 0,
    covered: 0
  }
  const result = await Effect.runPromiseExit(watching(options, state), { signal: options.signal })
  if (state.failure !== undefined) throw state.failure
  if (Exit.isFailure(result) && !Cause.hasInterruptsOnly(result.cause)) throw Cause.squash(result.cause)
  return { cycles: state.cycles, exitCode: state.exitCode, stopped: options.signal?.aborted ?? false }
}

/**
 * A digest of every relevant path's type, size, modification time and inode,
 * in name order. Entries that vanish or cannot be read mid-walk are skipped.
 */
export const digest = async (root: string, relevant: (path: string) => boolean): Promise<string> => {
  const hash = createHash("sha256")
  const skipped = (cause: unknown) =>
    ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes((cause as NodeJS.ErrnoException).code ?? "")
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory === "" ? root : `${root}/${directory}`, { withFileTypes: true })
      .catch((cause) => {
        if (skipped(cause)) return []
        throw cause
      })
    const paths = entries
      .map((entry) => ({ entry, path: directory === "" ? entry.name : `${directory}/${entry.name}` }))
      .filter(({ path }) => relevant(path))
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
    const stats = await Promise.all(
      paths.map(({ path }) =>
        lstat(`${root}/${path}`, { bigint: true }).catch((cause) => {
          if (skipped(cause)) return undefined
          throw cause
        })
      )
    )
    for (const [index, { entry, path }] of paths.entries()) {
      const stat = stats[index]
      if (stat === undefined) continue
      hash.update(`${path}\0${stat.mode}\0${stat.size}\0${stat.mtimeNs}\0${stat.ino}\n`)
      if (entry.isDirectory()) await visit(path)
    }
  }
  await visit("")
  return hash.digest("hex")
}
