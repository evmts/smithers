// A-2/E-4 (D38): `workspaceFor` and `canExecute` are async runner boundaries
// that return Promises to TypeScript callers through Effect.runPromise, so they
// stay TypeScript. E-7 (EK4402): node:path's `resolve` is a platform call.
// Workspace.vibe builds the routing program these run, and binds its exports
// to them; the bodies are Workspace.ts's.
import { NodeServices } from "@effect/platform-node"
import { Effect, type Scope } from "effect"
import { resolve } from "node:path"
import * as DatabaseLocation from "../internal/DatabaseLocation.ts"
import { executionDatabasePath } from "../internal/ExecutionDatabasePath.ts"

/** Workspace.vibe's routing program for one project root. */
export type Routing = (root: string) => Effect.Effect<
  {
    readonly workspaceFor: (runId: string) => Effect.Effect<string | undefined, unknown>
    readonly canExecute: (workspace: string, runId: string) => Effect.Effect<boolean, unknown>
  },
  unknown,
  Scope.Scope | NodeServices.NodeServices
>

/** Workspace.ts's `workspaceFor`, over Workspace.vibe's routing. */
export const workspaceFor = async (root: string, runId: string, routing: Routing): Promise<string | undefined> => {
  if (!DatabaseLocation.exists(executionDatabasePath(root))) return resolve(root)
  return Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      return yield* (yield* routing(root)).workspaceFor(runId)
    })).pipe(Effect.provide(NodeServices.layer))
  )
}

/** Workspace.ts's `canExecute`, over Workspace.vibe's routing. */
export const canExecute = async (
  root: string,
  workspace: string,
  runId: string,
  routing: Routing
): Promise<boolean> => {
  if (!DatabaseLocation.exists(executionDatabasePath(root))) return resolve(root) === resolve(workspace)
  return Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      return yield* (yield* routing(root)).canExecute(workspace, runId)
    })).pipe(Effect.provide(NodeServices.layer))
  )
}
