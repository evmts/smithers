// E-7 (EK4402): the Node platform calls PackageRunner.vibe makes: node:path, node:fs,
// node:fs/promises, node:crypto and process, one wrapper each, named as PackageRunner.ts names
// the modules, so each call reads as it does there.
// S19-30: `joined`'s Effect.callback returns an interrupt finalizer that waits for the
// Promise to settle; VibeLang's `callback` hatch drops a finalizer that waits, so `joined`
// stays TypeScript, unchanged.
// A-2/E-4 (D38): `execute`, the Git.Commit gate runner and the commit message composer hand
// Promises to TypeScript callers through Effect.runPromiseExit, runner boundaries.
// S3-1: `restoreSuspended` keeps `restore(Effect.suspend(() => body(scratch)))` in TypeScript,
// so no by-name generator frame sits inside the restored region.
import type * as Target from "@smthrs/targets/Target"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { randomUUID as nodeRandomUUID } from "node:crypto"
import * as NodeFsModule from "node:fs"
import * as FsModule from "node:fs/promises"
import * as NodePathModule from "node:path"
import * as Diagnostic from "../Diagnostic.vibe"
import type * as Executor from "../Executor.vibe"
import type * as GitCommit from "../GitCommit.vibe"
import type { ExecuteOptions, PackagePlan } from "./PackageOptions.vibe"
import { executeEffect } from "./PackageRunner.vibe"

/** Promise-only I/O must settle its cleanup before its Effect releases ownership. */
export const joined = <A>(run: (signal: AbortSignal) => Promise<A>): Effect.Effect<A, unknown> =>
  Effect.callback((resume, signal) => {
    const pending = run(signal)
    pending.then((value) => resume(Effect.succeed(value)), (cause) => resume(Effect.fail(cause)))
    return Effect.promise(() => pending.then(() => undefined, () => undefined))
  })

/** The node:fs/promises calls, unchanged. */
export const Fs = {
  realpath: (path: string) => FsModule.realpath(path),
  mkdir: (path: string, options: { readonly recursive: true }) => FsModule.mkdir(path, options),
  writeFile: (path: string, data: string, encoding: "utf8") => FsModule.writeFile(path, data, encoding),
  readFile: (path: string, encoding: "utf8") => FsModule.readFile(path, encoding),
  stat: (path: string) => FsModule.stat(path),
  lstat: (path: string) => FsModule.lstat(path),
  rm: (path: string, options: { readonly recursive?: boolean; readonly force?: boolean }) => FsModule.rm(path, options),
  chmod: (path: string, mode: number) => FsModule.chmod(path, mode),
  readdir: (path: string) => FsModule.readdir(path)
}

/** `JSON.parse(await Fs.readFile(path, "utf8"))`: a rejection or a parse error rejects. */
export const readJson = async (path: string): Promise<unknown> => JSON.parse(await FsModule.readFile(path, "utf8"))

/** The node:fs calls, unchanged. */
export const NodeFs = {
  realpathSync: (path: string): string => NodeFsModule.realpathSync(path),
  existsSync: (path: string): boolean => NodeFsModule.existsSync(path)
}

/** The node:path calls, unchanged. */
export const NodePath = {
  join: (...paths: Array<string>): string => NodePathModule.join(...paths),
  normalize: (path: string): string => NodePathModule.normalize(path),
  dirname: (path: string): string => NodePathModule.dirname(path),
  basename: (path: string): string => NodePathModule.basename(path),
  relative: (from: string, to: string): string => NodePathModule.relative(from, to),
  isAbsolute: (path: string): boolean => NodePathModule.isAbsolute(path),
  delimiter: NodePathModule.delimiter,
  sep: NodePathModule.sep,
  posix: {
    dirname: (path: string): string => NodePathModule.posix.dirname(path),
    join: (...paths: Array<string>): string => NodePathModule.posix.join(...paths)
  }
}

/** `randomUUID()` from node:crypto. */
export const randomUUID = (): string => nodeRandomUUID()

/** `process.env`. */
export const processEnv = (): NodeJS.ProcessEnv => process.env

/** Writes to this process's own stdout or stderr pipe. */
export const writeProcess = (stream: "stdout" | "stderr", text: string): void =>
  void (stream === "stdout" ? process.stdout : process.stderr).write(text)

/** `restore(Effect.suspend(() => body(scratch)))`, as PackageRunner.ts `inScratch` writes it. */
export const restoreSuspended = <A, E, R>(
  restore: <A1, E1, R1>(effect: Effect.Effect<A1, E1, R1>) => Effect.Effect<A1, E1, R1>,
  body: (scratch: string) => Effect.Effect<A, E, R>,
  scratch: string
): Effect.Effect<A, E, R> => restore(Effect.suspend(() => body(scratch)))

/** The gates' program for one commit candidate: its failures and the paths it escaped through. */
type CommitGates = (
  gates: ReadonlyArray<Target.AnyTarget>,
  candidate: GitCommit.CandidateTree
) => Effect.Effect<{
  readonly outcome: ReadonlyArray<GitCommit.GateFailure>
  readonly escaped: ReadonlyArray<string>
}, unknown>

/** PackageRunner.ts `commitGateRunner`'s Promise boundary, unchanged. */
export const commitGateRunner = (
  label: string,
  signal: AbortSignal | undefined,
  program: CommitGates
): GitCommit.GateRunner => ({
  run: async (gates, candidate) => {
    if (gates.length === 0) return []
    const exit = await Effect.runPromiseExit(program(gates, candidate), { signal })
    if (Exit.isFailure(exit)) {
      throw new Error(`commit gates could not run: ${Diagnostic.describe(Cause.squash(exit.cause))}`)
    }
    const { outcome, escaped } = exit.value
    if (escaped.length > 0) {
      return [
        ...outcome,
        {
          target: label,
          message: `a gate touched the real tree through a symlink (reverted): ${escaped.join(", ")}`
        }
      ]
    }
    return outcome
  }
})

/** The composition program for one staged diff. */
type Compose = (agent: string, stagedDiff: string) => Effect.Effect<string, unknown>

/** PackageRunner.ts `agentMessageComposer`'s Promise boundary, unchanged. */
export const agentMessageComposer = (signal: AbortSignal | undefined, program: Compose): GitCommit.AgentMessage => ({
  compose: async ({ agent, stagedDiff }) => {
    const exit = await Effect.runPromiseExit(program(agent, stagedDiff), { signal })
    if (Exit.isFailure(exit)) {
      throw new Error(`agent message composition failed: ${Diagnostic.describe(Cause.squash(exit.cause))}`)
    }
    return exit.value
  }
})

/** PackageRunner.ts `execute`, unchanged. */
export const execute = (planned: PackagePlan, options: ExecuteOptions): Promise<Executor.Summary> =>
  Effect.runPromiseExit(executeEffect(planned, options), { signal: options.signal }).then((exit) => {
    if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
    return exit.value
  })
