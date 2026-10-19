# Smithers mock dataset

This folder is fixture data for `smithers.sh/smithers-canary/smithers`, a mirror of
`github.com/smithersai/smithers`. It is not a production verification receipt.
The review clock is `2026-10-18T05:00:00Z`.

## Read-only sources

- A read-only checkout of smithersai/smithers. Blob and home-block audit pin:
  `e75952e77560b6a4b0a5ae529d4f690a5332d11c`. `check.mjs` reads only
  `jj --ignore-working-copy file show -r <pin> 'root-file:<path>'`;
  it never compares against the moving working copy.
- History and tracker exports from that repository (a local facts export, not committed):
  `smithers-commits.json`, `smithers-commit-stats.txt`, `smithers-issues.json`,
  `smithers-pulls.json`.
- The scripts take both locations from the environment and record neither:
  `MOCK_FACTS` names the facts export (required), and `SMITHERS_SOURCE` names the
  checkout (default: the repository that holds this mock).
- Release versions and notes: the checkout's `CHANGELOG.md`,
  `packages/smithers/package.json`, and `packages/smithers/docs/installation.md`.

`generate.py` is the original checkout-based reconstruction script, not a pinned
regeneration receipt: its tree metadata and abbreviated-path resolution read the
checkout. Required `smithers-commit-stats.txt` and `smithers-tracked.txt` are absent
on this host, so it was not rerun. `extend.py` now reads repository blobs at the
audit pin using read-only `jj file show`, and reads the two imported scorecards
from `imports/`; it never adds them to repository subjects. Both scripts write
only this folder and make no network request. Run
`MOCK_FACTS=<facts export> node check.mjs` to audit the checked-in fixture without
regenerating it.
The shared `../../check-fixtures.mjs` checks the stage 1 example and does not take
a dataset argument, so this dataset has its own check.

## Preserved facts

- 99 of the 100 exported commits keep their SHA values, parent arrays, dates,
  message titles and bodies, in export order. `36b672172b8f` is left out because
  its message quotes a local gate-script path; the record is never rewritten.
  `omittedCommits.json` keeps only its real SHA and parent, so main's history
  walks through it, and its commit page shows unavailable history. Its
  synthesized land run is removed; `.smithers/target-index.json` keeps it as the
  real last-touch commit. The source owner becomes `maya` in author metadata. The four
  issue-sweep authors and Gemini become `smithers-agent`, preserving the
  three-member cast. Claude/Codex co-author trailers identify their harness;
  otherwise the harness is left unknown (or Gemini where explicitly named).
- 40 of 60 exported issues are included. All are by the owner or the release App;
  #4232 is explicitly excluded in `generate.py` and `check.mjs` because the
  reporter's historical site quotation violates the claim gate. Nine bug-bash
  reports (#4236, #4237, #4239, #4256 to #4260, #4262) are excluded the same way
  because their bodies quote operator machine paths. Source records are never
  rewritten to pass a gate; the check compares facts minus exclusions. The
  illustrative issue-triage run for #4260 is removed with it, so the issue-triage
  flow has no recorded run, and the `severity:medium` label, used only by #4256
  and #4259, is gone. Ten more reports (#4231, #4241 to #4244, #4246, #4247,
  #4252, #4263, #4264) are excluded the same way because they name the private
  operations vault or quote home-relative machine paths. The illustrative landing
  entry that checked #4247 stays in the queue as `queue-signal-receipts`, with no
  issue link, so the queue still shows a working entry.
  Five included App authors map to `smithers-agent`. Titles, issue numbers, states,
  labels, creation/closure times and bodies (first 1,500 characters) are retained.
- Of 30 exported pulls, only the owner's 27 survive. The other three are
  excluded entirely. The export does not include pull bodies, exact merge
  receipts, updates, changed paths, comments, reviews or commit lists: those
  fields are left empty or absent, with creation time as the update fallback.
- All 37 repository blobs are complete copies of the pinned revision, with
  exactly the two pending copy exceptions documented below. No file is truncated.
  The eight representative application sources have fewer than 400 lines each.
  The six docs bodies are the same text as their file blobs. Symbol locations
  are real declarations in `IssueTodoDraft.ts` and `CatalogRequest.ts`.
- Home starts with the five real `.smithers/home.json` blocks, then the requested
  links and fixed-by-agents strip. Link fields use `url`. The docs root is
  `packages/smithers/docs`. There is no root `WORKSPACE.ts` in the checkout.


## Pending upstream copy change (principle 7; PM d-7oejn2)

At the audit pin, `README.md` and root `package.json` differ by exactly the
description sentence below. The newest export retains that source description
and additionally has the Effect version drift documented below. The source says:

> Smithers maintains your codebase. It turns issues into reviewed, tested changes and, when enabled, keeps the project wiki current. Flows beside your code define how.

The mock says:

> Smithers maintains your codebase. It turns issues into tested changes for you to review and, when enabled, keeps the project wiki current. Flows beside your code define how.

The source phrase is “reviewed, tested changes”; the mock phrase is “tested
changes for you to review”. Spec principle 7 and PM d-7oejn2 bind Smithers’ own
words, including these descriptions. These are pending upstream copy changes,
not verbatim source quotations or completed upstream fixes. The PM decides the
upstream change; `apps/site/src/data/project.json` generates both source files.
`check.mjs` permits exactly one full sentence replacement in `README.md` and
one exact description-field replacement in root `package.json`; every other
byte in those files must match the pin. It permits no other copy exception.

## Illustrative state and limits

- The original checkout predates the exported history. All 37 repository blobs
  were verified against the single audit pin above, including Effect 4.0.4.
  The newest exported commit is `3588460545591ad7470c82095cb84434ced94aba`;
  its first four exported revisions do not match the 4.0.4 files. The newest
  matching exported main revision is the audit pin, immediately before
  `28986e29bafb0ce6e9eb2a672cef9e26a82bebbe` upgraded Effect to 4.0.5.
  The four affected files are `package.json`, `packages/smithers/package.json`,
  `packages/smithers/docs/installation.md`, and
  `packages/smithers/flows/docs/quickstart.md`. All four match the pin exactly
  (with the separately allowed root description sentence). No version-drift
  exception or general text normalization is allowed by `check.mjs`.
- The newest 25 commits retain the paths shown in the supplied diffstat.
  That export shows only a subset of paths for larger commits and gives
  combined changes plus scaled `+`/`-` bars, not exact per-file numstat.
  Additions/deletions are estimates from those bars. Ten small preview hunks
  reconstruct the described changes using real source context; they are not
  recovered patches. Empty hunk lists on other paths mean no patch was supplied.
- The 44 remaining original run records (two left with the excluded records
  above) and five eval snapshot imports, costs, elapsed times, traces, branch states, queue,
  approvals, agents, wiki, settings, language percentages and blame ranges are
  illustrative. Zero cost/token values mean no usage receipt was supplied;
  they do not assert that those historical runs were free. Historical run IDs
  are synthesized from real commit identities. No actual run was launched.
- The Stack is only a landing queue, owned by `lander`. It includes queued,
  landing, landed and refused entries. The failed lint run is grounded in the
  formatter-drift repair message. rc.13 is waiting on the owner's preparation
  approval; it has not been published. A newer staged lint refusal illustrates
  a refused candidate rather than asserting the current checkout fails lint.
- Fixed issue/commit pairs: #4218 → `24015c927059`, #4217 → `7ce5c49675b8`,
  #4214 → `62de1621dee5`, #4209 → `a7407dfe7c55`. The first two have explicit
  Claude trailers. Agent attribution for the latter two is an illustrative
  inference, not independently established by the export. Acceptance and run
  timestamps are illustrative. The landed timestamp is the later of commit
  author time and the real issue closure (an observation time), because #4218
  was reported after its fix's author timestamp. No review PR is invented for
  these direct-main fixes.
- The four release entries are rc.12, rc.11, rc.10 and stable 0.35.0. Candidate
  versions, dates and notes come from the real changelog. The stable version is
  stated in installation docs, but its date is absent: August 20 is a display
  placeholder. All release times use a display-only noon UTC time. Tag anchors
  use real changelog commit references (rc.12's preparation commit and the
  other three cited prefixes); exact tag-tip receipts are unavailable. These
  older anchors and the oldest commit's parent are outside the 100-commit
  window. Integrators should show unavailable history for these refs rather
  than substitute a different commit. rc.11's notes retain its build blocker.
- Tree rows outside the 37 loaded repository files have paths and sizes but no file blob.
  Missing blobs are not empty files. Unknown last-touch revisions and blame use
  the oldest captured commit as a display anchor, not as a historical claim.
- GitHub sync is stale, grounded in the canary report #4257 (left out of the
  issue list for its machine paths), rather than falsely healthy.
  No secret value, credential, invite, external webhook or paid account is
  fabricated or exposed. Ask answers cite the included real files.

## Registry handoff

Add this import in the shared fixture registry, then register it under
`smithers-canary/smithers`:

```ts
import { dataset as smithersDataset } from "./data/smithers-canary__smithers"
```

The qa-src2 audit changes only imported-snapshot labeling in the shared Evals
list/detail views; no routes or screen IDs were changed. Dataset-only
state includes ready/empty collections, queued/running/waiting/failed/succeeded
runs, a pending human approval, stale sync and landing refusals. Loading,
network error/retry, signed-out, permission and held-host states remain the
shared views' responsibility.

## Stage 2 eval sources and limits

`extend.py` reads these exact local sources without executing an eval or launching a model:

- `.smithers/flows/review/seeded-bugs/review-seeded-bugs.eval.ts`, `baseline.json`, and `SCORECARD.md`: sixteen deterministic fixtures, six matches, one false positive, six misses; F1 is 12/19 (63.2%). The gate preserves each fixture's baseline, including its known misses.
- `evals/authoring/validate.ts` and `data/pilot-sft.jsonl`: ten pilot rows. The validator checks chat shape and public workspace imports. Display scores are an illustrative snapshot; no execution receipt or fixed-suite adapter is supplied, so the result is inconclusive. `check.mjs` allows unexecuted placeholders only for this inconclusive,
  non-runnable authoring snapshot and requires those rows to keep
  zero score/baseline placeholders and `passed: false`, rather than treating 0/0
  as an executed passing verdict.
- `packages/backend/modelhost/recommend-eval/recommend.eval.ts` and `fixtures/sample.jsonl`: `recommend/hit-rate`, calculated from outcomes in the sample log. Rows without outcomes are excluded from hit rate.
- `packages/smithers/agent/regression/agent.eval.ts` and `baseline.json`: real case names and committed scores. Each case gates `evals/agent/behaviour` and `evals/agent/contract`, both at 1.
- Imported SWE-bench snapshot: `imports/swebench-scorecard.json` and `.md`
  preserve the original fixture bytes, previously presented as
  `evals/swebench/fixtures/scorecard.{json,md}`. The August 19 fixture wave
  records flows 1/5 versus Codex 5/5; it has no verified repository provenance.
  `jj --ignore-working-copy log -r 'files(glob:"evals/swebench/**")'` returned
  88 revisions; read-only `file show` found neither path at any of them
  (176 probes; the audit's local receipts, `swebench-audit.json` and
  `swebench-history.txt`, are not committed). Neither is at the newest export or the audit pin.
  They are removed from repository `files.json` and `blame.json`; `tree.json`
  already contained neither path. Its README/root package byte sizes were
  corrected by eight bytes each to account for the pending copy change. The Evals list and detail
  explicitly say “Imported snapshot · not in this repository” and offer no
  repository blob/evidence links for it. The Ask file card is removed and its
  snapshot run log discloses the import. The suite ID, routes and screens remain.
  `check.mjs` allows only this named non-runnable imported suite to omit a
  repository file, checks its case outcomes against the imported JSON, and pins
  both imported byte identities:
  - JSON SHA-256: `9cc90a2ee25b00faaec72ec1659257a293c4e27d5aeab03a3c284d3b2372d531`.
  - Markdown SHA-256: `45011b14021df31ebe89ef1dc3b66627d70f802103c6bb21664f98543749b451`.
  These hashes identify imported bytes, not a source revision. Placeholder
  subject hashes remain placeholders; this is not a current result or executable
  repository module. No screen ID or route was removed.

All chart history is synthesized for the mock. Five `run-eval-snapshot-*` records import these snapshots; they are not receipts of execution. Their zero usage fields do not establish execution cost. The `eval.run` flow card represents the requested mock command and links the real `packages/smithers/src/evaluation/EvalCli.ts` implementation; it does not claim a repository-authored flow exists at that path.

The dataset index adds `evals` and projects the same JSON into `repo.config.evals.suites` so views can read it through the unchanged shared fixture API. Another configured dataset can use the same adapter. A shared typed `evals` binding would remove this adapter once the fixture API owner adds it.

Author metadata and approval recipients use `maya`; exported commit/issue text
retains its source contents. Complete repository blobs retain the pinned source
contents except for the two pending description sentences documented above. `lander` is the configured landing user, represented as a member, while its agent configuration remains the illustrative landing lane. A person approves before that user takes a change from the queue.

## PM review example (d-0vuoef)

PR #9001, `run-review-example`, `mock/review-example`, its one-line commit,
check, and Stack entry are an explicit simulated review scenario from
`../../review_example.py`. They are not imported GitHub records or deployed
execution receipts. The imported commits and tracker records, minus the exclusions above, remain intact.
