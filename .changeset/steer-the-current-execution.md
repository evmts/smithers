---
"@smthrs/harness": minor
"@smthrs/agent": minor
"@smthrs/notifications": minor
"@smthrs/control": patch
---

A flow host can now steer the agent action it runs: a person's message reaches
the running execution's agent at its next turn boundary.

- `@smthrs/harness`: `Notifications.layerForExecution()` provides a
  `Steering.Source` over the durable `NotificationQueue` that names its run at
  each read and drain, from the current `FlowRuntime.FlowInstance`, and keys
  each drain by the agent session draining. Outside a flow execution it fails
  `engine_failed`. `Steering.BoundaryInput` gains an optional `session`, which
  `CellTurn` fills at every boundary it drains.
- `@smthrs/agent`: `Agent.layerSandbox` and `Agent.layerSandboxWithVariant`
  provide the QuickJS sandbox without the empty steering source of
  `layerDefaults`, so a host supplies its own.
- `@smthrs/notifications`: `Notification.humanSteer({ runId, id, actor, payload,
  attribution? })` builds a person's steer to a run's own lineage.
- `@smthrs/control`: `Control.steer` builds its notification with
  `Notification.humanSteer`; what it admits is unchanged.

```ts
const implement = Implement.layer.pipe(
  Layer.provide(Layer.mergeAll(Agent.layerSandbox, Notifications.layerForExecution())),
  Layer.provide(NotificationQueue.layer) // over the engine's Journal
)
yield* queue.admit(executionId, Notification.humanSteer({
  runId: executionId,
  id: messageId,
  actor: "person:ben",
  payload: SteerPayload.encode({ kind: "Message", body: "Use tabs" })
}))
```
