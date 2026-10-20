---
title: Debugging and monitoring flows (run list, run page, retry, cancel, resume)
status: in-progress
area: app
owner: repository home builder (started about 13:09 on 2026-10-20), which runs `e2e/flows.spec.ts` (draft, save, run, run page, Stop, Retry) before building the home view; its first run failed at 13:12:56. Until 13:09: 0014's builder, which reported the run page built at 13:05 on 2026-10-20 (relayed by the lead at 13:09:31), less a passing e2e. Until 13:05: 0014's builder; `e2e/flows.spec.ts` on disk at 12:10:42 on 2026-10-20 and the flows and runs feature docs rewritten at 12:35 to 12:37; no recorded e2e run, GIF or report by 12:45. Until 12:10: 0014's builder, not stopped by either weekly limit (the lead, 11:42:48 on 2026-10-20); `src/features/flows-ui/` and `src/features/runs/` with tests on disk to 11:50; no e2e and unreported by 11:55. Until 11:42: 0014's builder, resumed by the lead at 10:42 on 2026-10-20 from where it stopped (the Claude usage limit stopped it from about 08:15 to 10:40); unreported by 10:44. Until 10:42: 0014's builder, the walking skeleton from 07:30:21 on 2026-10-20 (the lead to Will); nothing on disk by 07:37; unreported. Until 07:30: Panel F; decision 0014 written 07:02:13 on 2026-10-20 (status: proposed); no builder yet. Until 07:02: Panel F (Opus merges into decision 0014; started 06:42:06 on 2026-10-20). Sol's design done 06:43; Opus's independent design written 06:56:49
updated: 2026-10-20
links: [review-round-4.md, land-to-main.md, ../decisions/0014-flows-authoring-debugging-and-home-view.md, flow-authoring.md, agent-status.md, notifications-and-live-work.md, durable-browser-engine.md, cloudflare-flow-host.md, observability.md, timeline-rail.md, old-app-feature-gaps.md, decisions-for-will.md, ../decisions/0009-notifications-and-live-work.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../proposals/mvp-gaps.md, dev-stack-hygiene.md, review-round-4-p3-cleanup.md]
---

## What

See every flow run, open one, and understand it: its journal and timeline, each step's input and output (content-safe), waits, failures and retries. Retry, cancel and resume from the UI.

```
/owner/repo/runs                       /owner/repo/runs/<id>
┌ flow ▾  status ▾ ─────────────┐      ┌ issue-triage · ● waiting ─── [Resume] [Cancel] ┐
│ ● triage     waiting   2m     │ ──▶  │ Timeline │ Journal                             │
│ ✕ flow.new   failed    9m     │      │ 1 decide   ✓  0.8 s                            │
│ ✓ theme/set  done      12m    │      │ 2 apply    ⏸ waiting on "approve" since 2m      │
└───────────────────────────────┘      │ step value: { decision: "accept" } (bounded)   │
                                       └────────────────────────────────────────────────┘
```

**Decided in 0014 (07:02, proposed), decisions 6 to 9:**
- **The run page reads the engine that holds the journal.** A run on this device through a new `BrowserEngine.inspect` request; a Cloudflare run through `GET /api/runs/:id/trace` over `smithers_flows`. Both use one SDK reader, `RunInspection` in `@smthrs/engine-store`, and one fold, `@smthrs/gateway`'s `RunTrace`. No journal is copied into Postgres.
- **The run list is 0009's `runs` rows,** with this device's engine runs merged in by id, so your own runs show offline and before they sync.
- **Step values are content.** Only people who may read the run see them; every value passes `@smthrs/journal`'s `Redaction`, `Redacted` fields never leave, provider error text and headers become closed codes, and each value is clipped to 16 KiB.
- **Four acts:** `run/cancel` (live), `run/retry` (a new linked run, pinned or current version), `run/resume` (a run no host drives; a durable timer is never skipped) and `run/answer` (0009). Cancel and Resume carry the row's `seq`; a stale one is refused. An act on another device's run becomes a 0009 `run_commands` row and reads `Stopping` until it settles.
- **Build:** the skeleton's first two steps are `RunInspection` with `inspect` and `list` on `BrowserEngine`, then `/app/runs` and the run page over the local engine with cancel and retry. One run list across devices and Cloudflare (L4) waits for 0009 phase 1.

The best guess before 0014, from Sol's design (scratchpad `final/panel-f-sol.md`):
- **One run list.** It reuses 0009's `runs`, `run_commands`, projections and Electric shapes. No second index.
- **Journals stay on their engines.** The browser engine's SQLite (OPFS) and the server and Cloudflare engines' Postgres stay authoritative. The run page reads bounded, sanitized pages from the owning host through one SDK projection contract. Raw journals are never copied into Electric.
- **Run page:** status and permitted controls, Timeline and Journal tabs, the selected step's input and output, and the flow's declared view. Waits show name and since; retries show attempts and the next retry time; tokens and cost when recorded. Read-only scrubbing picks a journal position and never rewinds anything. Unobserved paths show as unknown, never invented.
- **Controls:** `run/Cancel`, `run/Retry` (pinned version, or "current" as a linked new run after confirmation) and `run/Resume` (a parked run with its typed answer). `runs/list` and `runs/inspect` read. A browser-hosted run's commands queue until its browser returns.
- **SDK gap:** the browser engine exposes result, cancel and signal, not full read and resume (`BrowserEngine.ts:146-159`). Those go into the control and browser host APIs, not the app.
- **New `@smthrs/ui` components:** `RunTimeline`, `JournalList`, `StepValue` and `FlowVersionPicker`, reusing 0009's planned `RunCard` and `RunProgress`.

The person-facing layer, "what's the agent doing, does it need me", is [agent status](agent-status.md) (decision 0015). This note is the deep inspection behind it.

## Why

Will, 06:39:05 on 2026-10-20: "Stuff related to flows debugging flows creting flows which wasn't listed is another one."

Planned before in parts: 0009's run index and run card ([notifications and live work](notifications-and-live-work.md)), and `mvp-gaps.md` items 4 and 11 (the run monitor and read-only replay). No note designed a run page that reads the journals. The old app had a runs inbox, run card, trace card and run graph (`apps/app/src/mainview/cards/RunsCards.tsx`, `cards/RunTraceCard.tsx`, `cards/FlowRunGraph.tsx`).

## State

- 06:39:05 on 2026-10-20: Will's priority. 06:42:06: the lead started Panel F's Opus member and merger.
- 06:43: Sol's design finished (exit 0), with run inspection as decision 7. It names no question for Will.
- By 06:55: `0014-flows-authoring-debugging-and-home-view.md` isn't written.
- 06:56:49: Opus's design written. **07:02:13: decision 0014 written (status: proposed).** Its one question for Will is about personal flows ([flow authoring](flow-authoring.md)); none is about debugging.
- **07:30:21 on 2026-10-20, Panel F done; the lead to Will:** "The flows design is done (decision 0014), and building its first slice has started." "**Runs:** a run list and a run page showing each step, waits and failures, with Stop, Retry, Resume and Answer buttons." The run reads, `/app/runs` and the run page are the skeleton's first two steps.
- By 07:37: no slice file on disk (no `RunInspection` in `@smthrs/engine-store`, no `src/features/runs/`).
- **Status moved from designing to in-progress** at the 07:30:21 start.
- 07:56:11 to 08:05:14 on 2026-10-20, on disk, unreported:
  - **Skeleton step 1:** `RunInspection` in `@smthrs/engine-store` with its test, and run reads on `BrowserEngine` (`test/RunReads.test.ts`); changesets `engine-store-run-inspection` and `browser-engine-run-reads`.
  - **Step 2's flows:** `src/features/runs/flows.ts` (07:58:48) declares `run/cancel`, `run/retry`, `run/resume`, `run/list` and `run/inspect`. `seq` is the last journal sequence the page read, so Resume on a run that moved since is refused `stale`.
  - No `/app/runs` screen under `src/screens/` yet; no e2e or report.
- Kept out of landing round 2 at 07:53:57 as still in flight ([land to main](land-to-main.md)).
- 08:06:41 to 08:10:57 on 2026-10-20, on disk: `@smthrs/engine-store` `DurableEngineState.ts` (08:06:41), `RunInspection.ts` (08:08:37) and a new `test/ReadTransactionLock.test.ts` (08:09:35); `src/features/runs/contract.ts` (08:10:57).
- **About 08:15 to 10:40 on 2026-10-20: the Claude usage limit stopped the builder;** the lead resumed it at 10:42 from where it stopped ([flow authoring](flow-authoring.md)). No `/app/runs` screen, e2e or report by 10:44.

- **11:04:02 on 2026-10-20: [review round 4](review-round-4.md)'s R4-22 (P2, Claude Opus P2-11, reproduced by a fork): `RunInspection` releases `Schema.Redacted` step outputs in plaintext.** `packages/smithers/flows/engine-store/src/RunInspection.ts:702` (the attempt outcome through `jsonValue(attempt.outcome_json)`) and `:710` (the step output): the engine's JSON codec stores a `Redacted` as its text, and the redactor catches only credential-shaped keys. An action whose success is `{ note: Schema.Redacted(Schema.String) }` returns a secret; `inspect` returns it as the step output and the attempt outcome while the run's result reads `<redacted>`. The leader broadcasts inspection replies to every tab, and 0014 plans `GET /api/runs/:id/trace` for Members. Contradicts decision 0014 ("never releases a `Redacted` field"). Fix: `RunInspection.layerWith` takes the actions and renders each outcome through its action's success codec, `<unrendered>` for an unknown action; a test in `RunInspection.test.ts`. Unrouted by 11:07.
- Opus P3-13, unrouted: `RunInspection.inspect` reads every attempt and node event with no limit and returns all steps on every page (`:668-679`, `:707-711`), which the leader broadcasts to every tab; `RunInspection.ts:25-29` deep-imports `@smthrs/database/Dialect`, `@smthrs/journal/*` and `@smthrs/run-store/RunStore` (`sdk.root-imports-only`); one failed leadership build disables a tab's engine until reload, even while another tab's worker leads (`platform-browser/src/BrowserEngine.ts:270-277`, `:325-331`).
- Opus's light review: the client features (`runs`, `flows-ui`, `status`) have no `useState`, `useEffect`, hand-rolled retries or `runPromise`; `runs` rows are scoped to the launcher and `launched_by` stays off the shape.
- 11:05 to 11:25 on 2026-10-20, on disk, unreported: `src/features/runs/` (`store.ts`, `actions.ts`, `runs.ts`, `components/RunListView.tsx`, `RunPageView.tsx` and `RunsContext.tsx`, 11:08 to 11:22) and `src/features/flows-ui/` (`store.ts`, `round.ts`, `steps.ts`, `actions.ts`, `flowsUi.ts`, `components/DraftCard.tsx`, `FlowsPage.tsx`, `NewFlowCard.tsx` and `FlowsUiContext.tsx`, 11:16 to 11:22); both `contract.ts` files 11:25:10.
- 11:42:48, the lead: flows wasn't reported stopped by either weekly limit, so it kept running.
- 11:44:47 to 11:50:25: tests `flows-ui/tab.test.ts` (new 11:44:47, changed 11:48:45), `flows-ui/api.test.ts` (new 11:49:40), `runs/page.test.ts` (new 11:50:18) and `flows-ui/flows.test.ts` (11:50:25).
- Not yet by 11:55: a flows e2e (none in `e2e/`), a GIF or a report. R4-22's file `engine-store/src/RunInspection.ts` changed at 11:13:25; no fix on record.
- 11:59 to 12:44 on 2026-10-20, on disk, unreported:
  - **12:10:42: the new `e2e/flows.spec.ts`**, decision 0014's F1 and F7 in a real browser with its own durable engine and the real model, no mocks: draft a prompt flow from `/app/flows`, save it, run it, watch its run page to its answer, then stop a live run and retry it.
  - `src/features/flows-ui/` `callable.ts` and `flows.test.ts` (12:18:58), `faults.test.ts` (12:22:08), `actions.ts` and `api.ts` (12:37:43), `tab.test.ts` (12:37:55).
  - `src/features/runs/` `runs.test.ts` and `store.test.ts` (12:22:08), `actions.ts` (12:30:19), `contract.ts` (12:37:43), `steps.ts` (12:39:48).
  - `docs/features/flows.md` (12:35:17) and `docs/features/runs.md` (12:37:43) rewritten; the shared `src/flows/registry.ts` changed at 12:42:44.
  - `worker/PersonalFlows.ts` and its test changed at 12:18; `save` still marks the draft `saved` with no `status = 'ready'` guard, so round 4's double-save finding stays open. R4-22's `engine-store/src/RunInspection.ts` is unchanged since 11:13:25.
- Not yet by 12:45: a recorded run of `flows.spec.ts` (no video under `test-results/`), a GIF or a report. Status stays `in-progress` until the e2e passes.
- **13:05 on 2026-10-20: 0014's builder reported the run page built** (notification 13:07:56; the lead to Will at 13:09:31: "each run's page shows its steps, timeline and journal, with Stop, Retry and Resume"):
  - `/app/runs/<id>`: Steps, Timeline and Journal tabs; Stop, Retry and Resume.
  - **R4-22 fixed** (Opus P2-11): the SDK run reads release a `Schema.Redacted` value as `<redacted>` and a value that won't decode as `<withheld>` (`engine-store/src/RunInspection.ts`, `withheldMarker`, changed 11:13:25) ([review round 4](review-round-4.md)).
  - **Differs from 0014:** Answer on the run page links to the conversation; the engine records no input for a plain step, only for child runs.
  - 105 tests pass with 100% coverage on new files; its two run-acts timeouts were load and pass in isolation. The e2e couldn't finish on the dev server's spent model budget ([flow authoring](flow-authoring.md), [dev stack hygiene](dev-stack-hygiene.md)).
- 13:13: the lead raised the dev budget to 10,000,000 tokens and restarted the dev server. 13:12:56: the repository home builder's first `flows.spec.ts` run failed before reaching the run page, at the new flow's Run button ([flow authoring](flow-authoring.md)). No passing run by 13:17.

## Next

From 13:09 on 2026-10-20: the repository home builder gets `e2e/flows.spec.ts` passing, including Stop and Retry on the run page, with its GIF. Round 4's `RunInspection` P3s are open and not yet listed in the [P3 cleanup](review-round-4-p3-cleanup.md): `inspect` reads every attempt with no limit, and one deep import is left (`@smthrs/database/Dialect`; `@smthrs/journal` and `@smthrs/run-store` are now root imports). One run list across devices and Cloudflare (L4) waits for 0009 phase 1.

Until 13:09 on 2026-10-20 the next step was, from 11:07 on 2026-10-20: the skeleton as before, and the lead's routing of round 4's R4-22 and the `RunInspection` P3s ([review round 4](review-round-4.md)). R4-22 must hold before `GET /api/runs/:id/trace` ships.

Until 11:07 on 2026-10-20 the next step was, from 07:30 on 2026-10-20: skeleton steps 1 and 2. First `RunInspection` with `inspect` and `list` on `BrowserEngine` (one trace on SQLite and Postgres, redaction, 100% coverage); then `/app/runs` and the run page over the local engine with `run/cancel` and `run/retry`. Resume and Answer follow; one run list across devices and Cloudflare (L4) waits for 0009 phase 1.

Until 07:30 on 2026-10-20 the next step was, from 07:02 on 2026-10-20: the run page is the first two steps of 0014's walking skeleton, which starts after Will answers its question.

Until 07:02 the next step was: Opus merges both designs into 0014. Sol's walking skeleton includes one durable wait with Resume and Cancel, and a failing run with Retry, on the flow the [authoring](flow-authoring.md) slice creates.

## Questions for Will

None for debugging. 0014's one question is on [flow authoring](flow-authoring.md).

Until 07:02: None yet. Panel F sends at most 3 with 0014.
