---
title: "Diff two plans"
description: "Compare a re-plan against the plan before it: what the verdict is, how a re-key is attributed to the field that caused it, why node ids are positional, and why the report is in no digest."
sidebar:
  order: 5
---

"What is different about this run" is a set comparison, not archaeology.
`PlanDiff.diff` is that comparison as a value.

## Before you start

The examples run with `node <file>.ts` on Node.js 26.4.0 or later and need no
engine, database, or jj. Compiling a plan needs Effect's `Crypto` service, which
`@effect/platform-node` supplies. In a project that installed `@smthrs/flows`,
add this package and `@smthrs/flow` at the version of `@smthrs/flows` you have,
plus the platform package:

```bash
npm install @smthrs/plan@1.0.0-rc.6 @smthrs/flow@1.0.0-rc.6 @effect/platform-node
```

The outputs below are real output from 1.0.0-rc.6.

## Compare a re-plan

Create `diff.ts`. It compiles the two drafts from
[Compile drafts into a plan](./compile-a-plan.md), edits one field of one
draft's body, compiles again, and compares:

```ts
import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import * as KeyMaterial from "@smthrs/plan/KeyMaterial"
import * as Plan from "@smthrs/plan/Plan"
import * as PlanDiff from "@smthrs/plan/PlanDiff"
import * as Effect from "effect/Effect"

const readPr: Plan.NodeDraft = {
  id: "read-pr",
  material: {
    version: KeyMaterial.version,
    kind: "sealed",
    body: { action: "read-pr", pr: 4821 },
    inputs: [],
    layers: [],
    capabilities: ["net:get"]
  },
  effects: { reads: [], writes: ["pr.json"], boundaryMode: "hard" }
}

const runTests: Plan.NodeDraft = {
  id: "run-tests",
  material: {
    version: KeyMaterial.version,
    kind: "sealed",
    body: { action: "run-tests" },
    inputs: [{ _tag: "Ref", from: "read-pr", path: [] }],
    layers: [],
    capabilities: []
  },
  effects: { reads: ["pr.json"], writes: ["report.json"], boundaryMode: "hard" }
}

const compile = (nodes: ReadonlyArray<Plan.NodeDraft>) =>
  Plan.compile({ planId: "review-4821", flow: "example/Review", nodes })

export const compare = Effect.gen(function*() {
  const before = yield* compile([readPr, runTests])
  const after = yield* compile([
    readPr,
    { ...runTests, material: { ...runTests.material, body: { action: "run-tests", jobs: 4 } } }
  ])
  const changes: PlanDiff.PlanDiff = PlanDiff.diff(before, after)
  return changes.rekeyed.map((entry) => `${entry.id}: ${entry.changed.join(", ")}`)
}).pipe(Effect.provide(NodeCrypto.layer))

console.log(await Effect.runPromise(compare))
```

```bash
node diff.ts
```

```text
[ 'run-tests: body' ]
```

`compare` answers `["run-tests: body"]`. The edit moved one field of one node's
body, so that node re-keyed and the report says which field did it.

## The verdict is the key

Two nodes with the same id and the same key are the same step. Nothing else
needs saying, and `diff` says nothing else. Four lists come back:

| Field       | Contents                                                                 |
| ----------- | ------------------------------------------------------------------------ |
| `added`     | Node ids present in `next` and absent from `previous`.                   |
| `removed`   | Node ids present in `previous` and absent from `next`.                   |
| `rekeyed`   | Nodes present in both whose key moved, with `from`, `to`, and `changed`. |
| `unchanged` | Node ids present in both with the same key.                              |

## The attribution is for a human

`Rekeyed.changed` is a list of field labels: `["body", "input[1]"]`. It is
derived by comparing declarations field by field, and it is deliberately part of
no digest. Changing how the report reads can never change what a plan hashes to.

The labels mirror the hashed declaration: the effect tier `kind`, the fields
the hashed material body folds, and the input positions:

```text
kind  body  layers  capabilities  effects  version  nondeterministic  placement  input[n]
```

An `input[n]` entry appears when that input's declaration changed, and also when
the declaration is unchanged but the node it references itself re-keyed. A node
re-keyed purely by an upstream edit is therefore attributed to the input
position that references it, even behind an unprojected `Pending`, rather than
reported as nothing changed.

`changed` is empty only when none of the compared fields moved, which means the
key moved for a reason the comparison does not model. Treat an empty `changed`
on a re-keyed node as a bug report, not as noise.

## Node ids are positional

A node id is the node's structural address in the body, such as
`root.flow.andThen`, not the name of its step. Appending a step to a flow
nests the steps before it one level deeper, so a diff by id reports an
unchanged step as `added` under its new address and reports the addresses it
left as `rekeyed`. The step's key does not change.

Create `positional.ts`. It compiles a two-step flow and the same flow with a
third step appended, diffs them, then matches the steps by key:

```ts
import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { Action, Flow, Graph } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import * as Plan from "@smthrs/plan/Plan"
import * as PlanDiff from "@smthrs/plan/PlanDiff"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

const Draft = Action.make("fix/Draft", { payload: { issue: Schema.String }, success: Schema.String })
const Test = Action.make("fix/Test", { payload: { plan: Schema.String }, success: Schema.String })
const Report = Action.make("fix/Report", { payload: { result: Schema.String }, success: Schema.String })

const before = Flow.make("fix/Fix", {
  payload: { issue: Schema.String },
  success: Schema.String,
  body: (input) => Draft.call(input).pipe(Node.bindPlanned((plan) => Test.call({ plan })))
})

/** The same flow with one step appended. Draft and Test are unchanged. */
const after = Flow.make("fix/Fix", {
  payload: { issue: Schema.String },
  success: Schema.String,
  body: (input) =>
    Draft.call(input).pipe(
      Node.bindPlanned((plan) => Test.call({ plan })),
      Node.bindPlanned((result) => Report.call({ result }))
    )
})

const planOf = (flow: Parameters<typeof Graph.build>[0]) =>
  Plan.compile({ planId: "fix-1", flow: "fix/Fix", nodes: Graph.drafts(Graph.build(flow, { issue: "#42" })) })

/** The action a step node runs, read from its key material. */
const actionOf = (node: Plan.PlanNode) => {
  const body = node.material.body
  return typeof body === "object" && body !== null && "action" in body ? String(body.action) : undefined
}

const program = Effect.gen(function*() {
  const previous = yield* planOf(before)
  const next = yield* planOf(after)
  const changes = PlanDiff.diff(previous, next)
  console.log("added    ", changes.added)
  console.log("rekeyed  ", changes.rekeyed.map((entry) => entry.id))
  console.log("unchanged", changes.unchanged)

  // Match steps by key, not by id: an equal key is the same step.
  const recorded = new Set(previous.nodes.map((node) => node.key))
  for (const node of next.nodes) {
    const action = actionOf(node)
    if (action !== undefined) console.log(`${action.padEnd(11)} ${recorded.has(node.key) ? "same key" : "new key"}`)
  }
}).pipe(Effect.provide(NodeCrypto.layer))

await Effect.runPromise(program)
```

```bash
node positional.ts
```

```text
added     [ 'root.flow.andThen.andThen', 'root.flow.andThen.then' ]
rekeyed   [ 'root.flow.andThen', 'root.flow.then', 'root.flow', 'root' ]
unchanged []
fix/Draft   same key
fix/Test    same key
fix/Report  new key
```

Only `Report` is new. `Draft` and `Test` moved to `root.flow.andThen.andThen`
and `root.flow.andThen.then` with the keys they had, so they come back under
`added`; their old ids now hold other nodes and come back under `rekeyed`. To
ask which steps changed, compare keys rather than ids, as the last loop does: a
key present in both plans is the same step.

## Comparison uses the key's own JSON semantics

Each compared field is projected through the same JSON mirror the keys are
derived from, so two `Date` bodies a generation apart attribute to `body` rather
than to nothing. The projection runs no accessor.

A field the projection refuses compares by an identity token scoped to that node
and field. The same value stays equal to itself, two distinct refused values
never compare equal, and `diff` stays a total function even for a value
canonical serialization would reject. `diff` never fails and never needs a
service.

## Reporting a re-plan

The pairing this is built for is a re-plan of the same flow: compile the flow
again against the current source and compare the result with the plan an
operator last saw. `added` and `removed` are the shape change, `rekeyed` is the
work that will not come from cache, and `unchanged` is everything a cache hit
will skip. That reading holds while the shape stays put. Once a step is added
or removed, ids move, so read the work by key as
[Node ids are positional](#node-ids-are-positional) shows.

The command line prints the same comparison through
[`smthrs flow plan`](/cli/flow), and the plan card it renders is what
[`smthrs approvals approve`](/cli/approvals) binds a decision to.

## Next

- [Inspect the plan a body builds](../../../flow/docs/guides/inspect-the-plan.md):
  build a flow's graph and read its nodes before anything runs.
- [Step keys](../concepts/step-keys.md): why an upstream edit re-keys a
  downstream node whose own declaration did not change.
- [The plan value](../concepts/plan-value.md): the digests a diff sits beside.
