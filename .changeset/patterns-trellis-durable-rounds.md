---
"@smthrs/patterns": major
"@smthrs/memory": minor
---

A declared `Trellis` runs the plan its author wrote. `Trellis.make` used to
declare `fuel` placeholder leaf slots, each handed the whole plan as its goal,
so a running trellis never ran the authored leaves; and `Trellis.run` looped
over rounds in a fiber with no durable handoff, so a crash lost every round.

`Trellis.make` now spends one durable trampoline round per authored plan. The
first round calls `author` and hands the plan to the next round with
`Flow.to`; a plan round reads the plan as data, validates it against the
envelope and the fuel left, and calls exactly the leaves it names. An optional
`continue` member asks for the next plan. The trellis settles with
`{ rounds, remaining }`, and a crash resumes at the round boundary.

```ts
// Before
const result = yield* Trellis.run(prompt, { author, leaf, continue, envelope })
// After
const trellis = Trellis.make({ author: Planner, leaf: Worker, continue: FollowUp, envelope })
const result = yield* trellis.execute({ input: { prompt } }, { executionId })
```

`Trellis.run`, `Trellis.Authoring`, `Trellis.RuntimeOptions` and the
`leaf_failed` code are deleted; a failed leaf fails its round with its own
error. A continuation that answers `null` ends the trellis. The trellis
payload is `Trellis.Payload`: `{ input, round? }`, and round state whose round
number or fuel its settled rounds and the envelope do not account for fails
`invalid_envelope`. Its error schema unions `TrellisError` with the error
schema each member flow declares, so a durable journal encodes the trellis's
own refusals and a leaf's tagged error alike, and a refusal's
`cause.refusals` is `{ code, path, message }` data.
`Trellis.execute` stays, for `DelegationChain.run`.

`MemoryTrellis.make` accepts `continue` and scopes it under the same memory
policy.

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
