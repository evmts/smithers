---
title: Issues list, view, create and comment (0012 slice G0)
status: blocked
area: app
owner: issues builder and live GitHub test builder
updated: 2026-10-21 09:24 PDT
links: [review-round-4.md, ../decisions/0012-git-end-to-end.md, github-source-of-truth.md, pull-request-list-and-tabs.md, issue-triage.md, pr-review-and-merge.md, decisions-for-will.md, local-first.md, sign-in.md, roles-and-labels.md, old-app-feature-gaps.md, land-to-main.md, dev-stack-hygiene.md, ../features/issues.md, land-and-deploy-mvp.md, self-hosted-grafana.md, will-decision-queue.md]
---

## Tracker reconciliation — 2026-10-21 09:24 PDT

**What:** Keep GitHub issues current through durable webhook ingest and personal writes.

**Why:** GitHub is authoritative, so stored webhook delivery alone is not successful sync.

**Current state:** Reopened from done: at 09:22 PDT the lead reports 191 production webhook deliveries stored and none synced because remote flows fail. Earlier issue-create/comment local/live GitHub passes do not establish deployed ingest recovery.

**Next step:** Repair the remote host, verify idempotent processing and recovery of stored deliveries, and prove a new real GitHub issue event appears in the production UI. Keep personal writes attributed to the person. Include this path in the expanded panel and Opus implementation.

**Open questions for Will:** None. The provider preference and investigation/implementation direction are explicit; engineering validation remains with the builders.

Evidence: session 6253ecf2, script-filtered user text and lead replies in the last approximately two hours through 09:23:49 PDT; automated notifications, compacted summaries and tool results excluded. Rulings (including ARCH-14), Will’s queue answers, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules were reconciled. Product results are lead-reported; this tracker verifies the site build only. Existing feature execution ownership is retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 16:35 PDT

**What:** List, view, create and comment on GitHub issues through durable flows and local-first sync.

**Why:** GitHub is authoritative; personal writes must use the person’s identity.

**Current state:** At 16:29 the lead reported issues passing against live GitHub. The two-device test created issue #17 and its comment as the person; App writes appear as smitherspreviewrelease[bot]. A sync connection starvation bug was fixed: about 12 sync connections competed with the browser’s six HTTP connections; low-priority waiting sync requests reduced other requests from 11–21 seconds to under 70 ms. These timings are the lead’s reported observations, not a benchmark run by this tracker.

**Next step:** Retain the live two-device regression and recording; configure deployed webhook separately. Triage’s remaining browser authorization is tracked in issue-triage.

**Open questions for Will:** None for this completed slice.

Evidence: lead text replies extracted by script from the session’s latest two hours through 23:34:16 UTC; current rulings and queue answers take precedence over older designs. Reported product-test receipts only; this tracker ran no product tests.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 16:14 PDT

**What:** List, view, create and comment on GitHub issues through durable flows and local-first sync.

**Why:** GitHub remains authoritative; personal writes retain the person’s identity.

**Current state:** At 16:08:34 PDT the lead reported a new passing two-device issues recording in the queue. This adds multi-device evidence to the live triage receipts. No complete personal create/comment and recovery matrix or deployed webhook receipt was supplied; status remains in-progress.

**Next step:** Collect the remaining personal-write and recovery receipts; keep live webhook and triage-guidelines verification explicit.

**Open questions for Will:** None.

Evidence: lead text replies extracted by script from session 6253ecf2, latest two hours through 2026-10-20 23:13:53 UTC; current rulings and queue answers prevail over older briefs. Reported receipts only; this tracker ran no product tests.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 15:44 PDT

**What:** List, view, create and comment on GitHub issues through durable flows and local-first sync.

**Why:** GitHub is authoritative and personal writes must retain the person’s identity.

**Current state:** App setup is complete per Will’s queue answer. At 15:30:52 the lead reported triage label/comment writes against roninjin10/smithers-github-tests, including maintained authorization, an open rejected issue and judge abstention. This proves the App’s triage writes, not the full personal create/comment and recovery matrix. Webhook and repository triage-guidelines reads remain unverified live.

**Next step:** Collect personal create/comment, recovery and multi-device receipts; finish the distinct triage spend-alert and live-ingress follow-ups.

**Open questions for Will:** None; App configuration is no longer blocked on Will.

Evidence: user-typed text and lead replies extracted from session 6253ecf2’s latest two hours through 22:43:59 UTC; current rulings, queue answers, shared briefs/designs, decisions, proposals, TODOs and rules. These are reported receipts; this tracker ran no product tests. Later rulings supersede older briefs.

## Earlier tracker history


## Current specification — 2026-10-20, 15:14 PDT

**What:** List, view, create and comment on GitHub issues through durable flows and local-first sync.

**Why:** Complete the GitHub workflow using the person’s account for their writes and GitHub as source of truth.

**Current state:** GitHub App setup is complete per Will’s queue answer. At 15:12 PDT the lead reports a real video titled “issues: who can read them, who triages” in the queue, without chapters. No explicit complete create/comment, dropped-response and multi-device test receipt is supplied by that update; retain in-progress.

**Next step:** Collect the live write and recovery test receipts against roninjin10/smithers-github-tests; add video chapters and return the recording for review.

**Open questions for Will:** None; App configuration is no longer a question for Will.

Evidence: lead text replies through 2026-10-20 22:13:56 UTC (15:13:56 PDT), extracted from session `6253ecf2`; [rulings](../rulings.md), queue answers through 21:36 UTC, decisions, proposals, todo and rules. Reported receipts are not fresh test execution by this tracker.

## Earlier tracker history


## What

The first slice of the git flow: a repository's issues in the app, read from GitHub and written back to it.

```
GitHub ── webhook ──▶ github/Apply (re-reads the subject) ──▶ items, comments (Postgres) ──▶ Electric ──▶ devices
   ▲                  github/Reconcile catches missed deliveries
   │
issue/Create, issue/Comment ◀── outbox ◀── a button or the agent
   (one durable flow each, with a hidden marker so an uncertain write is never repeated)
```

Best-guess spec, from decision 0012 §10 (slice G0):
- **Where:** `GITHUB_REPOSITORY`, a public repository the Smithers GitHub App covers. Private repositories wait for 0007 phase 2.
- **Reads:** `AppAuth` and installation tokens; the webhook route, `github/Apply` and `github/Reconcile`; the `items` and `comments` tables with their shapes; `/issues` and `/issues/$n`.
- **Writes:** `issue/Create` and `issue/Comment`, from a button and from the agent, through the outbox, the route and a remote flow.
- **Proof:** G1 to G3 plus the dropped-response test, across two devices, with GIFs.
- **Beside it:** spike S0 (half a day) on the Code Storage mirror and GraphQL `expectedHeadOid`.

## Why

Will, 06:39:05 on 2026-10-20: "Pull request list and generally finishing the entire git e2e flow of being able to create issues open prs or update branch resync etc." 0012 picks issues as the walking skeleton because they cross every layer (webhook in, write out, both tokens, the outbox, shapes and offline) without a branch machine.

## State

- 06:58:11 on 2026-10-20: decision 0012 written (status: proposed), with G0 as its walking skeleton ([pull requests](pull-request-list-and-tabs.md)).
- 07:08:32 and 07:38:57: Panel G waiting on its last `pnpm docs:check` ([docs check outcome](docs-check-flow-outcome.md)).
- **07:40:55 on 2026-10-20, Panel G done; the lead to Will:** "The git design is done (decision 0012), and building its first slice has started." "**First slice:** list, view, create and comment on issues, across two devices." "**Writes:** every write runs as one durable flow, with a hidden marker so an uncertain write is never repeated."
- 07:40:55: the lead relayed 0012's two questions (below): "The build uses my recommended answers, but changing the App's settings needs you."
- By 07:42: no G0 file on disk (no `worker/GitHubWebhook.ts`, `src/features/issues/` or `integrations/src/github/AppAuth.ts`).
- 07:51:24 to 08:04:23 on 2026-10-20, on disk, unreported:
  - Migration `0016_github_issues.ts`: `items`, `comments`, `github_writes`, `github_sync`, `github_deliveries` and `github_installations`. A row changes only for a newer read from GitHub, "so a duplicate or reordered delivery is harmless".
  - `@smthrs/ui` `issues-view/` (07:52:31) and `tests/issue-form.test.tsx`.
  - `worker/github/`: `Calls`, `Tokens`, `Metrics`, `Reconcile`, `Project`, `Write`, `Store`, `Apply`, `Config`, `Host` and `Api`.
  - `@smthrs/integrations` `github/Issues.ts` and `AppAuth.ts` with tests, changeset `integrations-app-auth-issues` (08:01:32).
- No `src/features/issues/`, e2e or report by 08:07. Kept out of landing round 2 at 07:53:57 as still in flight ([land to main](land-to-main.md)).
- 08:09:12 to 08:12:11 on 2026-10-20, on disk: `worker/github/test/scriptedGitHub.ts`, `test/fixtures.ts` and `Flows.test.ts`, G0's server loop tested against a scripted GitHub.
- **About 08:15 on 2026-10-20: the Claude usage limit stopped the builder** ("Build 0012 first slice: issues end to end", 15:14:02Z) **and its UI sub-agent** ("UI: issue list and conversation", 15:14:39Z), with every other Claude agent, unreported. The limit reset at 10:40.
- **10:42: the lead resumed both** from where they stopped ("issues"). By 10:44: `src/features/issues/` still holds only `contract.ts` (07:51:32); no e2e and no report.

- **11:04:02 on 2026-10-20: [review round 4](review-round-4.md)'s R4-7 (P1, Claude Opus P1-1, source-verified): the issues shapes serve a private repository's issues to anyone.** `worker/github/Api.ts:383-389`: `/api/shapes/items`, `/api/shapes/comments` and `/api/shapes/github-sync` call `shape(...)` with no `Sessions` check, unlike every other shape, and `github/Config.ts` never checks that `GITHUB_REPOSITORY` is public. A team that self-hosts on its private repository (the product's normal case) and configures the App serves every private issue's title and body, and every comment, to a signed-out stranger. An unauthenticated read of a stale `items` shape also starts `reconcileIfStale` with the installation token. Contradicts decision 0012's Consequences ("Until shapes are authorized per request, only public repositories sync items"). Fix: refuse to sync and serve until GitHub reports `private: false`, or gate the three shapes with `mayWatch`; a signed-out regression test for all three. Unrouted by 11:07.
- Also round 4: R4-15, any Guest can post as the App bot through `via: "agent"` ([GitHub source of truth](github-source-of-truth.md)); Fable's R4-12 lists `worker/github/Api.ts:376-379` among the shapes that swap to an empty definition when the session lookup fails ([local-first](local-first.md)). Opus's light review of `worker/github`: idempotency is sound (a write marker plus `beginAttempt`, executions keyed by delivery, retries as engine policies), and no path approves or merges; `github_deliveries` and `github_writes.payload` have no retention.
- 10:48 to 11:26 on 2026-10-20, on disk, unreported:
  - `src/features/issues/` `schema.ts`, `queries.ts`, `store.ts`, `issues.ts` and `view.ts` (10:48 to 10:53), `components/IssuesContext.tsx` (11:03:12), tests `contract`, `api`, `steps` and `view` (11:13 to 11:15);
  - `worker/github/` `Api.ts` 11:08:05 (where R4-7's shapes are), `Calls`, `Apply` and `Reconcile` 11:16:57, `Store.ts` 11:26:55; tests `Host`, `Api`, `Calls`, `Flows`, `Live` and `Project` (10:56 to 11:22).
- 11:42:48, the lead: issues wasn't reported stopped by either weekly limit, so it kept running.
- 11:45:52 to 11:55:06: the five `src/features/issues/` modules changed together at 11:45:52, `view.test.ts` at 11:51:15, and the new `issues.test.ts` at 11:55:06.
- Not yet by 11:55: an issues e2e (none in `e2e/`), a GIF or a report. R4-15's `worker/github/Write.ts` is unchanged since 10:49:34.
- 12:03:12 on 2026-10-20 on disk: `e2e/issues.spec.ts`, G0's first browser test. 12:18:21 (the lead): the issues slice waits its turn for the shared heavy-test lock. No run, GIF or report by 12:23.
- **12:52:55 on 2026-10-20: 0012's builder reported slice G0 built,** with review round 4's two issues findings fixed; nothing is committed.
  - **Built:** list, view, create and comment on the issues of `GITHUB_REPOSITORY`, synced to devices by Electric. A write goes from the device's outbox to `POST /api/repos/<o>/<n>/writes`, then the remote `github/Write` flow, whose hidden marker means a retry never posts twice. The webhook only starts a re-read from GitHub; a read that finds the sync older than 5 minutes starts a reconcile. People post with their own `ghu_` token; the agent posts as the App. The `/issue owner/repo <title>` and `/comment owner/repo <n> <text>` slash commands, the buttons and the agent run the same flows. Docs: `docs/features/issues.md`.
  - **R4-7 (P1) fixed:** the issues, comments and sync shapes answer 401 to a signed-out request and 403 to a person with no role, unless GitHub has said the repository is public. The page shows the sign-in link or "Not found" instead of loading forever.
  - **R4-15 (P2) fixed:** an agent write from a Guest is refused with 403, so a Guest's write goes as themselves or not at all.
  - **Tests:** `worker/github` 70 pass, 2 live tests skipped, 100% coverage; `src/features/issues` 41 at 100%; the SDK additions 95; the UI components 41. The full app suite: 1,222 pass, 3 fail outside this slice (`chat/controls.test.ts`, `runs/runs.test.ts`, `worker/ExecutionHost.test.ts`). `importRules` reports 4 violations, all in other files.
  - **e2e:** the two-device "who reads" test passed: signed out gets the sign-in link; a Member gets the list and the new-issue form. GIF: `/Users/williamcory/Desktop/smithers-mvp/gifs/issues-who-reads.gif`. The create-on-A, see-on-B, comment-from-B test skips until `E2E_ISSUES_REPOSITORY`, `E2E_SESSION_COOKIE`, `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` are set.
  - Spike S0 isn't needed for this slice, because issues touch neither Code Storage nor branches. The `smithers:accepted` and `smithers:not-accepted` triage labels are next ([issue triage](issue-triage.md)).
  - While stopping its own duplicate suite the builder ran `pkill -f 'vitest run --coverage.enabled=false'`, which also matches other agents' runs; any vitest run that died around 12:52 should be rerun ([dev stack hygiene](dev-stack-hygiene.md)).
- **12:54:04 on 2026-10-20, the lead to Will:** "Issues now work end to end in the app: list, view, create and comment, with changes syncing between devices. People post as themselves and the agent posts as the App." "**Your next step: set up the GitHub App.**" Four steps: Issues read and write; the Issues and Issue comment events; a new private key (`GH_APP_PEM` in `~/.zshrc` points to `smithers-jjhub.pem`, which isn't on this Mac); install the App on the wrapped repository and on a scratch repository, and tell the lead both names. "Leave the webhook URL for now; it needs the deployed address." Row 9 of [decisions for Will](decisions-for-will.md).
- **Status moved from in-progress to blocked:** the slice is built, and the rest of its proof (the create and comment e2e and the live GitHub tests) waits on Will's GitHub App setup.
- **13:25:53 on 2026-10-20, Will answered 0012 Q1:** "yes should appear under your account is better ux". What a person posts through Smithers appears on GitHub under their own account; the App posts only for the agent and flows. 13:26:18, the lead: "That's already how issues work." Recorded in 0012 (line 369).
- **13:26:18: the GitHub App setup became one visit**, "the one blocker that holds the most work": the callback URL `http://localhost:1337/api/auth/callback`; Issues, Pull requests and Contents read and write; the events Issues, Issue comment, Label, Pull request, Pull request review, Push, Create and Delete; a new private key at the path `GH_APP_PEM` names; installs on the wrapped repository and a scratch repository. Not done by 13:46 ([decisions for Will](decisions-for-will.md), row 1).
- **14:08:55 on 2026-10-20: the GitHub App setup is done** (Will's queue answer, a transcript of the agent that drove Arc for him; GitHub asked Will for a passkey twice): the callback URL added; Issues, Pull requests and Contents verified Read and write; all eight events on; a new private key saved at `~/.secrets/smithers-jjhub.pem`, owner-only; installs on `smithersai/smithers` (wrapped) and `roninjin10/smithers-github-tests`, a new public scratch repository. The webhook URL is unchanged until a deploy. "Live sign-in and tests haven't been run."
- 14:10:36, the lead: "The GitHub App key is in place." **Status moved from blocked to in-progress.**
- **14:12:55, the lead to Will:** "an agent is now running the live sign-in, issues and triage tests against `roninjin10/smithers-github-tests` on a separate dev server, so the other agents' tests aren't affected."
- 14:15 to 14:16: the usage limit stopped that agent ("Run live GitHub sign-in and issues tests"); resumed at 14:19.
- On disk, unreported, 14:13 to 14:27: scratchpad `live/` holds the separate dev server's scripts and log (`start-live-dev.sh`, `dev-live.log` to 14:28), a sign-in probe (`app-sign-in.mjs`, 14:24), and a sign-in recording (`signin-video/`, two `.webm` files, 14:27). No result or GIF yet.

## Next

From 14:30 on 2026-10-20: the live test agent's report: real GitHub sign-in, then create on one device and comment from another against `roninjin10/smithers-github-tests`, with GIFs. Then this note moves to done. The webhook URL (`<deploy url>/api/github/webhook`) and `GITHUB_WEBHOOK_SECRET` follow the first deploy ([land and deploy](land-and-deploy-mvp.md)). The fixes land in round 3 of [land to main](land-to-main.md).

Until 14:30 on 2026-10-20 the next step was, from 12:54 on 2026-10-20: Will sets up the GitHub App (row 9 of [decisions for Will](decisions-for-will.md)): Issues read and write (Metadata read stays on); the Issues and Issue comment events; `GITHUB_APP_ID` and a new key in `GITHUB_APP_PRIVATE_KEY`; installs on `GITHUB_REPOSITORY` and a scratch repository (`GITHUB_LIVE_REPOSITORY`). Then the create-on-A, comment-from-B e2e and the live tests run, with GIFs, and this note moves to done. The webhook URL (`<deploy url>/api/github/webhook`) and `GITHUB_WEBHOOK_SECRET` follow the first deploy ([land and deploy](land-and-deploy-mvp.md)). The fixes land in round 3 of [land to main](land-to-main.md).

Until 12:54 on 2026-10-20 the next step was, from 11:07 on 2026-10-20: G0's report as before, and the lead's routing of round 4's R4-7 and R4-15 ([review round 4](review-round-4.md)). R4-7 must be fixed before the App is configured on a private repository.

Until 11:07 on 2026-10-20 the next step was: G0's report: the webhook in, `issue/Create` and `issue/Comment` out from a button and the agent, the same issue on two devices, offline writes sent once, and GIFs. Writes against the real repository need the App's new permissions and webhook (Q2).

## Questions for Will

None. The GitHub App visit is done (14:08:55 on 2026-10-20).

Until 14:30:

- **Now (asked 13:26:18 on 2026-10-20, replacing the 12:54:04 ask below):** one visit to the GitHub App's settings: the callback URL, Issues, Pull requests and Contents read and write, the eight events, a new private key, and installs on the wrapped and a scratch repository; tell the lead both names.
- 0012 Q1: answered 13:25:53 on 2026-10-20: yes, under the person's own account.

Until 13:26:

- **Now (asked 12:54:04 on 2026-10-20):** set up the GitHub App: Issues read and write; the Issues and Issue comment events; a new private key (the file `GH_APP_PEM` names isn't on this Mac); install it on the wrapped repository and a scratch repository you own, and tell the lead both names. This is 0012 Q2's App change, limited to what issues need.
- 0012 Q1: should your issues, comments, reviews and merges show on GitHub as you, through your own sign-in token, rather than as the Smithers App? Recommended: yes. (Relayed 07:40:55 on 2026-10-20; built on yes.)
- 0012 Q2: may the Smithers GitHub App gain Issues, Pull requests and Contents read and write, Checks and Commit statuses read, and a webhook with its secret? Every installation owner then accepts. Recommended: yes. Changing the App's settings needs Will. (Relayed 07:40:55 on 2026-10-20.) (Checks and Commit statuses read dropped at 13:21:27 on 2026-10-20: [no GitHub Actions](no-github-actions.md).)
