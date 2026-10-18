---
title: "Troubleshooting"
description: "Every Retrying failure an alarm reports, the other states an execution can stall in, and the change that resolves each."
---

## An alarm keeps returning `Retrying`

The `cloudflare.execution.alarm` line and span carry the failure's tag as
`error.type`, and the attempt count as `smithers.execution.attempt`. The alarm
backs off from one second, doubling, to five minutes, and never gives up.

| `error.type`                              | Cause                                                                                                | Resolution                                                                                                                                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@smthrs/platform-cloudflare/UnknownFlow` | The stored intent names a flow that is not in `alarm`'s `flows`.                                     | Add the flow to `flows`. A child or next round runs on an object of the same class, so list every flow an execution may start or hand off to. A deploy that removed one leaves its executions retrying until one restores it. |
| `@smthrs/engine/FlowNotRegistered`        | The flow is in `flows`, but the runtime's registration does not register it.                         | Register it in the layer passed to `CloudflareRuntime.layer`.                                                                                                                                                                 |
| `@smthrs/platform-cloudflare/Undriven`    | The runtime would not claim the execution, or what it waits on came due during the drive.            | Build the runtime with `executionId: intent.executionId`. A wait that came due resolves on the next alarm.                                                                                                                    |
| `SchemaError`                             | The stored payload no longer decodes with the flow's payload schema, or the intent is not an intent. | Keep the payload schema able to decode payloads already stored, or settle those executions before the change ships.                                                                                                           |
| `SqlError` or another database tag        | The database was unreachable or refused a statement while the runtime was built.                     | Check the Hyperdrive origin and the schema's privileges. The alarm resumes the run once the database answers.                                                                                                                 |
| The router's own error tag                | A `router.start` or `router.wake` call failed: the other object refused it or could not be reached.  | Check the router reaches the class's own namespace by execution id. The next alarm routes the same executions again.                                                                                                          |

## The flow settled as failed after a database outage

A connection lost while the engine records a step's result fails the run
today: the engine records the database failure as the step's outcome, and the
alarm then reads a settled run. The alarm retries only failures that leave the
run unsettled.

## The flow settled as failed with `plan_changed`

The engine logs `InterpreterError` with code `plan_changed` when the plan an
incarnation rebuilds differs from the one recorded. Each alarm can run in a new
isolate, so a flow's callbacks need stable identity. Register the flow with
`Interpreter.layerWithImplementations` and write its body with `Node.capture`,
capturing every value the callback reads.

## The execution is `Parked` with `wakeAtMs: null` and never resumes

The run waits on an event, such as a `DurableDeferred` or a person, with no
timer. Nothing in the object will wake it. Whoever completes the deferred must
also call the object's `wake`, through an RPC method on the object that calls
`ExecutionObject.wake`.

A parent waiting on a child is woken by the child's own alarm when the child
settles. When it is not, find the child's run: one still `pending` was never
started on its object, so the parent's routing failed (see `error.type` on
the parent's alarm); one settled whose parent is still parked means the
child's alarm could not reach the parent's object. Either object's next alarm
routes again, so calling `wake` on it resolves both.

## A cancelled execution keeps running

A cancellation is recorded in the store, and an object only reads it when its
alarm fires. Call `wake` on the object after cancelling. Its alarm closes the
run and wakes each linked child the cancellation reached.

## `start` fails with `IntentConflict`

The object already holds an intent for this execution id with another payload or
flow. An execution id names one run: give a new request a new id.

## A step ran twice

A step interrupted by a reset, an eviction or a crash runs again in the next
incarnation; steps that settled before it replay from the journal. Make every
step's effects idempotent, and key any external call so a repeat is harmless.

## A step fails with `unsupported_boundary`, or a file or process call fails

The step declares a file boundary, reads a file or starts a process. A Worker
has none of them: `FileSystem` refuses with `PermissionDenied`,
`ChildProcessSpawner` with `NotFound`, and `Jj` with `not_installed`. Run that
work on a sandbox host from `@smthrs/sandbox`.

## `EdgeCache` misses what an earlier request stored

The Workers cache is per data center and may evict any entry, so a request
served elsewhere, or after an eviction, misses and reads the source again. The
dashboard editor and Playground previews ignore every Cache API call. A layer
with a `name` reads only its named cache, never `caches.default`. Count
`immutable_cache_requests` by `outcome` to see the hit rate.

## `EdgeCache.layer` fails with `unavailable`

The runtime has no `caches` global, or the layer was given no `name` and the
runtime's `caches` has no `default`, as in a browser. In Node, inject a
`CacheStorage` through `options.caches`, or use `ImmutableCache.layerMemory`.
