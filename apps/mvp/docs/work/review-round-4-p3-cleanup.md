---
title: Review round 4 P3 cleanup (one pass after the P1 and P2 fixes land)
status: todo
area: process
owner: unassigned; every P1 and P2 it waited for is reported fixed by 13:42:00 on 2026-10-20, and the lead's landing round 3 (from 13:43:30) fixes the 11 full-suite failures first. Until 13:46: unassigned; the lead starts one cleanup pass after round 4's P1 and P2 fixes land (queued 11:20:44 on 2026-10-20, scratchpad `final/WIRING.md`)
updated: 2026-10-20
links: [review-round-4.md, land-to-main.md, model-endpoint.md, flow-authoring.md, repo-view-branches-raw-clone.md, local-first.md, sign-in.md, durable-answering.md, observability.md, agent-ui-rendering.md, agent-status.md, branch-terminal.md, conversations-and-history.md, flow-debugging.md, import-rules-and-jev-lint.md, one-sqlite-one-leader.md, effect-tanstack-db-and-effect-electric.md, github-source-of-truth.md, issue-sync-ingest-retry-loop.md, flows-and-agent.md, everything-is-a-durable-flow.md, web-standard-globals-rule.md, navigate-flow.md, plan-identity-across-deploys.md, model-step.md, repo-clone-and-view.md, chat-message-controls.md, repo-view-package-split.md, second-build-machine.md]
---

## Current specification — 2026-10-20, 16:24 PDT

**What:** Finish the remaining review findings and fix the agent-driven repository clone regression.

**Why:** A real failing journey is broken under TEST-1, even when direct repository browsing passes.

**Current state:** At 16:02:07 PDT the lead assigned clone-by-the-agent to the cleanup pass after its browser test failed. Branch views and both flows tests also failed and have separate owners. No later clone repair or cleanup completion receipt appears through 16:23 PDT. Earlier review-completion receipts below do not establish that this journey works.

**Next step:** Give the agent-clone failure an explicit implementation owner, reproduce it through the real agent and retain its passing regression test and chaptered recording alongside the remaining cleanup receipts.

**Open questions for Will:** None; the lead assigns ownership and resolves implementation details.

Evidence: lead text replies extracted by script from session 6253ecf2, latest two hours through 23:23:40 UTC; current rulings and queue answers govern. Shared briefs/designs, decisions, proposals, TODOs and rules were consulted. Reported product receipts only; this tracker ran no product tests.

## Prior tracker record (retained)


## What

Fix review round 4's P3 findings in one pass, after the P1 and P2 fixes land, so the two sets of edits don't collide.

```
source                          P3s
Claude Opus (review4-opus.md)    31   items 1-9, plus 4 + 7 + 7 + 4 grouped in items 10-13
Claude Fable (review4-fable.md)  30   P3-1 to P3-8 (app), S-P3-1 to S-P3-22 (SDK)
Codex Astra, Codex Sol            0
total before dedupe             ~61   at least 9 overlap or fold into a P1/P2 row
```

The full grouped list, with each P3's home note, is in [review round 4](review-round-4.md) under "Findings: P3".

Already out of this pass:
- the terminal pump's bare `state.waitUntil` (Fable P3-6, Opus P3-9) went to the branch workspace builder with the P2s at 11:20; on disk at 11:21:44, `worker/BranchSandboxes.ts` no longer calls `waitUntil` ([branch terminal](branch-terminal.md));
- Fable P3-4 folds into R4-17 (unsettled reservations), Fable P3-5 into R4-15 (a Guest posting as the bot), and Opus P3-10's `GitRemote` half into R4-23.
- Opus P3-1 (`chat/Expire` counting from the ask) went to the worker fix agent at 11:55; **fixed**, reported 12:31:22. R4-17, with Fable P3-4, is fixed the same report ([durable answering](durable-answering.md), [model endpoint](model-endpoint.md)).

Notable ones in the pass (`final/WIRING.md`, 11:20:44):
- `admin/SetModel` is dead code the docs present as live; once wired, an Admin can point a provider key at any `https:` origin, so it needs an allowlist (Fable P3-2, Opus P3-6; [model endpoint](model-endpoint.md)).
- Two saves of one draft commit two revisions (Fable P3-3, Opus P3-12; [flow authoring](flow-authoring.md)).
- Anonymous repository reads are unthrottled and spend the 40 GB monthly read budget (Fable P3-1; [repo view extras](repo-view-branches-raw-clone.md)).
- `via` on git writes is the client's claim.
- A boot that must finish a wipe waits forever on a frozen tab (Fable P3-7; [local-first](local-first.md)).
- Docs that contradict the code (Fable P3-8, S-P3-11, S-P3-22).
- Reconcile `SdkRules.ts:93` with the web-standard-globals ruling: Fable S-P2-2 (R4-24) says the ambient `crypto.subtle` "fix" was never made; the lead ruled it allowed at 23:12 on 2026-10-19 ([web-standard globals](web-standard-globals-rule.md)).
- Merge the duplicate "ask the tab that asked" channel in `app/navigate` and `repo/copy` into one `src/flows` helper (lead, 10:52 on 2026-10-20; [navigate](navigate-flow.md), [repo view extras](repo-view-branches-raw-clone.md)).

## Why

Will's rules: zero tech debt, everything durable, docs true to the code. The reviewers' assessments name what's left: "Zero tech debt is not yet true" (Fable); "dead `admin/SetModel`, a duplicated frame handshake and three `GITHUB_REPOSITORY` parsers are the remaining duplicates" (Opus). The lead queued them as one pass at 11:20:50 on 2026-10-20 "so they don't collide" with the P1 and P2 fixes.

## State

- **11:20:44 on 2026-10-20:** scratchpad `final/WIRING.md` gains "Review round 4: P3 cleanup (after the P1 and P2 fixes land)".
- **11:20:50, the lead to Will:** "The roughly 61 P3s are queued as one cleanup pass after these land, so they don't collide."
- No agent has the pass yet. The P1 and P2 owners were stopped by the first account's weekly limit at about 11:30 and the second account's at about 11:35, and resumed by 11:42:48 ([review round 4](review-round-4.md)). `main@origin` is still `bba8df6fab`; round 2 isn't pushed ([land to main](land-to-main.md)).
- **About 11:50 on 2026-10-20 (scratchpad `final/WIRING.md`, saved 11:55:01):** the repo "browse" e2e's copy-permalink action now returns empty; it passed at 10:5x. The lead queued it into this pass, best guess the `repo/copy` tab channel after other agents' edits, fixed with the shared "ask the tab that asked" helper ([repo view extras](repo-view-branches-raw-clone.md)).
- By 11:55 no agent has the pass.
- Status: `todo`.
- 11:55 on 2026-10-20 (the lead to Will): the repo e2e's copy-permalink comes back empty ("browse" in `e2e/repo.spec.ts`, seen in the [Fable fix](fable-review-2-fixes.md) agent's fresh-database run); it joins this pass. Since 12:13 `src/clipboard.ts` is new from the [message controls](chat-message-controls.md) builder; recheck after it lands.
- 12:52:09 on 2026-10-20: Fable S-P3-6 (a failing statement leaves the leader holding a transaction) is fixed by the SDK batch 2 agent ([one SQLite, one leader](one-sqlite-one-leader.md)); drop it from the list.
- 12:55 (scratchpad `final/WIRING.md`): this pass also runs `dprint fmt` on the files `dprint check` flags: 19 untouched files in `@smthrs/agent`, and `GitProxy.ts`, `CodeStorage.ts` and `GitProxy.test.ts` in `effect-code-storage`.
- By 12:59 no agent has the pass.
- 13:19:52 on 2026-10-20, the lead to Will: after the current agents finish, "one cleanup pass covering about 61 small review findings": formatting; the extra model call when a tab is reopened mid-question ([agent status](agent-status.md)); two saves of one draft creating two revisions; the "copy permalink" regression in the repository view. It runs after round 3 lands ([land to main](land-to-main.md)), then Codex Astra, fixes, then Fable.
- **By 13:42:00 on 2026-10-20 every P1 and P2 is reported fixed** ([review round 4](review-round-4.md)), so the pass can start once round 3 lands.
- **New items since 12:55** (scratchpad `final/WIRING.md`, builder reports):
  - message controls (P2): a draft lost on a reload right after typing; `Outbox.withdraw` locks only its own tab; two chat tests fail only in the full run, to fix before round 3 lands; recheck the repo copy-permalink e2e against `src/flows/askingTab.ts` ([message controls](chat-message-controls.md));
  - the lead's 13:38:52 ruling: an expired or invalid session cookie answers 401, so the device keeps its rows and shows sign-in; no cookie keeps today's public or empty shape; an explicit sign-out still wipes (0008); a two-case test;
  - `worker/github/Api.ts` private-repository refusals switch to `ShapeProxy.Refused` (`private, no-store`);
  - `importRules`: `worker/ExecutionHost.test.ts:6` imports `@smthrs/platform-cloudflare`;
  - engine-store misses one line of coverage in `RunInspection`;
  - views: optional `arguments` in `refusedNames`; a pre-warmed pool of frozen runtimes only if interaction feels slow;
  - Retry doesn't reconnect a branch's views shape ([branch terminal](branch-terminal.md));
  - reopening a tab mid-question costs one extra model call ([agent status](agent-status.md)).
- 14:20 on 2026-10-20: round 4's SDK-only P3s (from `review4-opus.md` and `review4-fable.md`) go to the Codex coordinator on the [Latitude server](second-build-machine.md) as task (d), deduped and fixed in batches of one package per lane; `dprint fmt` on `@smthrs/agent` and `@smthrs/effect-code-storage` is its task (c), after round 3 lands. The app P3s stay here.

## Next

From 13:42 on 2026-10-20: after round 3 lands, one pass: dedupe the about 61 P3s, then fix them with the new items above, the double-save fix and `dprint fmt`, each with a test that fails on the old code where it is a behavior.

Until 13:46 on 2026-10-20 the next step was, from 12:55 on 2026-10-20: the steps below, less S-P3-6 (fixed), plus `dprint fmt` on the agent and effect-code-storage files. Until 12:55 the steps were the list below.

1. Wait for the P1 and P2 owners to report and the fixes to land in round 3 of [land to main](land-to-main.md).
2. Deduplicate the about 61 P3s into one list, each with its file, line and home note.
3. One agent fixes them, each with a test that fails on the old code where the finding is a behavior; doc-only fixes pass `pnpm docs:check`.
4. Merge the duplicate tab channel.

## Questions for Will

None. The `SetModel` allowlist's contents are the lead's call unless Will wants Admins limited to named providers.
