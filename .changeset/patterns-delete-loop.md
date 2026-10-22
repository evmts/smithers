---
"@smthrs/patterns": major
"@smthrs/plan": patch
---

Delete `Loop` under the approved flows-as-code design (FLOW-10, sections 4.2
and 7.5). It restated the engine's trampoline, and `Loop.run` repeated completed
work after a crash because it bypassed the journal (DUR-1). Use a flow that
hands off to itself with `Flow.to` and declares `maxRounds`.

```ts
// Before
Loop.run(input, { body, until, maxIterations })

// After
import { Action, Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import * as Schema from "effect/Schema"

const Step = Action.make("repair/step", {
  payload: { input: Schema.Unknown },
  success: Schema.Struct({ done: Schema.Boolean, value: Schema.Unknown })
})
const Payload = Schema.Struct({ input: Schema.Unknown })
type Repair = Flow.Flow<
  "repair",
  typeof Payload,
  typeof Schema.Unknown,
  typeof Schema.Never,
  Action.Requirement<"repair/step">
>
const self: Repair = Flow.make("repair", {
  payload: Payload,
  success: Schema.Unknown,
  maxRounds: maxIterations,
  body: ({ input }) => Step.call({ input }).pipe(
    Node.branch({
      if: (next) => next.done,
      then: (next) => Flow.done(next.value),
      else: (next) => self.to({ input: next.value })
    })
  )
})
yield* self.execute({ input }, { executionId: "repair-request" })
```

Register `Step`'s implementation and the flow with the engine. Each step and
handoff runs through the journal. Exceeding `maxRounds` records a
`Flow.MaxRoundsExceeded` defect instead of returning the last iteration.

Delete `ScanFixVerify.run` and `Optimizer.run`, which used `Loop.run`.
Use `ScanFixVerify.make` and `Optimizer.make` and execute the returned flow on
the engine. Their `RuntimeOptions` types and the executed-only result types
`ScanFixVerify.Report` and `Optimizer.Result` are deleted. `Optimizer.OnMaxReached`
still uses the ceiling vocabulary from `@smthrs/plan/Repetition`.

The entire `Loop` module is deleted, including `make`, `ralph`, `run`,
`runRalph`, and its types and predicates. Its subpath export is explicitly
`null`.

Library catalog entry: "Make a durable workflow" (`@smthrs/flow`).

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes).
