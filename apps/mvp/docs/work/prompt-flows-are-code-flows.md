---
title: Prompt flows are code flows (one flow model for personal flows)
status: done
area: app
owner: flow unification builder
updated: 2026-10-20
links: [flow-authoring.md, flow-debugging.md, flows-and-agent.md, everything-is-a-durable-flow.md, smithers-playground.md, decisions-for-will.md, docs-truth-pass.md, ../decisions/0014-flows-authoring-debugging-and-home-view.md, ../decisions/0003-flows-and-the-agent.md]
---

## Current specification — 2026-10-20, 16:44 PDT

**What:** Represent prompt-authored flows as real Flow.make source using the existing graph and execution path.

**Why:** FLOW-2 forbids a second prompt-only runtime or graph.

**Current state:** The 16:36 lead update confirms the source migration and shared run path; both flows browser tests pass. Source editing saves correctly. Arbitrary edited code is explicitly refused pending sandbox execution; that separate capability is not claimed complete. No new landing receipt was reported in the extracted window.

**Next step:** Land the finished migration with its tests and recordings; track edited-code execution in personal-code-flow-sandbox.md.

**Open questions for Will:** The plugin sandbox-placement question remains open for the separate execution workstream.

Evidence: user-typed text and lead text replies extracted by script for 21:43–23:43 UTC from session 6253ecf2; rulings and queue answers override older briefs. Product receipts above are reported by the lead; this tracker ran only the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 15:44 PDT

**What:** Use one Flow.make source model for prompt-authored and code-authored personal and repository flows.

**Why:** FLOW-2 explicitly rejects a second prompt-only graph or runtime.

**Current state:** The current note’s 15:30 builder receipt reports source generation, flow/read and flow/write, the code editor, ModuleFlow.fromModule, removal of the SKILL.md implementation, and migration 0025 on the dev database. This supersedes the earlier “no completed migration receipt” summary. The drafted source runs on device; hand-edited code is saved but refused with FlowNeedsSandbox until safe execution exists. The remaining browser-test/landing receipt is not reported.

**Next step:** Run both flows browser journeys, retain their recordings and obtain the landing receipt.

**Open questions for Will:** None; one flow model is already ruled.

Evidence: user-typed text and lead replies extracted from session 6253ecf2’s latest two hours through 22:43:59 UTC; current rulings, queue answers, shared briefs/designs, decisions, proposals, TODOs and rules. These are reported receipts; this tracker ran no product tests. Later rulings supersede older briefs.

## Earlier tracker history


## Current specification — 2026-10-20, 15:24 PDT

**What:** Use one Flow.make model for prompt-authored and code-authored flows.

**Why:** Will’s 14:26:24 queue ruling rejects a separate prompt-only flow model (FLOW-2).

**Current state:** Decision 0014 is amended for one flow model. The builder was assigned at 14:27; no completed migration/test receipt appears through 15:23. Panel P also requires config to bind flows without introducing a second graph.

**Next step:** Finish the single-model migration and tests; retain a truthful refusal where a safe host for personal code is unavailable.

**Open questions for Will:** None; prompt-only as a separate model is already rejected.

Evidence: Will’s typed messages and lead text replies, extracted from session `6253ecf2` for its latest two hours through 15:23:55 PDT; [rulings](../rulings.md), queue answers through 14:36 PDT, shared briefs/designs and current decisions, proposals, TODOs and rules. Receipts above are reported, not fresh product tests run by this tracker.

## Earlier tracker history


## What

One flow model. A person's own flow is a code flow built with `Flow.make` from `@smthrs/flow`, like a repository's flow. A "prompt flow" is just a code flow drafted from a prompt.

```
"make me a flow that …" ──▶ agent drafts ──▶ flow source (Flow.make("<tag>", { … }))
                                                │  open · edit · run · inspect, like any flow
                                                ▼
                             hand-edited personal code ──▶ refused, reason shown,
                                                           until a host can run it safely
```

What changes from decision 0014: §1 and §2 split authored flows into prompt flows (`SKILL.md` data the trusted agent loop reads, stored in Postgres, synced to the person's devices) and code flows (`flow.ts`, repositories only, sandbox only). That split goes.

## Why

**14:26:24 on 2026-10-20, Will (queue, on "Your own flows are prompt flows; code flows live in repos"):** "No everything is a flow this ruling is clear prompt flows are just a type of code flow"

It reverses 0014 Q1's recommended yes, which the lead had built on since 13:32:34 when Will left it unanswered. Will's 13:31:14 bar applies: flows are "the most important part of oour product and technology and should be supported very very well".

## State

- 13:20:39 on 2026-10-20: the personal prompt flow walking skeleton passed `e2e/flows.spec.ts` (draft, save, run, run page, Stop, Retry; [flow authoring](flow-authoring.md)).
- **14:26:24: Will's ruling** (above).
- **14:27:52, the lead to Will:** "an agent is merging the two into one flow model, built with `Flow.make` from `@smthrs/flow`. A flow drafted from a prompt is saved as flow source you can open, edit and run like any other flow. Hand-edited personal code stays refused, with the reason shown, until a host can run it safely."
- 14:30, the lead: "An agent is unifying personal flows into code flows."
- **15:30 on 2026-10-20: built, one flow model.**
  - A person's flow is stored as `flow.ts` source: `Flow.make("<name>", { description, capabilities, flows, payload, success, error, body })` with one typed agent step `<name>/agent` (`renderSource`, `src/features/flows-ui/source.ts`). It type-checks against `@smthrs/flow` and `@smthrs/agent` in a unit test.
  - Drafting writes that module; `flow/read` and `flow/write` read and save its code; `/app/flows/code/<name>` (Code on the Flows page) edits it.
  - Placement is read from the bytes: the drafted module as drafted runs on the device through the same `flow/run` path and run page; any other code is `sandbox`, saved but refused `FlowNeedsSandbox` before anything runs, and the Flows page says `Needs a sandbox` with Run off.
  - One parser: `@smthrs/registry`'s new `ModuleFlow.fromModule` (Discovery reads every `flow.ts` through it); `SKILL.md` code deleted (`skill.ts`).
  - Migration `0025_flow_source`: `flows.placement`; every stored `SKILL.md` revision and draft converted, digests recomputed. It already ran on the dev database: 3 revisions and 4 drafts converted, digests verified.
  - Decision 0014 §1, §2, the checks, `flow/run`, Q1 and the appendix rewritten; `docs/features/flows.md` and `docs/rulings.md` FLOW-2 updated.

- **16:23 on 2026-10-20: `e2e/flows.spec.ts` passed, both tests (4.4 min)** on the dev server with the real model. GIFs: `~/Desktop/smithers-mvp/gifs/flows-flows-draft-a-flow-from-a-prompt-open-its-code-run-it-relabe.gif` and `flows-flows-draft-a-flow-save-it-run-it-watch-its-run-page-then-st.gif`. The 15:57 run had failed: the new test matched the module's own comment ("other code needs a sandbox") as page text, now an exact match; the old test's Retry stalled while other agents' edits reloaded the page and the model took about 20 s a call.
- Unit: `@smthrs/registry` 1,214 tests at 100%; the flows feature, its route and 0025 at 100% of branches and lines.

## Next

From 16:23 on 2026-10-20: the lander commits. A host that runs a person's own code (0005's job sandbox, decision 0014 L2) lifts the `FlowNeedsSandbox` limit.

## Questions for Will

None. Open best guess, not asked: a hand-edited personal code flow is refused, with the reason shown, until a sandbox or other host can run it safely (the lead, 14:27:52).
