---
title: "Run an external job"
description: "Start external work once, park between probes, and reattach after a host restart."
sidebar:
  order: 8
---

`ExternalJob.make` composes recorded Start, Status, Collect and Cancel actions
with ordinary flow handoffs and durable timers. The adapter owns the external
worker; a parked Smithers execution owns no worker process scope.

```ts
import { Action, ExternalJob, Flow, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { RemoteChildProcessSpawner, Sandbox } from "@smthrs/sandbox"
import { Effect, Layer, Schema } from "effect"

const Build = ExternalJob.make("build/external", {
  payload: { source: Schema.String },
  handle: Sandbox.JobHandle,
  success: Sandbox.JobResult,
  error: Schema.Union([RemoteChildProcessSpawner.ProviderError, Sandbox.CaptureError]),
  probe: { every: "15 seconds", max: "2 minutes" },
  timeout: "2 hours",
  restarts: 1
})

// The provider adapter supplies create-or-get, observation, collection and
// cancellation. Convert cleanup transport errors to visible defects.
const adapter = Sandbox.job(provider, { command: "make" })
const buildLayer = Build.toLayer({
  ...adapter,
  cancel: (handle, key) => adapter.cancel(handle, key).pipe(Effect.orDie)
})

const Pipeline = Flow.make("build/pipeline", {
  payload: { source: Schema.String },
  success: Sandbox.JobResult,
  error: Build.errorSchema,
  body: Node.capture({ version: "build/pipeline/v1", build: Build._tag }, (payload) => Build.call(payload))
})

const implementations = Layer.mergeAll(buildLayer, Interpreter.layer(Pipeline))
  .pipe(Layer.provideMerge(Action.layerImplementations))
```

Use a retained provider. Supply the runtime and the adapter's services, including durable capture receipt
storage, to that layer. Declare the complete adapter failure union in `error`;
errors are encoded in durable action outcomes.

## Identity and replay

`Build.call` uses the existing child boundary, so each call has its own durable
execution identity. It does not inline the job into its caller. `.child` and
`.execute` also retain the ordinary flow APIs. Two calls with identical payloads
start separate jobs. `.execute` with the same execution id rejoins its lineage.

The initial action journals the enclosing job execution id and start time.
Adapters receive `<execution id>#g1`, then `#g2` for one allowed replacement.
The public payload cannot select an identity or supply a continuation handle.
`start` must atomically create-or-get by that key. Smithers replay alone cannot
make a provider's non-idempotent spawn safe.

Status actions have separate probe keys, while the provider receives the same
job key throughout one generation. Delays double from `probe.every` up to
`probe.max`, and stop at the original timeout deadline. That deadline is carried
through every generation and survives a host restart.

The deadline bounds every provider call, not only the probes. A Start reached
after the deadline, such as an engine retry or a restarted host's replay, never
calls `start`. A `start` or `collect` still running at the deadline is
interrupted; the generation is abandoned or cancelled, and the job fails
`ExternalJobTimedOut`.

## Replacement and cancellation

Status returns `Running`, `Exited` with `exitCode`, or `Lost`. `Exited` calls
`collect`. A collected exit can fail with `ExternalJob.Again` to request a
replacement. Both Lost and Again complete Cancel before a durable backoff and
the next Start. A failed cancellation cannot launch another worker.
`Again` is a dependency fault if it escapes the replacement boundary. A flow's
own `DeadlineExceeded` is a policy fault: its elapsed deadline is terminal.

Exhaustion fails with `ExternalJobLost` (`infra`). Timeout completes Cancel and
fails with `ExternalJobTimedOut` (`dependency`). `restarts: 0`, the default,
permits only the first generation. Adapter infrastructure errors retain their
declared type and use the runtime's repeat-safe retry policy.

`cancel` and `abandon` may fail with the adapter's declared error. Inside a
step the engine retries them as it retries `start`, so a stop the provider
could not record is never journaled as done and a replacement waits for it.

The deadline bounds each provider call, not the engine's retry waits: a
`start` that failed transiently and is retried after the deadline is abandoned
at that next attempt, so its abandonment can lag the deadline by one retry
backoff.

The actual flow scope retains `Flow.withRollback` cancellation. Timer parking,
replay and host release preserve the external worker. Explicit cancellation
cancels it, including a retained parked scope. The rollback is process-local
and has no step to retry in: it asks `cancel` or `abandon` once and logs a
failure by operation and key. Providers still need their retained-machine lease
or reaper after a host dies.

## Hosts that route by tag

`call` runs the job as its own child execution, and each round hands off to
one of two private continuations, `<tag>/launch` and `<tag>/observe`. A host
that finds an execution's flow by its tag, such as a Durable Object per
execution, must list all three: `[...otherFlows, ...Build.flows]`. Otherwise
the child's object refuses the job as an unknown flow and the job never
starts.

## Abandon a key that never returned a handle

A provider can admit a key and then fail to answer `start`: the acknowledgement
is lost, the run is cancelled, or the deadline passes while `start` is in
flight. Without a handle there is nothing to `cancel`. Implement
`abandon(payload, key)` beside `cancel` to stop the work by key.

Abandon runs when the run is cancelled, the deadline passes, or `start` fails
before it returned a handle. The provider must make `abandon` of a key it has
not admitted yet win over a later `start` of that key, because that `start` can
still be in flight. Without `abandon`, such a key is left to the provider.
