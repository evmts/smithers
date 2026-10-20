---
title: Plan identity that survives minified builds, and a readable plan_changed failure
status: done
area: sdk
owner: SDK follow-up agent, done at 07:27:56 on 2026-10-20 (the lead to Will); the app's use went to the client Fable fix agent (durable-answering). Until 07:27: SDK follow-up agent; from 06:37 on 2026-10-20 under the lead's correction (track where each name is used, so swapped arguments change the identity). By 07:04 on disk: `sourceShape` numbers bindings by declaration, and `@smthrs/flow`'s `refusalCode` reads `plan_changed` from stored failures; no app change; unreported. Until 06:37: SDK follow-up agent; from 06:25:59 on 2026-10-20 the fix: `@smthrs/crypto`'s new `sourceShape` erases binding names before a callback's source is hashed, used by `Identity.ts` and `plan`'s `node.ts`, with tests; no run on record and the stored `plan_changed` code not started; unreported. Until 06:25: SDK follow-up agent; from 06:21 on 2026-10-20 a failing-first regression test in `engine-store` (`PlanIdentityAcrossBuilds.test.ts`, scenarios `minified` and `minified-edited`, bundled by esbuild), no `flow` or `engine-store` source change yet, unreported. Until 06:21: SDK follow-up agent; prototyping in the scratchpad from 06:11 on 2026-10-20 (`shape/`: the same flow minified by esbuild, Rolldown and Terser around four variants of unrelated code, and a source normalizer that renames bindings), no package file changed, unreported. Until 06:11: SDK follow-up agent (started about 05:58 on 2026-10-20 by the lead); researching from 06:01 to at least 06:04 (where `plan_changed` is raised, how run failures are stored, the app's dispatch and chat store, esbuild in the workspace); no file changed, unreported
updated: 2026-10-20
links: [plan-identity-across-deploys.md, durable-answering.md, durable-browser-engine.md, cloudflare-flow-host.md, app-wiring.md, code-reviews.md, everything-is-a-durable-flow.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../features/agent.md, ../features/remote-flows.md, ../../../../AGENTS.md, fable-review-2-fixes.md, api-baseline-rerecord.md, land-to-main.md]
---

## What

Two gaps the first plan-identity fix left ([plan identity across deploys](plan-identity-across-deploys.md)):

1. **Callback identity.** The plan digest still includes each callback's source text. Vite and Wrangler (esbuild) minify production bundles, and a minifier renames the locals inside an unchanged callback whenever unrelated code shifts. So a production deploy can still fail every parked run with `plan_changed`: `chat/Expire` on the Cloudflare host, and `chat/Answer` in a browser that resumes from OPFS after an app update.
2. **The failure code.** A run that hits `plan_changed` settles `failed`, but `poll` and `result` show only a defect named `@smthrs/flow/InterpreterError`. The code is lost, so the app can't tell why the run failed, and the answer it guards stays streaming.

```
build A (minified) ── run parks ── deploy build B (minified; unrelated code moved) ── run wakes
callback in A: (a,b)=>a+b          callback in B: (n,r)=>n+r
digest today:   source text differs        ──▶ plan_changed, the run fails
digest after:   normalized identity equal  ──▶ the run resumes
                a real logic change        ──▶ plan_changed, stored with its code
app:            poll ▶ failed { code: plan_changed } ──▶ settle the answer as failed
```

Best-guess spec, from the lead's brief (about 05:58 on 2026-10-20):
- **Reproduce first.** Build the same flow module twice with esbuild `minify: true`, changing only unrelated code so the mangled names differ. Park a run under build A and resume it under build B. Today it fails `plan_changed`; that is the failing test.
- **Callback identity.** Two candidates:
  - normalize the source before hashing: parse it, rename local bindings to canonical names, and hash the normalized tree;
  - identify a callback by its declared position in the plan, plus an explicit, optional `version`.

  Platform-neutral (no Node-only parser at runtime) and fast. The changeset says which one and why. A real logic change is still detected, with a test.
- **The failure code.** `plan_changed` stays in the stored failure as a typed, observable outcome for `poll` and `result` callers. Older stored failures without the code still read. The agent reports how `apps/mvp` should settle a stuck answer when its `chat/Answer` run ends `plan_changed`; it doesn't edit `apps/mvp`.
- **Proof:** 100% coverage, the engine-store matrix on SQLite and Postgres, the flow, engine and flows suites, `platform-cloudflare`, `platform-browser` (Node and Chromium), typecheck, lint, `pnpm docs:check`, docs and a changeset. jj only; nothing committed.

## Why

The root `AGENTS.md` makes flows durable by default: a run survives a crash and a deploy. The first fix makes unminified dev rebuilds safe, but production bundles are minified, so the first real deploy could still strand every parked answer. And when a flow really does change, the app needs the reason to close the work it guards instead of leaving "Smithers is answering" on screen.

## State

- **05:57:59 on 2026-10-20, the plan-identity agent's report** named both gaps. Its point 8: "callbacks are still identified by their source text, so a minifier that renames variables inside an unchanged callback would still cause `plan_changed`." Its point 6, proposed but not built: keep the `plan_changed` code in the stored failure; "it changes how run failures are stored, so it isn't a small change" ([plan identity across deploys](plan-identity-across-deploys.md)).
- **05:58 on 2026-10-20, the lead to Will:** "One gap remains, and a follow-up agent is closing it. Production builds minify code, and minifying can still make an unchanged flow look different after a deploy. The same agent also makes 'your plan changed' a readable failure, so the app can mark the affected answer failed instead of leaving it stuck."
- 06:01 to 06:04 on 2026-10-20, unreported: the agent read where `plan_changed` is raised in `flow`, `engine-store` and `engine`; `engine-store/src/internal/ExitEncoding.ts` and `RunDriver.ts`; `flow/src/FlowRuntime/FlowRuntime.ts`; the app's `src/flows/dispatch.ts` and `src/features/chat/store.ts`; `platform-browser`'s engine; the unresolved-plan-action tests; and which esbuild the workspace has. No file changed.
- 06:11 on 2026-10-20, scratchpad `shape/`, unreported: the reproduction and a prototype. `experiment.mjs` builds one flow module with esbuild `minify: true`, Rolldown and Terser (Vite's `build.minify: "terser"`) around four variants of unrelated code (`src/entry-a.ts` to `entry-d.ts`), writing `out/*.mjs`. `shape.mjs` prototypes a function's source "with its binding names canonicalized": `$0`, `$1` by first occurrence, or every name erased to `$`. By 06:15 no file under `packages/smithers/flows` has changed.
- 06:21:07 to 06:21:57 on 2026-10-20, on disk, unreported: the regression test.
  - `engine-store/test/fixtures/MinifiedAnswerFlow.ts` and `MinifiedBuild.ts`: "`MinifiedAnswerFlow.ts` as a production bundle ships it: bundled and minified by esbuild, the minifier Wrangler deploys with."
  - `PlanIdentityAcrossBuilds.test.ts` adds two scenarios to "resumes a parked run whose plan was rebuilt". `minified`: a run parked on the flow bundled alone resumes on the same flow bundled beside unrelated code, and must complete. `minified-edited`: the resumed bundle changes `value + this.step` to `value - this.step`, and must fail `plan_changed`.
  - Scratchpad `peek.txt` (06:23:55) holds the same callback from two builds, differing only in renamed bindings (`x` and `l` against `N` and `p`).
  - No `flow` or `engine-store` source file changed by 06:26, and no run is on record.
- 06:09:22 on 2026-10-20: the Fable engine and hosts fix agent started in `platform-cloudflare`; it touches `engine-store` only if it must, and re-reads files before editing ([Fable review 2 fixes](fable-review-2-fixes.md)).
- 06:25 to 06:34 on 2026-10-20, on disk, unreported: the identity fix.
  - `packages/smithers/flows/crypto/src/internal/sourceShape.ts` (new at 06:25:59, last changed 06:33:13): "A function's source as a minifier leaves it: its tokens, with every name a binding introduces or reads erased." Literals, property names, object keys, operators and structure stay; comments and whitespace go. It tokenizes rather than parses. Its stated limit: "What it cannot see is a change that only moves names: swapping two arguments, or reading a different variable where another one was read."
  - `crypto/src/Identity.ts` (06:30:43) hashes `sourceShape(source)` in place of the raw source. Tests: `Identity.test.ts`, `Identity.security.test.ts` (06:30:53) and `sourceShape.test.ts` (06:33:13). `plan/src/internal/node.ts` and `plan/test/Node.test.ts` changed at 06:33:34 to 06:33:41.
  - No run of `PlanIdentityAcrossBuilds.test.ts` is on record since its two scenarios were added at 06:21. `engine-store/src/internal/ExitEncoding.ts` is unchanged since 2026-09-29, so keeping `plan_changed` in stored failures hasn't started.
- **06:37:21 on 2026-10-20, the lead to Will:** "that agent's new code identity treated a function with two arguments swapped as unchanged, so a parked run could resume on changed logic. It must now keep track of where each name is used."
- 06:44 to 06:51 on 2026-10-20, scratchpad `shape/`: a library-sized entry bundled with esbuild, Rolldown and Terser (`out/lib-*.mjs`), and probes (`conflate.mjs`, `probe.mjs`, `probe2.mjs`, `proto.txt`).
- 06:52 to 07:04 on 2026-10-20, on disk, unreported:
  - **The identity:** `crypto/src/internal/sourceShape.ts` (07:03:53) now renames "every binding by the order it is declared in", resolving each use through the scopes it is read in, because "Oxc and Terser also reuse one short name for unrelated bindings in nested scopes, so no renaming by order of appearance agrees between two builds". "So swapping two parameters' or two locals' uses changes the shape." What it still can't see: "`f(a, b)` and `f(b, a)` read the same when `a` and `b` are declared outside the function, because a minifier may give them each other's names." A misread makes two builds of one callback differ, "which a resume refuses, rather than two different callbacks read alike".
  - **The readable failure:** `flow/src/internal/InterpreterError.ts` (06:52) and `flow/src/Interpreter.ts` (07:03:58) add `refusalCode(cause)`, the `InterpreterError` code a run ended with, read in the process that drove it or from the stored result. So "an application closes what the run was feeding, such as an answer still streaming". A failure stored before results kept the code answers `plan_changed` when its message matches. Docs: `flow/docs/reference/flow.md` (07:03:38).
  - `engine-store/test/PlanIdentityAcrossBuilds.test.ts` changed at 07:04:24.
- Scratchpad `shape/engine-store-matrix.log` (last written 07:08:15): the `engine-store` storage matrix, SQLite from 06:55:56 then Postgres: 410 files and 4,238 tests passed at 100% coverage, exit 0, `minified` and `minified-edited` among them. It started before the 07:03 to 07:04 edits, so it doesn't prove them. 07:13:45: `docs:sync` wrote the site's `llms.txt` (scratchpad `shape/docs-sync.log`).
- By 07:20, not yet: no `apps/mvp` file reads `plan_changed`, so the app doesn't settle such an answer; no report.
- 07:26:33 on 2026-10-20: changeset `plan-identity-survives-minification.md`: `@smthrs/crypto` major, `@smthrs/flow` minor, `@smthrs/plan` and `@smthrs/engine-store` patches.
  - **The identity:** `FunctionIdentity.resumeDigest` replaces `sourceDigest`. It hashes a callback's shape (every binding renamed by the order it is declared in, each use resolved through its scopes) plus its captures. A cache still keys on exact source.
  - **Why shape, not a position plus `version`:** "Position needs an author to bump a version for every logic edit, or a changed callback resumes silently."
  - **The check:** "Across esbuild, Rolldown's Oxc and Terser, every one of 932 `effect` functions kept its shape when unrelated code renamed it; Terser alone changed 3 by inlining differently."
  - **Limits:** a swap of two outer bindings stays unseen; a bound or native function refuses every resume; a run parked by an earlier release refuses its first resume once.
  - **The failure code:** `Flow.Result` keeps the `InterpreterError` defect whole, and `Interpreter.refusalCode(cause)` reads it, including `plan_changed` from failures stored before.
- **07:27:56 on 2026-10-20, the lead to Will: done.** "a run parked under one minified build resumes under the next, while a one-character logic change is still refused." "across 932 functions built twice, esbuild and Oxc, the minifiers our builds use, gave every function the same identity." "A refused run now also records why, so the app can mark the affected answer failed instead of leaving it streaming. I sent that change to the chat agent; it will also close answers already stuck."
- 07:32:06 to 07:35:24 on disk, the client Fable fix agent: `src/features/agent/close.ts`, a `chat/Close` flow that settles the answer failed (`unfinished`); `src/flows/dispatch.ts` reads `Interpreter.refusalCode`; a `chat.test.ts` case, "a run the engine refused because the app changed under it (plan_changed) has its answer closed, failed". Tracked in [durable answering](durable-answering.md).
- Round 1 of [land to main](land-to-main.md) (`bba8df6fab`, the 05:58 snapshot) doesn't include this work; it lands in round 2. The release API baseline needs recording again for `resumeDigest` and `refusalCode` (scratchpad `final/WIRING.md`, "Release API baseline"; [API baseline](api-baseline-rerecord.md)).
- **Status moved from in-progress to done** at the lead's 07:27:56 report.
- **13:04:55 on 2026-10-20: landed on `main`** in round 2 as `f311acf8b2` "🐛 fix(flow): plan identity survives minified builds; a plan_changed refusal keeps its code", with the changeset `plan-identity-survives-minification` ([land to main](land-to-main.md)).

## Next

From 13:04 on 2026-10-20: none for the SDK; it's on `main`. The app's side stays with [durable answering](durable-answering.md), and the baseline with [API baseline](api-baseline-rerecord.md).

Until 13:04 on 2026-10-20 the next step was: None for the SDK. From 07:28 on 2026-10-20 the app's side belongs to the client Fable fix agent ([durable answering](durable-answering.md)); the baseline is recorded again under [API baseline](api-baseline-rerecord.md); the change lands in round 2 ([land to main](land-to-main.md)).

Until 07:27 on 2026-10-20 the next step was, from 07:04 on 2026-10-20: the agent's report: the minified reproduction failing first, swapped parameters refused, `refusalCode` reading old and new failures, and `apps/mvp` settling a `plan_changed` answer, with a dev proof across a minified rebuild ([durable answering](durable-answering.md)).

Until 07:04 on 2026-10-20 the next step was: The agent's report, in at most 8 lines: the minified-build reproduction failing first, the chosen identity scheme and why, a real logic change still refused, the code kept in stored failures with older failures still readable, and how `apps/mvp` settles the stuck answer. Then the app change and a dev proof across a minified rebuild ([durable answering](durable-answering.md)). The Fable review, running since about 05:54, sees this work only if it lands before the review ends ([code reviews](code-reviews.md)).

## Questions for Will

None. Open for the lead, not Will:
- Which identity scheme: a normalized source hash, or a declared position plus an explicit `version`? (06:25:59 on 2026-10-20, on disk: a normalized source hash with every binding name erased. 07:26:33, the changeset: the shape, bindings renamed by declaration order with scopes resolved, chosen over a position plus `version`.)
- Is that hash's blind spot acceptable? An edit that only swaps two arguments, or reads a different variable, keeps the same identity, so a parked run resumes on changed logic instead of failing `plan_changed`. (06:37:21 on 2026-10-20, the lead: no; track where each name is used. On disk at 07:03:53: swapped parameters and locals now change the identity; swapped bindings declared outside the callback still don't.)
- Does the app settle a `plan_changed` answer in its own answer flow, or through a generic engine hook every app can use? (On disk at 07:03:58: a generic `refusalCode` in `@smthrs/flow`; the app's use isn't written yet. 07:33:17 on disk: the app reads it in `src/flows/dispatch.ts` and closes the answer with its own `chat/Close` flow.)
