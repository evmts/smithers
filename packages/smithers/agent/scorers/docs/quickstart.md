---
title: "Quickstart"
description: "Score inside a durable action and replay it over the same SQL journal."
sidebar:
  order: 2
---

Install `@smthrs/scorers@next`, `@smthrs/flow@next`,
`@smthrs/plan@next`, `@smthrs/platform-node@next`, and `effect`.
This example uses the real Node host and its on-disk SQL journal.

## Declare the action

The payload contains serializable inputs and a stable job identity. Reconstruct
the score Effect when the action executes; never put an Effect in the payload.

```ts
import { Action, Flow, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { NodeRuntime } from "@smthrs/platform-node"
import { Scorers, Scoring, SqlScoreStore } from "@smthrs/scorers"
import { Effect, Layer, Schema } from "effect"
import { resolve } from "node:path"

const Grade = Action.make("example/Grade", {
  payload: {
    jobKey: Schema.String,
    output: Schema.String,
    expected: Schema.String,
    at: Schema.Number
  },
  success: Schema.Void,
  implementationVersion: "grade/v1"
})
const GradeFlow = Flow.make("example/GradeFlow", {
  payload: Grade.payloadSchema,
  success: Schema.Void,
  body: Node.capture({ action: Grade.name }, (payload) => Grade.call(payload))
})
```

## Attach scoring and the store

`SqlScoreStore.layer` applies the scorer migrations using the database and
durable writer supplied by the Node host. A failed store write must not mark
the action complete; the caller fails it and the engine owns any retry policy.
Scorer failures themselves become typed inconclusive observations.

```ts
const exact = Scorers.exact()
const implementation = Grade.toLayer(({ jobKey, output, expected, at }) =>
  Effect.gen(function*() {
    const outcomes = yield* Scoring.runBatchCorrelated([{
      identity: Scoring.jobIdentity([jobKey, exact.scorerKey]),
      observation: { targetStepKey: jobKey, scorerKey: exact.scorerKey },
      score: exact.score({ input: null, output, groundTruth: expected }),
      at
    }])
    if (outcomes.some((outcome) => outcome.recorded === "failed")) {
      return yield* Effect.die("Scoring observation could not be persisted")
    }
  }), { implementationVersion: "grade/v1" }).pipe(Layer.provide(SqlScoreStore.layer))
```

`runBatchCorrelated` returns each job identity, its observation and `recorded`:
`persisted`, `duplicate`, or `failed`. `runBatch` returns only the observations.
Both await all work and preserve input order. Neither accepts background work.

## Run on a durable host

```ts
const workspaceRoot = resolve(".")
const host = NodeRuntime.layerHost({
  filename: `${workspaceRoot}/.flows/scoring.sqlite`,
  workspaceRoot,
  owner: { hostId: "scoring-example" }
}, Interpreter.layerWithImplementations(GradeFlow, implementation))

await Effect.runPromise(
  GradeFlow.execute({
    jobKey: "greet/ada",
    output: "Hello, Ada",
    expected: "Hello, Ada",
    at: 1
  }, { executionId: "grade-ada-1" }).pipe(Effect.provide(host), Effect.scoped)
)
```

Run the same file again: the completed action replays its journaled result
without executing the scorer. An interrupted runtime resumes unfinished work
under the same execution identity. If the observation committed before the
action result did, `recordOnce` deduplicates the observation by job identity.
External scorer side effects still need their own stable idempotency keys.

See [Durability](./durability.md),
[Run a batch](./guides/run-a-batch-of-scorers.md), and
[Read scores back](./guides/read-scores-back.md).
