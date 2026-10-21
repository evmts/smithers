---
"@smthrs/patterns": major
---

`TryCatchFinally` is deleted under the approved flows-as-code design (FLOW-10,
sections 4.2 and 7.5). It restated `Node.catch` plus `Effect.ensuring` in an
action's handler. Its declared finalizer was skipped on a defect or an
interruption. Recover with `Node.catch` and its `error` schema filter; clean up
in the handler of the action that acquires the resource.

```ts
// Before
const protectedBody = TryCatchFinally.make({ try: Body, catch: Recover, finally: Cleanup })

// After: in the flow body
const protectedBody = Node.catch(Body.call(payload), {
  error: Recoverable,
  onFailure: Node.capture({}, (error) => Recover.call({ error }))
})

// In the action's handler
const layer = Body.toLayer((payload) =>
  Effect.gen(function*() {
    const resource = yield* acquire(payload)
    const release = close(resource)
    return yield* use(resource).pipe(Effect.ensuring(release))
  })
)
```

`Effect.ensuring`, `Effect.onExit`, and `Effect.acquireRelease` run cleanup on
success, failure, defect, and interruption. `TryCatchFinally.run` is also
deleted because executed patterns bypass the journal. `PatternErrorCode` no
longer includes `finalizer_failed`.

Library catalog entry: "Make a durable workflow" (`@smthrs/flow`).

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
