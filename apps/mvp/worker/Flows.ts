import type { Flow } from "@smthrs/flow"
import { Context, type Effect, Schema } from "effect"

// Where a remote flow starts (docs/features/remote-flows.md#starting-an-execution). A route that admits a remote flow
// (asking starts `chat/Expire`, `POST /api/repos` starts `repo/Clone`) starts it through `FlowStarter`: a Durable
// Object in ChatApi (worker/ExecutionHost.ts), anything else in a test. No route starts a flow by its name alone:
// every remote flow today is admitted by the route that starts it (docs/features/remote-flows.md#no-remote-door).

/** The execution id already holds a start with another payload. */
export class StartConflict extends Schema.TaggedError<StartConflict>()("@smthrs/mvp/flows/StartConflict", {}) {}

/** The remote host couldn't record the start. */
export class StartUnavailable extends Schema.TaggedError<StartUnavailable>()("@smthrs/mvp/flows/StartUnavailable", {
  errorCode: Schema.String,
}) {}

/**
 * Where a remote execution starts: records the start, and the execution runs from there. `payload` is the flow's
 * payload as its own schema types it; `Flow.Any` can't say so.
 */
export class FlowStarter extends Context.Service<
  FlowStarter,
  {
    readonly start: (
      flow: Flow.Any,
      options: { readonly executionId: string; readonly payload: unknown },
    ) => Effect.Effect<void, StartConflict | StartUnavailable>
  }
>()("@smthrs/mvp/flows/FlowStarter") {}
