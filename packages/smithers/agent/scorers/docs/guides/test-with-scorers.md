---
title: "Test code that uses scorers"
description: "Exercise scoring with the production SQL store and durable runtime."
sidebar:
  order: 6
---

Use the real `SqlScoreStore` over `TestDatabase.layer` for isolated behavioral
tests. Inject a faulty Effect service only for failure cases.

```ts
import * as TestDatabase from "@smthrs/database/test/TestDatabase"
import { Scorers, Scoring, SqlScoreStore } from "@smthrs/scorers"
import { Effect, Layer } from "effect"

const store = SqlScoreStore.layer.pipe(Layer.provide(TestDatabase.layer))
const exact = Scorers.exact()
const program = Scoring.runBatchCorrelated([{
  identity: Scoring.jobIdentity(["test-run", "answer", exact.scorerKey]),
  observation: { targetStepKey: "answer", scorerKey: exact.scorerKey },
  score: exact.score({ input: null, output: "yes", groundTruth: "yes" }),
  at: 1
}]).pipe(Effect.provide(store))
await Effect.runPromise(program)
```

For recovery, run the real caller flow over an on-disk journal. Interrupt or
dispose its runtime after scoring starts, rebuild the runtime over the same
file, and resume the same execution identity. Assert one durable observation,
then replay the completed flow and assert no additional scorer execution.
`test/DurableScoring.test.ts` exercises this boundary with `NodeRuntime` and
production SQL stores, with no mock journal or runtime.

Keep timestamps and job keys stable. Cover scorer errors, validation,
interruption, duplicate writes, input order, and concurrent batches.
`ScoreStore.layerNoop` disables persistence explicitly; it still runs scorers.
