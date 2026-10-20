---
title: Customizable issue triage (proposed, accepted, not accepted)
status: in-progress
area: app
owner: triage builder; worker, `@smthrs/ui` `TriageControl` and `@smthrs/integrations` files on disk to 13:14:38 on 2026-10-20; no e2e and unreported by 13:17. Until 13:05: triage builder; migration `0018_triage` (13:04:05), `db/Database.ts` (13:04:07) and `src/features/issues/contract.ts` (13:04:51) on disk on 2026-10-20; unreported by 13:06. Until 13:04: triage builder, started by the lead about 12:54 on 2026-10-20 on 0012 §5 (Accepted / Not accepted, decided by a flow or an agent); no triage file on disk and unreported by 12:59. Until 12:54: unassigned; designed in decision 0012 §5 (Panel G reported 07:40:55 on 2026-10-20); not in slice G0. Until 07:40: Panel G; decision 0012 written 06:58:11 on 2026-10-20 (status: proposed), §5 Triage; no builder yet. Until 06:58: Panel G (Opus merges into decision 0012; started 06:41:56 on 2026-10-20). Sol's design done 06:46; Opus's independent design written 06:53
updated: 2026-10-20
links: [issues.md, ../decisions/0012-git-end-to-end.md, pull-request-list-and-tabs.md, github-source-of-truth.md, roles-and-labels.md, agent-jev.md, model-endpoint.md, notifications-and-live-work.md, decisions-for-will.md, old-app-feature-gaps.md, ../decisions/0007-roles-and-tags.md, ../decisions/0009-notifications-and-live-work.md, ../proposals/mvp-gaps.md, docs-check-flow-outcome.md, no-github-actions.md, pr-review-and-merge.md]
---

## What

Every issue carries a triage state: proposed, then accepted or not accepted. A repository's own triage flow can accept or reject an issue, including through an agent that reads it and decides. A person can always override.

```
issue opened ──▶ proposed
                   │  triage flow (enabled by a Maintainer)
                   │    triage/Decide: Classifier, judge role ──▶ accept | reject | abstain
                   │    issue/ApplyTriage (system step, as the App) ──▶ one label + one comment
                   ▼
            accepted │ not accepted        ◀── a Member or above overrides; a person's call is final
```

**Decided in 0012 (06:58, proposed), decisions 9 and 10 and §5:**
- **Two GitHub labels, independent of open and closed:** `smithers:accepted` and `smithers:not-accepted`. No triage label means proposed; both at once mean `conflict`. The `smithers:` prefix keeps a repository's own `accepted` label from counting.
- **Not accepted leaves the issue open** with one comment giving the reason. Closing stays a person's act.
- **A repository's triage flow decides; a system step writes.** A Maintainer enables triage (`triage/Enable`, `triage/Pause`, new action `repo:triage-flow`). The non-overridable `issue/ApplyTriage` writes one label and one comment as the App, attributed to the flow and its enabler. A Member or above overrides in person (`issue/Triage`, `repo:triage`), which pins the issue until a person presses Run triage again (`triage/Run`).
- **0007 Q3 is decided for triage:** an event-started flow may label with no person present, under the enabler's role, re-checked at every write.
- **Out of 0012:** repository-coded triage flows wait until a host runs repository code.

The best guess before 0012, from the two panel designs (scratchpad `final/panel-g-{opus,sol}.md`):
- **GitHub carries the state as labels.** Both designs agree; Postgres derives the state from the labels, so a label set on github.com counts.
  - Opus: `accepted` and `not accepted`; no label means proposed.
  - Sol: exactly one of `smithers:proposed`, `smithers:accepted`, `smithers:not-accepted`; two triage labels are a conflict that a Member resolves, never accepted.
- **Rejection:** Opus closes the issue as `not_planned` with one comment giving the reason. Sol leaves it open by default. Both comment on GitHub, for example "Not accepted: duplicate of #42. Triaged by triage, enabled by @sam."
- **Who decides:** a Maintainer enables the repository's triage flow (Sol: a pinned `.smithers/flows/triage/flow.ts` revision with a model budget). Members and above override by hand. The flow never re-decides an issue a person triaged until a person asks it to.
- **What the agent may do:** decide, then a non-overridable system step applies one triage label and one comment, attributed to the flow and the person who enabled it. The model step holds no token. The agent may not edit text, apply other labels, assign, lock, transfer, touch pull requests, mention anyone, post links, overrule a person, approve or merge.
- **Model call:** `triage/Decide` is one `@smthrs/model` `Classifier.make` call on the `judge` role, over the title, body, comments and `.smithers/triage.md`. That is the same judge [agent Jev](agent-jev.md) gives the agent.
- **Failure:** a model failure or invalid output abstains; the issue stays proposed. If the enabler loses Maintainer, triage pauses and Maintainers are told (0009).
- **Telemetry:** `triage.decide` and `triage.apply` spans; `triage_decisions{decision,via}` and `triage_overrides{from,to}` (a person overriding the flow is its error rate). Never titles, bodies or logins.

## Why

Will, 06:41:17 on 2026-10-20: "we need the ability to customize issue triage so issues should have accepted or not accepted and workflow can accept them or reject via an agent".

At 22:56 on 2026-10-19 Will deferred decision 0007's Q3, whether an event-started flow may apply labels with no person, as "thinking too far ahead". This request brings it into scope for triage labels ([roles and labels](roles-and-labels.md)). It also fits M-47, which names issue transitions such as proposed to accepted as customizable by repository flows.

Prior art: `.smithers/flows/issue-triage/flow.mdx` and `.smithers/flows/triage-publish/flow.ts`, which already split deciding from writing, and #4027's label transitions (`packages/rpc/src/FactoryProjection.ts:116-134`).

## State

- 06:41:17 on 2026-10-20: Will's request. About 06:41:44 the lead appended it to `PANEL-G-BRIEF.md` ("Added by Will mid-design") and restarted Sol's run with it.
- 06:41:56: the lead started the Opus member and merger of Panel G.
- 06:46: Sol's design finished (exit 0) with triage as its decisions 5 to 8. It names no question for Will.
- 06:53: Opus's independent design written, with triage as its decision 9 and workstream W7 (`worker/flows/Triage.ts`, `src/features/triage/**`) plus a `TriageBar` component.
- By 06:55: the merge into `apps/mvp/docs/decisions/0012-git-end-to-end.md` isn't written.
- **06:58:11: decision 0012 written (status: proposed)**, triage in §5. It takes Sol's labels with the `smithers:` prefix (without `smithers:proposed`) and Sol's open-on-rejection, over Opus's close as `not_planned`. Its two questions for Will are about GitHub attribution and the App's permissions, not triage ([pull requests](pull-request-list-and-tabs.md)).
- 07:08:32 on 2026-10-20: Panel G is waiting on its last `pnpm docs:check`; no report ([docs check outcome](docs-check-flow-outcome.md)). Decision 0012 is unchanged since 06:58:11.
- **07:40:55 on 2026-10-20, Panel G done; the lead to Will:** "The git design is done (decision 0012), and building its first slice has started." Its first slice is issues: "list, view, create and comment on issues, across two devices" ([issues](issues.md)). Triage is 0012's workstream W7, built after G0.
- **Status moved from designing to todo:** designed in 0012, not in the first slice.
- **12:52:55 on 2026-10-20:** 0012's builder reported slice G0 done and named the `smithers:accepted` and `smithers:not-accepted` labels as its next step ([issues](issues.md)).
- **12:54:04, the lead to Will:** "**Triage:** I started an agent on Accepted / Not accepted triage, where a flow or an agent decides."
- By 12:59 no triage file is on disk (no `worker/flows/Triage.ts`, `src/features/triage/` or triage e2e).
- **Status moved from todo to in-progress.**
- **13:04:05 on 2026-10-20, on disk, unreported: migration `db/migrations/0018_triage.ts`.** GitHub is the truth: an issue's triage state is its two labels, `smithers:accepted` and `smithers:not-accepted`, read into `items.triage` on every upsert (`proposed` with neither, `conflict` with both).
  - `items.triage_pinned`: a person's Accept or Not accepted, which the flow never re-decides until someone presses Run triage again.
  - `triage_settings`: one row per repository a Maintainer enabled, with who enabled it (the flow acts under their role, re-checked at every write), pause and its reason, and a daily model budget in tokens.
  - `triage_decisions`: one row per decision, the flow's or a person's, with a reason code, the guidelines' SHA, an input digest, tokens spent, and the label and comment as separate receipts. Not synced.
  - `github_writes` gains `issue/triage`, `triage/run`, `triage/enable` and `triage/pause`. Only a person's override writes to GitHub with their token.
- 13:04:07: `db/Database.ts`; 13:04:51: `src/features/issues/contract.ts`. No triage flow, e2e or report by 13:06. Status stays `in-progress`.
- 13:04 to 13:14:38 on 2026-10-20, on disk, unreported:
  - `@smthrs/ui`: new `TriageControl` (`src/triage-control/`, 13:04:23, test 13:05:08), plus `IssuesView` and `ItemConversation` changes (13:04:11 to 13:05:24); `@smthrs/views` `Presentation.ts` and its vocabulary (13:05:08). Changesets `ui-triage-control` (13:06:42) and `integrations-issue-labels-contents` (13:10:05).
  - `@smthrs/integrations`: `github/Issues.ts` (13:06:04), new `Collaborators.ts` (13:09:10) and `Contents.ts` (13:09:25), with tests and API docs (13:09:54).
  - The worker: `worker/github/Triage.ts` declares the flow `triage/Run` (read, `triage/Decide` through `ModelStep.model` on the judge role, then `issue/ApplyTriage` label and comment steps) and `TriageClassifier`; `worker/github/TriageStore.ts` (13:07:49), `Tokens.ts` (13:07:54), `Metrics.ts` (13:08:30), `Api.ts` and `Write.ts` (13:12:07), `Host.ts` (13:12:35), `Flows.test.ts` (13:12:56) and `Triage.ts` (13:14:38); `src/features/issues/issues.test.ts` (13:12:56).
  - No triage e2e in `e2e/` and no report by 13:17. Status stays `in-progress`.
- 13:21:12 on 2026-10-20: the lead holds the [PR list](pull-request-list-and-tabs.md), [review and merge](pr-review-and-merge.md) and branch update and resync until this builder finishes, since they use the same GitHub write path and list view.
- 13:23:25: a docs agent removes GitHub checks from 0012 under Will's 13:21:27 ruling ([no GitHub Actions](no-github-actions.md)) and leaves 0012 §5, which this builder edits, alone.

## Next

From 12:54 on 2026-10-20: the triage builder's report, each behavior with a test that fails first: `triage/Enable` and `triage/Pause` (Maintainer); `triage/Decide`, one `Classifier` call on the `judge` role that abstains on failure; the non-overridable `issue/ApplyTriage` writing one label and one comment as the App; `issue/Triage` overrides by a Member or above, final until `triage/Run`; an e2e with its GIF. Live label writes on GitHub wait on the same GitHub App setup as [issues](issues.md).

Until 12:54 on 2026-10-20 the next step was, from 07:40 on 2026-10-20: slice G0 ([issues](issues.md)) is building; triage (W7) follows it. No triage builder yet.

Until 07:40 on 2026-10-20 the next step was, from 06:58 on 2026-10-20: triage builds as 0012's workstream after the walking skeleton G0 (issues through webhooks and the outbox). No builder is started.

Until 06:58 the next step was: Opus merges both designs into 0012 (status: proposed), picking the label names and whether a rejection closes the issue. Triage builds after Panel G's walking skeleton (issues through webhooks and the outbox) lands.

## Questions for Will

- None new. Live label writes need Will's GitHub App setup ([issues](issues.md), asked 12:54:04 on 2026-10-20).

Until 12:59 on 2026-10-20 this section read:

None. 0012's two questions don't touch triage; 0012 settled rejection as leaving the issue open.

Until 06:58: None yet. Panel G sends at most 3 questions with 0012. The open choices it may raise: does "not accepted" close the issue (Opus) or leave it open (Sol)?
