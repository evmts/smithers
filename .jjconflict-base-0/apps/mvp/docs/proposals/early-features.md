# Early features (feature 8): a proposal

Status: proposed 2026-10-19 for the lead's decision. Nothing here is built. Each feature is worked off `main` in its own jj workspace and lands when its first slice's end-to-end test passes. Sources: the lead's `FEATURES.md`, `RULES.md` and `HOST-PLAN.md` briefs, `.specs/product/overview.md`, `.specs/product/mvp.md`, the root `AGENTS.md`, `docs/libraries.md`, `apps/app`, `PRERELEASE.md`, and memories from 2026-10-13 to 2026-10-19. Revised for [0011](../decisions/0011-the-agent-runs-in-the-browser.md) the same day: 8a's placement and 8b's runs, which had put the agent's runs on the Cloudflare engine.

## The ranking

| Rank | Feature | First thing a person can do | Blocked by features 1 to 7? | Size |
| --- | --- | --- | --- | --- |
| 8a | Pull requests with Smithers review | Open a public PR at `/owner/repo/pull/N`, press Review, see findings pinned to diff lines | No | L |
| 8b | Runs: watch, steer and resume every run | Open any answer's run, see its live steps, get a toast that settles with the real outcome | No | M |
| 8c | TODOs and the stack | Commit a TODO, place it on the stack, read its plan; it waits for a machine | Its later slices: by 2, 5, 7 and the auth design | XL |

**Why these three.** This release passes when a person "does a day's issue, PR, run and secret work without leaving for github.com" (mvp.md M-44). Features 1 to 7 cover secrets (6) and the issues view (3). No feature covers pull requests or runs, and feature 2 removes both from the mock. TODOs are the loop the product exists for and its longest pole. `mvp-gaps.md` in this folder lists the same areas as its gaps 1, 2, 4 and 11.

Sizes are for one agent: S up to 2 days, M up to a week, L 1 to 3 weeks, XL more than 3 weeks.

```
                 1 flows   2 repo    3 renders   5/7 sandboxes   auth design   engine hosts (HOST-PLAN, B1)
8a PR review     adds      adds      adds        -               posting only  needed
8b Runs          adds      -         adds        adds            -             needed
8c TODOs         adds      needed    adds        needed          needed        needed
adds = makes the feature richer when it lands; needed = blocks a slice
```

## 8a. Pull requests with Smithers review

**Why now.**
- Reviewing agent output is the user's bottleneck (mvp.md §1.2, problem 3). The root `AGENTS.md` keeps `/review` as an ordinary flow and says to "preserve review quality and verification".
- The old `/review` never finished on a real install: it read the change on a branch machine whose image lacked bubblewrap (`PRERELEASE.md`, rc.4). A review that reads the diff over HTTP needs no machine, so it can start today.
- Its pipeline is pure TypeScript and already has a gate: 16 seeded fixtures with a committed baseline (offline precision 85.7%, recall 50%; `.smithers/flows/review/seeded-bugs/SCORECARD.md`).
- It builds the end of the TODO loop first, on PRs that already exist. When 8c opens PRs, their review surface is ready.

**First slice.**
1. Swap `github.com` for the app's host in a public PR URL. `/owner/repo/pull/N` opens the PR's changed files, rendered with Pierre diffs. Signed-out use works.
2. Press **Review**, type `/review owner/repo#N`, or ask Smithers. A durable flow reviews each file, verifies its findings and fills a Review card: a verdict, then findings pinned to diff lines.
3. Reload, or open a second device: the same run and findings appear. Nothing is written to GitHub. Posting a review and **Merge** wait for the auth design.

**Depends on 1 to 7.** Nothing blocks it.
- Feature 1 later registers `review` so the button, the slash command and the agent call one flow.
- Feature 2's Pierre repository adds cross-file context for PRs from the same repository. Pierre mirrors branches, not a fork's PR refs, so fork PRs read through GitHub.
- Feature 3 can render the Review card as a prebuilt template.
- Its GitHub reads use the server-held token below, a key the person must not hold, so by 0011's need rule it runs on the Cloudflare engine host (`HOST-PLAN.md` W4, wired into `worker/` by W5 (c)). Its model calls are `ModelStep`s (W3) through the model endpoint (W5 (a)). Until they land, its tests run on the in-memory engine.

**Old code to read.**
- Port: `.smithers/flows/review/src/review/` (`anchorFinding`, `dedupeFindings`, `rankSeverity`, `buildFileReviewPrompt`, `reviewChecklistForPath`, `fileFilter`), `src/workflow/verifyFindings.ts`, `applyFindingVerdicts.ts`, and `src/diffs/renderPierreFileDiff.ts`, whose annotation slots place findings in the diff.
- Later, for posting: `src/github/parsePatchCommentableLines.ts`, `buildPullRequestReview.ts`.
- The eval: `.smithers/flows/review/seeded-bugs/`. The path grammar: `packages/rpc/src/RepositorySubjectPath.ts`. The card: `.specs/design/mock/src/cards/Review.tsx` (Please fix, Not useful).
- Leave behind `src/git/runGit.ts` and `src/github/runGh.ts`: they spawn processes.

**SDK packages** (the `docs/libraries.md` job each comes from).
- Make a durable workflow: `@smthrs/flow`. Run an agent loop: `@smthrs/agent` (`ModelStep`). Pick a host's model: `@smthrs/model-host`, with a `REVIEW_MODEL` layer. Bounded fan-out: `@smthrs/patterns` (`Bounded.all`).
- Touch GitHub from product code: `@smthrs/integrations`. It imports `node:crypto` today (a known violation), so first make it run in a Worker. GitHub allows 60 unauthenticated requests an hour per address and Workers share addresses, so reads use a deployment-owned read-only token held as a Worker secret.
- Render diffs: `@smthrs/ui` (`DiffHunks`; export the Pierre diff adapter from the package root). Run an eval suite: `@smthrs/evals`, `@smthrs/scorers`. Sync rows: `@smthrs/effect-electric`, `@smthrs/effect-tanstack-db`.

**Tests.**
- Unit: the ported pipeline, plus boundaries: an empty diff, a binary file, the file cap, a finding outside commentable lines.
- Flow, on real Postgres with a scripted model: kill the run after 3 of 5 file steps, and the resume makes exactly 2 more model calls. A deadline keeps partial findings and marks them unverified.
- Eval: the 16 fixtures through `@smthrs/evals`. The offline baseline gates CI; the live score is reported, not gated.
- End to end, with video: a fixed PR in a team-owned public fixture repository, never the real one. Signed out, open it, review, reload, open a second browser.
- Telemetry: a sentinel planted in the diff and in a finding never reaches a log, span or metric.

**Size.** L.

## 8b. Runs: watch, steer and resume every run

**Why now.**
- "Every run is recorded, survives a restart without redoing finished work, and can be watched, steered, or resumed" (overview.md). Runs are one of the six things a user does there, and M-44 names run work.
- Will, 2026-10-13: the app is "a great way of building workflows (think github actions but more powerful)". The main screen of GitHub Actions is the run list and the run view.
- Features 1 to 7 all start slow work (a clone, a sandbox, a render, a model call), and none of them shows it. The root `AGENTS.md` requires a toast that runs through launch and execution and settles only from the real outcome.
- Remote runs keep the engine's run store and journal in the app's Postgres (`smithers_flows`, `HOST-PLAN.md`). Browser runs, the agent's included, write their run rows there through the outbox ([0011](../decisions/0011-the-agent-runs-in-the-browser.md), [0009](../decisions/0009-notifications-and-live-work.md) §2). So Electric syncs every run to every device with no new store.

**First slice.**
1. Each Smithers answer gets a run chip. It opens a Run card: Ask, Load history, Model and Settle, each with live state, attempts, time and tokens.
2. A Background work list shows running and failed runs. A failed run stays until someone retries or dismisses it.
3. Work that runs past 300 ms shows a toast, and the toast settles from the run's outcome, never from the request.
4. **Cancel** and **Retry** act through the engine. Two devices and a reload show the same state.

The slice syncs run metadata only: names, states, times and counts. Step inputs and outputs stay with the engine that ran them, in the browser or on the server, until the auth design decides who may read them.

**Depends on 1 to 7.** Nothing blocks it. Its first runs are `chat/Answer` on the durable browser engine (B1), whose run rows reach Postgres through the outbox. Remote runs need the engine in Postgres (`HOST-PLAN.md` W1, W4 and W5 (c)). Until 0011 its first runs were `chat/Answer` on Cloudflare, after W1 to W5. Features 1, 5 and 7 add kinds of run; feature 3 can embed the Run card.

**Old code to read.**
- `apps/app/src/mainview/cards/RunTrace.ts`, `RunTraceStatus.ts`, `RunTraceSteps.tsx`, `RunMeter.ts`, `RunForest.ts`, `RunNeedsHelp.ts`, `FlowRunGraph.tsx`.
- `state/controller/backgroundWork.ts` and `failures.ts`, for the lifecycle rules only: their timers live in the old controller.
- `.specs/design/mock/src/cards/Run.tsx`; mvp.md §6.14 (the monitor, phases, the Thrashing flag) for the later full view.

**SDK packages.**
- Start, approve, steer, cancel or watch runs: `@smthrs/control` (`Control`, and the pure `Monitor.classify` for status words). One row per run: `@smthrs/run-store`. Event history: `@smthrs/journal`.
- Sync Postgres rows through Electric: `@smthrs/effect-electric` (`ShapeProxy` over the run tables), `@smthrs/effect-tanstack-db`. Choose this or `@smthrs/sync` ("follow a run's events live in a browser") on day one, and use one, never both.
- Render UI: `@smthrs/ui` (`StatusPill`, `StageStrip`, `Queue`; export `WORK_NOTICE_DELAY_MS` and `noticeDismissDelay` from the package root).

**Tests.**
- Unit: run rows to card state, as a pure function. The toast state machine under `TestClock`: no toast under 300 ms, one toast per run across repeated launches, settlement only on a final state, a failure that never expires.
- Integration, on real Postgres and Electric: a scripted model holds a step; kill the executor; the card shows the takeover and the resume. Cancel shows Cancelled, not Failed.
- End to end, with video, as the root `AGENTS.md` asks: a deliberately unresolved launch and a running job. Chat stays usable, the toast settles only with the job, duplicate input makes one run, and a reload reconnects.
- Telemetry: step payloads never reach telemetry or the synced shape.

**Size.** M for the slice. The full monitor (graph, transcripts, phases) is a later L.

## 8c. TODOs and the stack

**Why now.**
- It is the product: "people and agents turn TODOs into merged pull requests on shared branches" (mvp.md, opening). Success is counted in merged TODOs: 50 in two weeks for our own team (§10).
- It is the longest pole. The old stack service is about 26,000 lines of Go on native jj (`packages/backend/internal/services/mythical*.go`), and none of it runs on Cloudflare.
- Its rules don't need a machine: append, before and amend; merge order; later PRs kept as drafts; out-of-order merges; never overwriting a person's commit (mvp.md §4, M-07, M-33, M-39).

**First slice.**
1. In a repository opened through feature 2, ask Smithers for a TODO. It fills a form card (Will's ruling of 2026-10-13), and **Commit** places it: Append, Before Tn or Amend Tn.
2. The repository's stack lists TODOs in merge order, with Move up, Move down and Drop.
3. Each TODO runs the `todo` flow. A real Plan step reads the repository through Pierre and writes the plan to the TODO card. The run then waits durably for a branch machine and shows "Queued · waiting for a machine".

The second slice follows feature 7. The coding agent works the branch, Pierre forwards the push to GitHub, the PR opens with its evidence, later items stay drafts, and a person's **Merge** squash-merges it.

**Depends on 1 to 7.**
- Feature 2 blocks the Plan step. Features 5 and 7 block the work step. Feature 6 serves tests that need secrets.
- The auth design blocks Merge and Pre-approve, because maintainers merge and agents never do (M-05, M-39). It also decides who may write a repository's stack. Until then the slice is bounded: a per-repository stack cap, size limits and no GitHub writes.

**Old code to read.**
- Pure, to port: `packages/rpc/src/StackView.ts` (the stack projection), `packages/rpc/src/TodoCommands.ts` (the grammar).
- The shape: `.smithers/flows/todo/flow.ts`, `.smithers/flows/coding/stack.ts`, and `apps/app/src/mainview/flows/entries/todo.ts` (every TODO action, its actors and confirmations).
- Rules to re-derive, not port: `mythical_placement.go`, `mythical_merge_todo.go`, `mythical_pr.go`, `mythical_inbound_pulls.go` in `packages/backend/internal/services/`.
- The cards: `.specs/design/mock/src/cards/Todo.tsx`, `Home.tsx`. Journey rows to keep: `apps/app/e2e/real/todo-placement.spec.ts`, `todo-merge.spec.ts`.

**SDK packages.** Make a durable workflow and wait for a person: `@smthrs/flow` (`WaitFor`, `HumanTask`). Run an agent loop: `@smthrs/agent`. A merge queue: `@smthrs/patterns`. Touch GitHub: `@smthrs/integrations`. Sync and render: `@smthrs/effect-electric`, `@smthrs/effect-tanstack-db`, `@smthrs/ui`. Pierre storage through the Effect wrapper feature 2 adds.

**Tests.**
- Unit: placement and order as a pure state machine with property tests. Any sequence of append, before, amend, move and drop keeps one total order and stable TODO numbers, and only the next item may merge.
- Flow, on real Postgres with a scripted model: Plan survives a kill, and the wait for a machine survives a redeploy.
- End to end, with video: create, place before T1, amend, move and drop on two devices, then reload. After the second slice, a PR on a scratch GitHub repository squash-merges and the TODO shows Merged.

**Size.** XL overall; the first slice is L.

## Considered and left out

- **The launcher at `/`** (M-45): S. Its open-by-name field belongs in feature 2's routes, and "your repositories" and "create" need the auth design.
- **Notifications:** 8b carries the toasts. Notification policy as a flow (M-47) needs events worth notifying, such as Needs you and PR ready, plus a "who"; 8c and the auth design bring both.
- **The wiki:** its content comes from learning runs after merges, so it follows 8c. Live co-editing rides feature 5's CRDT work.
- **Issues:** feature 3 owns the issues view, and writing to GitHub issues needs the auth design.

## Missing evidence

- No usage data shows demand for `/review`; the demand is the spec's hypothesis (§1.2). Falsifier: on the hosted fast model, the live seeded-bug score falls short of the old reference (71% recall). Then 8a needs a stronger review model route before launch.
- `PRERELEASE.md` records no TODO taken to a merged PR by a real model. The old install's runs 10 and 16 merged one each with a scripted model.

**Next action:** start 8a in a jj workspace named `pr-review` by writing `apps/mvp/docs/features/pull-requests.md` first, as the documentation-first rule requires.
