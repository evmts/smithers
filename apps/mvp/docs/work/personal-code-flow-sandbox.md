---
title: Run hand-edited personal flows in a sandbox
status: in-progress
area: app
owner: Opus hand-edited-flows builder on Mac mini assigned by lead
updated: 2026-10-21 21:10 PDT
links: [flow-authoring.md, prompt-flows-are-code-flows.md, sandboxes.md, everything-is-a-plugin.md, ../decisions/0017-everything-is-a-plugin.md, ../rulings.md]
---

## Current specification

**2026-10-21:** The [FLOW-2 addendum](../rulings.md#10-flows) now records Will's answer to decision 0017 question 2, "quickjs is a sandbox". The next step is the QuickJS realm flow host ([decision 0017](../decisions/0017-everything-is-a-plugin.md), slice 5), after the [2026-10-21 flows fixes](flow-authoring.md#current-specification) land. Hand-edited source still saves but cannot run; keep the `FlowNeedsSandbox` refusal until the host passes execution, isolation, cancellation and durable recovery checks (`src/features/flows-ui/steps.ts`, `src/features/flows-ui/flows.test.ts`).

## Earlier tracker history (retained)

## Specification — 2026-10-20, 18:55 PDT
## Tracker reconciliation — 2026-10-21 21:10 PDT
**What:** Run hand-edited personal flows inside the declared sandbox.
**Why:** Editing code must produce an executable flow through the public interface.
**Current state:** At 21:06 the lead starts an Opus builder on the mini specifically for hand-edited flows. No implementation or test completion is reported.
**Next step:** Implement and prove edit/save/run and sandbox failure paths with the existing durable flow layer.
**Open questions for Will:** None.
Evidence: script-filtered user text and lead replies, 19:06–21:06 PDT; current rulings and queue answers through 21:06; surviving briefs and reports. Product results are reported receipts, not rerun here. Implementation ownership retained; Codex curates documentation. Wiped scratch files are not missing work.
## Current specification — 2026-10-20, 18:55 PDT

**What:** Run hand-edited Flow.make code in QuickJS through the shared plugin execution contract.

**Why:** Will settled that QuickJS is a sandbox; personal flows need no new placement decision.

**Current state:** The extra Astra/Fable design review is complete and decision 0017 is ready to build. Slice 0 run credentials started at 17:56; authored-flow execution has no completion receipt. The old Fable-review prerequisite is satisfied; credential enforcement and implementation remain.

**Next step:** Complete the shared execution slice after its credential prerequisite. Prove isolation, cancellation and durable recovery; use containers for work requiring a real machine. Preserve the existing truthful refusal until execution passes.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies from the latest two transcript hours, through 2026-10-21 01:54:51 UTC (18:54 PDT); queue answers through 01:30:17 UTC; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later words and queue answers supersede historical proposals. Product tests are lead-reported; this tracker runs only the maintainer-site build. Execution ownership is retained; reconciliation by Codex.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:14 PDT

**What:** Run hand-edited Flow.make code safely in QuickJS through the shared plugin/flow execution contract.

**Why:** QuickJS is a sandbox; authored flows must use the same durable model.

**Current state:** Will answered the placement question at 17:05: “quickjs is a sandbox”. The lead explicitly removed the product-decision blocker and plans this slice after Fable review. Edited code still saves but does not execute; the current “Needs a sandbox” refusal remains truthful until implementation passes.

**Next step:** Implement QuickJS execution as the reviewed 0017 slice; prove isolation, execution, cancellation and recovery. Use containers only when real machine capabilities are required.

**Open questions for Will:** None.

Evidence: script-extracted human text and lead replies from session 6253ecf2, latest two hours through 2026-10-21 00:13:56 UTC; queue answers through 00:06:34 UTC; current rulings, decisions, proposals and shared briefs. Queue answers supersede older design proposals. Test results are lead-reported; this tracker runs the site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 17:05 PDT

**What:** Execute hand-edited Flow.make source safely through the SDK sandbox host.

**Why:** One flow model needs a safe execution host for authored code.

**Current state:** Edited code still saves but cannot run (“Needs a sandbox”). The previous wait for overall plugin-design approval is superseded by Will’s approval; he also requested extra Fable/Astra review. No explicit answer to the separate placement item or safe-execution receipt is available.

**Next step:** Resolve placement in the approved design’s review follow-up, then connect the SDK sandbox host and prove execution, isolation, cancellation and recovery. Keep the current refusal until it works.

**Open questions for Will:** The separate sandbox-only versus device QuickJS question has no individual queue answer. The lead should reconcile it with the approved merged design before execution is enabled.

Evidence: queue answer `design:plugins-merged@1f45`, 2026-10-21 00:03:52 UTC, and the lead's 17:05 PDT `PLUGIN-REVIEW-BRIEF.md`. Will's latest answer outranks the older proposed-status wording in decision 0017. Review and implementation completion are not inferred.

## Earlier tracker history (retained)


## What

Run a person's edited Flow.make source through a safe sandbox host and the same run page used by drafted flows. Use the existing flow graph; extend the SDK host rather than adding an app runtime.

## Why

FLOW-2 requires one model; DUR-3 and SDK-1 require the SDK host. Saving source alone does not make edited flows executable.

## Current state

At 16:36 PDT on 2026-10-20 the lead confirmed edited code saves but shows “Needs a sandbox” and cannot run. Drafted modules already run on the device. Branch sandboxes exist, but their existence does not prove an authored-flow execution host. The lead explicitly waits on decision 0017's sandbox question before this slice.

## Next step

After the placement decision, connect authored source to the SDK sandbox host; prove execution, isolation, cancellation and recovery through real browser runs, with chaptered recordings. Preserve the current refusal until safe execution works.

## Open questions for Will

Decision 0017 Q2: repository/personal code only in a sandbox for now (recommended), or also in a device QuickJS realm? The single Flow.make model is already settled.

## History

2026-10-20 16:36 PDT: lead separated the completed source migration from the missing edited-code execution capability. Evidence: script-extracted lead text in session 6253ecf2. No approval inferred from panel recommendations or the unchanged queue answer log.
