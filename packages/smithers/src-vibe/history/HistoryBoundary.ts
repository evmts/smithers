// A-2/E-4 (D38): History.ts's exported operations are async functions that run
// their programs and hand TypeScript callers a Promise; VibeLang has no async or
// await outside a hatch (EK1003). `runEffect` is History.ts's own runner,
// verbatim; `mutate` and `prepare` keep their async bodies here, verbatim, and
// take the module's private programs as arguments, because a hatch cannot import
// the private names of the .vibe module that rebinds it.
// E-7 (EK4402): node:fs and node:path are platform APIs that VibeLang code does
// not call directly.
import { Cause, Effect, Exit, type Schema } from "effect"
import { existsSync as nodeExistsSync, mkdirSync } from "node:fs"
import { join as nodeJoin } from "node:path"
import type * as CliError from "../CliError.vibe"
import type { Options } from "./History.vibe"
import * as Workspace from "./Workspace.vibe"

const runEffect = async <A, E>(effect: Effect.Effect<A, E>, signal?: AbortSignal): Promise<A> => {
  const exit = await Effect.runPromiseExit(effect, { signal })
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause)
  return exit.value
}

/** Runs a program for an async TypeScript caller, as `async () => runEffect(program(), signal)`. */
export const runThunk = async <A, E>(program: () => Effect.Effect<A, E>, signal?: AbortSignal): Promise<A> =>
  runEffect(program(), signal)

/** An async body, as `async () => body()`. */
export const promised = async <A>(body: () => A | Promise<A>): Promise<A> => body()

/** `path.join`. */
export const join = (...parts: ReadonlyArray<string>): string => nodeJoin(...parts)

/** `fs.existsSync`. */
export const existsSync = (path: string): boolean => nodeExistsSync(path)

/** `mkdirSync(path, { recursive: true })`. */
export const makeDirectory = (path: string): void => {
  mkdirSync(path, { recursive: true })
}

type Refused = (fault: CliError.Fault, code: string, message: string) => CliError.Refused

/** `mutate`, given the module's read, refusal, input planning and transaction. */
export const makeMutate = <Observed extends { readonly executionFlow?: string | undefined }, Edited, A>(deps: {
  readonly read: (root: string, runId: string, options: Options, replay: boolean, signal?: AbortSignal) => Promise<Observed>
  readonly refused: Refused
  readonly planInput: (
    root: string,
    runId: string,
    input: Schema.Json,
    modules: Options["modules"]
  ) => Effect.Effect<Edited, unknown>
  readonly mutation: (
    root: string,
    runId: string,
    options: Options,
    operation: "fork" | "rewind",
    observed: Observed,
    workspace: string,
    edited: Edited | undefined
  ) => Effect.Effect<A, unknown>
}) =>
async (
  root: string,
  runId: string,
  options: Options,
  operation: "fork" | "rewind",
  signal?: AbortSignal
) => {
  const { refused } = deps
  const observed = await deps.read(root, runId, options, false, signal)
  if (operation === "fork" && observed.executionFlow !== "agent/run") {
    throw refused(
      "user",
      "history_unsupported_run",
      `Run ${runId} is not a public agent flow; use the TimeTravel API for standalone engine forks`
    )
  }
  const workspace = await Workspace.workspaceFor(root, runId)
  if (workspace === undefined) {
    throw refused("user", "fork_unavailable", `Fork ${runId} needs history reconciliation before it can be used`)
  }
  const edited = operation === "fork" && options.input !== undefined
    ? await runEffect(deps.planInput(root, runId, options.input, options.modules), signal)
    : undefined
  return runEffect(deps.mutation(root, runId, options, operation, observed, workspace, edited), signal)
}

/** `prepare`, given the module's reconciliation and refusal. */
export const makePrepare = (deps: {
  readonly reconcile: (root: string) => Promise<void>
  readonly refused: Refused
}) =>
async (root: string, runId: string): Promise<{ readonly executionRoot: string }> => {
  const { refused } = deps
  await deps.reconcile(root)
  const workspace = await Workspace.workspaceFor(root, runId)
  if (workspace === undefined) {
    throw refused("user", "fork_unavailable", `Fork ${runId} has not been linked to its workspace`)
  }
  if (!nodeExistsSync(workspace)) throw refused("user", "fork_unavailable", `Run workspace no longer exists: ${workspace}`)
  return { executionRoot: workspace }
}
