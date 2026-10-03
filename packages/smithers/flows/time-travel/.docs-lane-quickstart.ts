import { Action, DurableDeferred, Flow } from "@smthrs/flow"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

/** A sealed action. Its result is recorded, so replaying it is a cache read. */
const Credit = Action.make({
  name: "quickstart/Credit",
  success: Schema.Number,
  tier: "sealed",
  idempotencyKey: "quickstart/credit/v1",
  execute: Effect.succeed(30)
})

/** The durable wait the run parks at. */
const Settlement = DurableDeferred.make("quickstart/settlement", { success: Schema.String })

/** The step the flow's body names; the wait lives in its implementation. */
const Post = Action.make("quickstart/Post", { payload: {}, success: Schema.String })

const post = () =>
  Effect.gen(function*() {
    const amount = yield* Credit
    const settlement = yield* DurableDeferred.await(Settlement)
    return `${amount}:${settlement}`
  })

const Ledger = Flow.make("quickstart/Ledger", {
  payload: {},
  success: Schema.String,
  body: (payload) => Post.call(payload)
})

import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { StepBoundary, WorkspaceSandbox } from "@smthrs/engine-store"
import { Interpreter } from "@smthrs/flow"
import * as NodeRuntime from "@smthrs/flows/NodeRuntime"
import * as Jj from "@smthrs/jj"
import { Ownership } from "@smthrs/run-store"
import { SqlTimeTravelStore, TimeTravel } from "@smthrs/time-travel"
import * as Layer from "effect/Layer"
import { dirname } from "node:path"

/**
 * A Jujutsu service that records nothing. Replay never calls it; the layer
 * requires it because fork and rewind do.
 */
const stubJj = Layer.succeed(
  Jj.Jj,
  Jj.makeNoop({
    snapshot: () =>
      Effect.succeed({
        commitId: "quickstart-commit" as never,
        changeId: "quickstart-snapshot" as never
      }),
    restore: () => Effect.void,
    diff: () => Effect.succeed(""),
    workspaceAdd: () => Effect.void,
    workspaceForget: () => Effect.void,
    status: () => Effect.succeed("")
  })
)

const durableEngine = (filename: string) =>
  NodeRuntime.layer(
    {
      filename,
      workspaceRoot: dirname(filename),
      owner: { hostId: "quickstart" },
      isAlive: Ownership.sameHostPidProbe
    },
    StepBoundary.layer,
    WorkspaceSandbox.layerFileSystem(),
    Layer.empty
  ).pipe(
    Layer.provideMerge(stubJj),
    Layer.provideMerge(NodeCrypto.layer),
    Layer.provideMerge(NodeFileSystem.layer)
  )

const layer = (filename: string) =>
  Layer.mergeAll(Post.toLayer(post), Interpreter.layer(Ledger)).pipe(
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(TimeTravel.layer),
    Layer.provideMerge(SqlTimeTravelStore.layer),
    Layer.provideMerge(durableEngine(filename))
  )

import { FlowEngine } from "@smthrs/engine"
import { Journal, JournalEvent } from "@smthrs/journal"

export interface Summary {
  readonly entries: number
  readonly frame: number
  readonly attempts: number
}

export const main = (filename: string): Effect.Effect<Summary> =>
  Effect.gen(function*() {
    // Drive the run until it parks at the deferred. It releases ownership on
    // the way out, which is the state fork and rewind both require.
    yield* Ledger.execute({}, { executionId: "ledger-1", discard: true })

    const journal = yield* Journal.Journal
    yield* journal.flush
    const page = yield* journal.entries({ runId: "ledger-1" as JournalEvent.RunId, limit: 200 })
    // The frame to read at: the last sequence this run committed.
    const seq = page.entries.at(-1)?.seq ?? 0

    const timeTravel = yield* TimeTravel
    const attempts = yield* timeTravel.inspect(
      { runId: "ledger-1", frame: { lineageId: FlowEngine.Lineage.root("ledger-1"), seq } },
      {
        initial: 0,
        reduce: (count: number, entry) => entry.eventType === "flows.engine.attempt-started" ? count + 1 : count
      }
    )

    return { entries: page.entries.length, frame: seq, attempts }
  }).pipe(Effect.provide(layer(filename)), Effect.scoped, Effect.orDie)

console.log(await Effect.runPromise(main("./.smithers/quickstart.sqlite")))