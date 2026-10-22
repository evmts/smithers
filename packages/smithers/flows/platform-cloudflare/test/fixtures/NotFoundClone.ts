/**
 * `repo/Clone`'s plan (apps/mvp `worker/flows/RepoClone.ts`) with stand-in
 * steps, on the path a repository that does not exist takes: Inspect answers
 * `failed`, the branch skips Import, Pull, AwaitSync and Index, and Settle
 * records the failure. One alarm drives it from admission to settlement: the
 * drive whose writes a suite counts, the same 35 journal entries production
 * wrote for it.
 */
import { Action, Flow, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import type * as SqlClient from "effect/sql/SqlClient"
import { CloudflareRuntime, type ExecutionObject } from "../../src/index.ts"

const Inspection = Schema.Struct({
  outcome: Schema.Literals(["admitted", "failed"]),
  defaultBranch: Schema.NullOr(Schema.String)
})
type Inspection = typeof Inspection.Type
const Synced = Schema.Struct({ status: Schema.Literals(["ready", "skipped", "unavailable"]) })
const Indexed = Schema.Struct({ files: Schema.NullOr(Schema.Number) })

const request = { id: Schema.String, owner: Schema.String, name: Schema.String }

/** Reads the repository from its forge; here it never exists. */
export const Inspect = Action.make("cloudflare-test/clone/Inspect", { payload: request, success: Inspection })
const Import = Action.make("cloudflare-test/clone/Import", { payload: request, success: Schema.Boolean })
const Pull = Action.make("cloudflare-test/clone/Pull", { payload: { id: Schema.String }, success: Schema.Boolean })
const AwaitSync = Action.make("cloudflare-test/clone/AwaitSync", { payload: { id: Schema.String }, success: Synced })
const Index = Action.make("cloudflare-test/clone/Index", {
  payload: { id: Schema.String, synced: Synced },
  success: Indexed
})
/** Records how the clone ended. */
export const Settle = Action.make("cloudflare-test/clone/Settle", {
  payload: { id: Schema.String, inspection: Inspection, synced: Synced, indexed: Indexed },
  success: Schema.Struct({ status: Schema.Literals(["ready", "failed"]) })
})

const UNAVAILABLE: Inspection = { outcome: "failed", defaultBranch: null }
const SKIPPED = { status: "skipped" } as const
const NOT_INDEXED = { files: null }

/** `repo/Clone`'s body, step for step. */
export const NotFoundClone = Flow.make("cloudflare-test/clone/Clone", {
  payload: request,
  success: Settle.successSchema,
  body: Node.capture(
    {
      inspect: Inspect.name,
      import: Import.name,
      pull: Pull.name,
      await: AwaitSync.name,
      index: Index.name,
      settle: Settle.name
    },
    (input) =>
      Inspect.call(input).pipe(
        Node.catch({ onFailure: Node.capture({ inspection: "unavailable" }, () => Node.succeed(UNAVAILABLE)) }),
        Node.branch({
          if: Node.capture({ admitted: "admitted" }, (inspection: Inspection) => inspection.outcome === "admitted"),
          then: Node.capture({ synced: "ready" }, (inspection) =>
            Import.call(input).pipe(
              Node.andThen(Pull.call({ id: input.id })),
              Node.andThen(AwaitSync.call({ id: input.id })),
              Node.catch({ onFailure: Node.capture({ synced: "unavailable" }, () => Node.succeed(SKIPPED)) }),
              Node.bindPlanned(Node.capture({ index: Index.name, settle: Settle.name }, (synced) =>
                Index.call({ id: input.id, synced }).pipe(
                  Node.catch({ onFailure: Node.capture({ indexed: "none" }, () => Node.succeed(NOT_INDEXED)) }),
                  Node.bindPlanned(Node.capture({ settle: Settle.name }, (indexed) =>
                    Settle.call({ id: input.id, inspection, synced, indexed })))
                )))
            )),
          else: Node.capture({ synced: "skipped" }, (inspection) =>
            Settle.call({ id: input.id, inspection, synced: SKIPPED, indexed: NOT_INDEXED }))
        })
      )
  )
})

const registration = Interpreter.layerWithImplementations(
  NotFoundClone,
  Layer.mergeAll(
    Inspect.toLayer(() => Effect.succeed({ outcome: "failed" as const, defaultBranch: null })),
    Import.toLayer(() => Effect.succeed(true)),
    Pull.toLayer(() => Effect.succeed(true)),
    AwaitSync.toLayer(() => Effect.succeed({ status: "ready" as const })),
    Index.toLayer(() => Effect.succeed({ files: 0 })),
    Settle.toLayer(({ inspection }) =>
      Effect.succeed({ status: inspection.outcome === "admitted" ? "ready" as const : "failed" as const })
    )
  )
).pipe(Layer.provideMerge(Action.layerImplementations))

/** The runtime an alarm builds for {@link NotFoundClone}: one execution, over `database`. */
export const runtime = (options: {
  readonly hostId: string
  readonly database: Layer.Layer<SqlClient.SqlClient>
}) =>
(intent: ExecutionObject.Intent) =>
  CloudflareRuntime.layer({ hostId: options.hostId, executionId: intent.executionId }, registration).pipe(
    Layer.provide(options.database)
  )
