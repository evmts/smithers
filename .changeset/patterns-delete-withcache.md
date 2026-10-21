---
"@smthrs/patterns": major
"@smthrs/flow": patch
"@smthrs/plan": patch
"@smthrs/registry": patch
---

`WithCache` is deleted under the approved flows-as-code design (FLOW-10,
section 7.5). It restated `Action.withCache`. Its `ttlMs` and `scope` annotated
only the flow, so they never reached an ordinary nested call's dispatched
action. Declare the cache policy on the action the engine dispatches.

```ts
// Before
const cached = WithCache.withCache(Search, { ttlMs: 60_000, scope: "shared" })
// After
const Search = Action.withCache(
  Action.make("search", {
    payload: { query: Schema.String },
    success: Schema.String,
    idempotencyKey: ({ query }) => ({ query }),
    implementationVersion: "v1",
    fileBoundary: { readSet: [], writeSet: [], boundaryMode: "hard" }
  }),
  { ttlMs: 60_000, scope: "shared" }
)
```

`WithCache.make`, `Options`, `Scope`, `Policy`, `CachePolicyAnnotation`, and
`policyOf` are also deleted. `Action.withCache`, `CacheEnvironment.withCache`,
and `CachePolicy.annotate` remain the same engine API. Revise an action's
`implementationVersion` or `idempotencyKey` when its meaning changes.
The registry still lowers explicit flow cache annotations onto its dispatched
action.

Library catalog entry: "Make a durable workflow" (`@smthrs/flow`).

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
