---
title: Timeline rail beside the conversation
status: in-progress
area: app
owner: codex-timeline-feedback
updated: 2026-10-20
links: [old-app-feature-gaps.md, conversations-and-history.md, notifications-and-live-work.md, model-endpoint.md, ../decisions/0009-notifications-and-live-work.md, everything-is-a-plugin.md, ../rulings.md]
---

## Current specification — 2026-10-20, 19:44 PDT

**What:** Keep a quiet conversation map with richer hover/focus details and mobile disclosure.

**Why:** Will’s 19:38 review says the rail must remain secondary to chat and be one click away on mobile.

**Current state:** The lead reports the first build finished at 19:38. The execution owner records a passing browser journey, 14 logic tests at full coverage, and media receipts. The 19:58 owner entry records quieter styling and responsive disclosure implemented with validation queued. Manifest/PluginHost loading and cross-device summaries remain unbuilt.

**Next step:** Validate the feedback changes and re-record the mock and walkthrough. Show duration and billed cost only when the host provides them; current chat projection lacks those fields.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, approximately 17:44–19:44 PDT; queue answers through 19:38 PDT; rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest Will text and queue answers prevail. Product receipts are lead-reported; tracker validation is the site build. Existing execution ownership is preserved.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:14 PDT

**What:** Elevate the old conversation rail with cached short summaries, live states, keyboard navigation and run details in chat.

**Why:** Will requested the old timeline and careful study of his visual reference.

**Current state:** At 19:10 the lead reports the design/mock in the queue, rail and durable summary steps implemented and branch chat wired. Fourteen logic tests pass at 100% coverage; this is not React or production coverage. The browser test and recording remain queued behind the shared test lock. A cheap summary model role needs configuration; direct wiring is an interim implementation until the plugin host exists.

**Next step:** Finish browser proof and recording, configure the summary model role, and move the contribution onto the public plugin host when available. Retain cost/cache and failure evidence.

**Open questions for Will:** Review the timeline mock when ready; no new blocking product question is reported.

Evidence: latest approximately two hours of user-typed messages and lead text replies extracted by script from session 6253ecf2, through 2026-10-21 02:14:18 UTC; queue answers through 01:57:13 UTC; rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Later Will answers supersede older proposals. Product validation is reported evidence; this pass verifies the site build only. Reconciled by Codex; execution owners retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 18:44 PDT

**What:** Restore and elevate the old chat timeline as a plugin, with cached short summaries, scroll tracking, scrubbing and keyboard jumps.

**Why:** At 18:40 Will explicitly requested the old timeline, thoughtful study of its implementation and visual inspiration from his linked example.

**Current state:** At 18:41 the lead assigned Codex Sol to study Timeline, TimelineZoom, TimelineSummary and ShellRail, inspect the example, produce a design/mock, then build the first slice. No completed design, source study or browser proof is reported. The historical question about waiting for several conversations is superseded by this request.

**Next step:** Study old entry selection, 3–8-word summaries and caching, grouping, scroll sync and keyboard behavior. Verify what the reference actually shows (https://x.com/eliakuratli/status/2112614855484358982?s=20); document inaccessible evidence honestly. Produce a mock covering live answers, waiting questions and failures, then implement the summary flow and shared rail with browser tests and a recording. Summaries use durable model steps with stated cost and cache identity.

**Open questions for Will:** None.

Evidence: user-typed text and lead replies extracted by script from session 6253ecf2 for 23:45–01:44 UTC (16:45–18:44 PDT); queue answers through 18:30 PDT; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest words and queue answers supersede older plans. Product receipts are reported by the lead; this tracker verifies only the maintainer-site build.

## Earlier tracker history (retained)


## What

A rail beside a long conversation, one short line per entry, to find your place and jump.

Old app (`apps/app/src/mainview/Timeline.tsx`, `TimelineZoom.ts`, `TimelineSummary.ts`, `ShellRail.tsx`):
- One line per entry, with a 3- to 8-word summary written by the fast model ("Switch to dark mode", "Quickstart opened").
- Live entries pulse, Needs you is gold, failures are ember.
- A band marks the entries on screen; clicking a line scrolls to it.
- Past 60 entries, distant lines fold into groups ("12 entries · 11:48 – 12:05") with summaries of their own.
- Shown on desktop only, at 1180 px and up.
- The rail's home line reads "<repo> · N need you · M working".
- Journey: `apps/app/e2e/real/timeline.spec.ts`.

Spec mvp.md §6.4, Timeline (Will).

Already planned, so not part of this gap: decision 0009 names "the timeline (later)" as one view of its notification rows, and its §4 covers the edges that show live work scrolled out of view.

Not planned: the rail, the summaries and the folding.

## Why

`main`'s shared conversation is long (spec §6.4). Without the rail, a person scrolls to find where they left off.

## How it fits

- Summaries: one fast-model `ModelStep` per entry, through the model endpoint under a `summary` role ([model endpoint](model-endpoint.md)), stored as rows that sync to every device.
- Folding is a pure function of entries and the visible band.
- An `@smthrs/ui` component, desktop only.

## Size

L.

## Questions for Will

- Build it after [several conversations](conversations-and-history.md)? It pays off only once conversations are long and shared. Recommended: yes, after.

## 2026-10-20 · elevated timeline slice

Owner: codex-timeline. Request: Will via lead at 18:55; no commit, shared checkout.
Design: [DESIGN.md](../design/timeline/DESIGN.md), [Paper mock](../design/timeline/timeline.html) (opened).
Inspected the old rail, zoom/title seams, summary admission/backfill/metering, and the public reference video's contact sheet.
Added public UI rail/slot, compiled first-party contribution, separate durable summary flow and content-keyed device projection; summary model role requires explicit configuration.
Validation so far: 3 summary contract tests passed locally and on mini; 2 UI helper/render tests passed locally; 3 real-engine replay/failure tests passed on mini. Initial registry failures revealed stale enumerated lists; updated them. Mini typecheck exposed and fixed a captured FlowDispatch requirement and test stream types.
Still running: final typecheck/tests and the queued mini e2e/video. No 100% coverage or production e2e receipt yet. Shared cross-device summary storage and Manifest/PluginHost loading remain outside the implemented slice; see design for exact boundaries.

Additional receipt: real-engine/TanStack projection integration passes locally and on mini (unchanged caching, changed-entry refresh, streaming/empty suppression). First measured timeline logic coverage: 96.15% lines, 88.88% branches; added faulty-service and stale-result cases and rerunning.

Mini receipt: all 14 timeline tests passed with 100% statements, branches, functions and lines over the five timeline logic modules (flow, identity, steps, store, view). This does not measure React component coverage, the model-role migration or production e2e. Typecheck reported no timeline findings after fixing the test host types.

UI receipt: 3 tests / 29 assertions pass (real React mount, keyboard focus/jump/Escape). Optional model-role endpoint tests added; first mini transfer failed before execution and was retried. Narrow branch side panes hide the rail to preserve the code view.

Model endpoint receipt: both summary-role tests pass on mini, proving an absent setting refuses without calling the default model, and an explicit setting reaches the real metered proxy/provider path. `pnpm docs:sync` completed, durable run-313. `docs:check` remains queued on the heavy lock.

First browser run failed before rail assertions: the chat/Answer flow did not produce its first answer; browser recorded a run-credential warning and `Unknown mutation function: text-update`. Timeline summary runs did complete. Updated the rail journey to seed asks/answers through the real public API (the existing local-first-conflicts pattern), independently of the agent-answer journey; no request interception or fake backend. The runner initially copied that trace to mini-farm/results/slot1/test-results; the next shared slot run overwrote it. The failure summary is retained in this note and the tool receipt.

Documentation receipt: `pnpm docs:check` passed all 51 published-package tarballs; durable run-317 completed. UI now has 4 passing tests / 34 assertions, including precise pending/failure labels by entry kind. Revised real-API-seeded browser journey remains queued on the mini.

## Final slice receipts

- Mini e2e `timeline.spec.ts`: passed in 24.3s, real public question/answer API + Postgres/Electric + browser durable engine; scripted model is the sole seam. Covers long history, summary arrival, fixed transcript width / 34px rail rows, Home/Down/End jumps, viewport band, phone hiding.
- Media checks: passed. MP4 `/Users/williamcory/Desktop/smithers-mvp/videos/timeline/conversation-timeline.mp4`; GIF `/Users/williamcory/Desktop/smithers-mvp/gifs/timeline-conversation-timeline.gif` (5 chapters). Stable test receipt copy: scratchpad/timeline-validation.
- Latest mini logic suite: 14 tests pass, 100% lines/branches/functions/statements over the five timeline logic modules. Registry: 13 pass. Real metered summary endpoint: 2 pass. UI: 4 pass / 34 assertions.
- `pnpm docs:sync`: completed run-313. `pnpm docs:check`: completed run-317; all 51 published tarballs passed. No commit made.
- The original agent-answer browser setup failed before rail assertions, with credential/outbox errors; the passing rail journey uses the same real API seeding pattern as local-first-conflicts. This is not a claim that the chat/Answer issue is fixed.
- Design review remains open. The public rail slot and compiled first-party contribution are built; Manifest/PluginHost loading and shared cross-device summaries are not built. No production e2e or live-dollar claim. Progressive folding and drag-preview stay in design review.

## 2026-10-20 · 19:58 design feedback

Owner: codex-timeline-feedback; in progress, shared checkout, no commit. Implemented quieter margin styling, hover/focus evidence and closed-by-default responsive disclosure. Updated mock/screenshots and browser regression journey; mini validation queued. Library catalog: @smthrs/ui. Per-step duration and billed cost remain unavailable in the current chat projection; the shared component accepts them when a host supplies them.

Feedback validation: 6 UI tests / 50 assertions pass. Projection: 2 tests pass at 100% lines/branches/functions/statements for view.ts (targeted scope, not whole-app coverage). Standalone Chromium confirms desktop keyboard preview and mobile closed/open behavior. Eight mock screenshots captured and inspected. docs:sync completed run-321; mini e2e and locked docs:check remain queued. An initial single-file vitest invocation passed its assertions but failed the global coverage gate because it selected the whole app; the subsequent module-scoped coverage run passed without changing thresholds.
