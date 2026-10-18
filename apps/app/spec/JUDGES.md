# Judged assertions

`observe` consumes captured visible text grouped by data-view, an accessibility
snapshot and screenshot bytes. The browser must mask journey-declared volatile
regions before taking the screenshot. Literal volatile text values are replaced
before hashing; counts are retained unless the journey explicitly marks them.
No raw DOM, hidden text, credentials or page scripts enter the observation.

`record` runs Rubric.make three times through a supplied Evaluator. The real
seat adapter uses Evaluator.layerFromSeat and forces temperature zero; node
configuration chooses the account and must resolve the policy's exact model.
Requests fence all page evidence as untrusted data. A score question returns a
zero-based integer which is converted to Rubric's 1–5 scale. Reasons summarize
the recorded scores rather than free-form model explanations.

`replay` uses CachedEvaluator without a live fallback. It checks identity,
decodes the fixture and recomputes all three judgments. A missing file is
missing; changed evidence, configuration or corrupted receipts are stale.
Replay does not expire mock evidence. A future live target must use maxAge 30d
and declared key scope, or cache false if the build CLI cannot express that.

The budget file beside results reserves three calls, estimated prompt tokens
(three UTF-8 bytes per token) and each call's entire timeout before dispatch.
Reservation is conservative: errors and cancellation do not refund capacity.
An exclusive directory lock refuses concurrent writers; after a crashed writer,
an operator must inspect the ledger before removing its abandoned lock.
A run keeps its limit across UTC midnight; daily limits reset on UTC dates.
Exhaustion is inconclusive (exit 5), never pass. Missing/stale receipts exit 1.
A split is uncertain and appends a pending-label request. These files should
live beside run results; the independent API takes their paths explicitly.

Before the journey runner is available, the CLI boundaries are:

```sh
bun apps/app/spec/judgeCli.ts replay request.json journey.judgments.json .smithers/factory.json
bun apps/app/spec/judgeCli.ts record request.json journey.judgments.json .smithers/factory.json /path/to/seat.ts results.budget.json
bun apps/app/spec/agreementCli.ts
pnpm exec smthrs eval run judges --root apps/app/spec --run-id judges-check
pnpm exec smthrs eval compare judges-check --root apps/app/spec --baseline evals/judges.baseline.json
```

The trusted local seat module exports `seat: { id, modelId, model }`; no credentials
are written to receipts. Record is disabled when CI is set. The journey runner owns page capture, assertion selection, shared sidecar storage
and result aggregation. A journey sidecar stores `{version: 1, judgments: {...}}`
keyed by zero-based `step:assertion`. Live sidecars stay under the output directory
and never overwrite committed mock evidence. `judge --record` selects mock;
`judge --record --live` selects read-only live capture. `SPEC_JUDGE_SEAT` names a
trusted node module exporting `seat` or `seats: {rubric, fuzzy}`; each seat must
match its policy model and engine (Anthropic/Claude or OpenAI/Codex). `SPEC_JUDGE_POLICY` optionally names a factory projection.
The existing journeyMock target depends on specSite and replays only.
`judgeLive` is exclusive and cache false: NodeTest does not support maxAge or
keyScope on this build CLI. Live writes fresh evidence on each invocation.

The agreement report reads owner labels from labels/<rubric>.jsonl. pass3 is
passHatK(3, correct trial votes, 3), averaged over labeled observations; a
negative label measures consistent rejection. Promotion requires at least 20
unique current owner labels, agreement at least 0.9, unanimous trials and
failing seeded defects. Limits stricter than those minimums remain in force.
No owner labels are invented. The 30 authored eval fixtures test prompt fencing,
Rubric scoring and label comparison offline; they do not calibrate real models
or promote rubrics. A model/rubric version change requires fresh owner evidence.
