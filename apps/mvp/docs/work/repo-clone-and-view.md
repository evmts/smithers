---
title: Clone and view a repo (feature 2)
status: in-progress
area: app
owner: repo viewer builder and recording builder
updated: 2026-10-20
links: [review-round-4.md, repo-follow-ups.md, repo-view-package-split.md, agent-root-browser-safe.md, dev-stack-hygiene.md, app-wiring.md, sign-in.md, one-sqlite-one-leader.md, ../decisions/0006-repo-clone-and-view.md, code-storage-spend-caps.md, platform-cloudflare-edge-cache.md, integrations-browser-safe-root.md, ../proposals/mvp-gaps.md, ../../../../docs/libraries.md, repo-open-states.md, deep-import-migration.md, durable-answering.md, decisions-for-will.md, ../decisions/0011-the-agent-runs-in-the-browser.md, cloudflare-flow-host.md, code-reviews.md, gitremote-unicode-branches.md, web-standard-globals-rule.md, integrations-effect-httpclient.md, flows-root-platform-neutral.md, local-first.md, navigate-flow.md, agent-repo-navigation.md, fable-review-2-fixes.md, repo-view-branches-raw-clone.md, ../rulings.md, chaptered-review-videos.md]
---

## Current specification — 2026-10-20, 21:54 PDT

**What:** Finish the repository-browsing feedback with docs, tests and recordings.

**Why:** Will requested a polished repository reading and cloning experience.

**Current state:** At 21:48 the browsing agent exhausted context while finishing the repositories feature doc. A fresh agent continues from its existing edits and must finish documentation, tests and recordings before handing work to round 4. Existing recordings alone do not establish completion.

**Next step:** Collect the continuation report, green checks and recording quality receipts, then hand off to the lander.

**Open questions for Will:** None.

Evidence: script-filtered user text and lead replies from session 6253ecf2, approximately 19:54–21:54 PDT; compaction summaries, tool blocks and relayed agent messages excluded. Current rulings and queue answers take precedence over historical briefs, decisions and proposals. Execution ownership retained; reconciliation by Codex tracker curator. Product receipts are reported evidence; tracker validation is the maintainer-site build.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 18:26 PDT

**What:** Clone repositories and present a useful, full repository browse page.

**Why:** Will approved clone but requested a major browse-page overhaul.

**Current state:** Clone-by-agent passed at 17:28 and Will approved clone at 18:16. At 18:16–18:17 the lead assigned browse redesign, Markdown permissions and HTML preview; earlier agent-clone failure is superseded. The broader viewer remains in progress.

**Next step:** Deliver the overhaul in repo-view-branches-raw-clone.md, retain approved clone regressions and return a new passing walkthrough.

**Open questions for Will:** None.

Evidence: latest two session hours extracted by script as human text/lead replies; queue answers through 2026-10-21 01:24:15 UTC, current rulings, shared briefs/designs, decisions, proposals, TODOs and rules. Latest rulings override historical proposals. Product results are reported receipts; this pass verifies the maintainer-site build only.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 16:04 PDT

**What:** Clone repositories and browse their trees and files, including through the agent.

**Why:** Repository operations must work through the same flows used by people and agents.

**Current state:** Repository browser tests passed 3/3 at 15:44, including repaired copy permalink; the code-viewer package is done. At 16:02 the lead nevertheless reported clone-by-the-agent failing, with ownership sent to the cleanup pass. Earlier clone recordings do not establish this path works.

**Next step:** Assign the agent-clone regression explicitly to the cleanup pass, fix it and retain a passing real browser test and recording.

**Open questions for Will:** None before the assigned fix.

Evidence: user-typed messages and lead text replies extracted with a script from session 6253ecf2 for the latest two hours through 23:03:42 UTC; rulings, queue answers, shared briefs/designs and current decisions, proposals, TODOs and rules. Reported receipts only; this tracker ran no product tests. Later rulings supersede older proposals.

## Prior tracker record (retained)


## Current specification — 2026-10-20, 15:44 PDT

**What:** Clone repositories and display their trees and files safely.

**Why:** Repository pages and review evidence must reflect working behavior.

**Current state:** The stack recovered at 15:17:27. At 15:40:17 the lead reported browse, clone and refusal walkthroughs as videos in the queue. The earlier blank-recording replacement wait is superseded. The text update supplies no fresh explicit full test-suite or landing receipt, so this note remains in progress.

**Next step:** Collect the clone/view behavioral test and landing receipts and Will’s review of the replacement videos.

**Open questions for Will:** Feedback on the revised walkthroughs.

Evidence: user-typed text and lead replies extracted from session 6253ecf2’s latest two hours through 22:43:59 UTC; current rulings, queue answers, shared briefs/designs, decisions, proposals, TODOs and rules. These are reported receipts; this tracker ran no product tests. Later rulings supersede older briefs.

## Earlier tracker history


## Current specification — 2026-10-20, 15:24 PDT

**What:** Clone repositories and display their trees and files safely.

**Why:** Repository pages must work for the app being reviewed.

**Current state:** At 15:17:27 the lead reported the local stack healthy and repository pages loading, clearing the missing-credentials/restart blocker. Home recordings followed at 15:22:54. A new clone-journey test/recording receipt is still missing.

**Next step:** Rerun the real clone/view journey and replace the blank clone recording; retain existing implementation receipts.

**Open questions for Will:** None.

Evidence: Will’s typed messages and lead text replies, extracted from session `6253ecf2` for its latest two hours through 15:23:55 PDT; [rulings](../rulings.md), queue answers through 14:36 PDT, shared briefs/designs and current decisions, proposals, TODOs and rules. Receipts above are reported, not fresh product tests run by this tracker.

## Earlier tracker history


## Current specification — 2026-10-20, 14:55 PDT

**What:** Clone and display repositories with safe file viewing.

**Why:** Repository navigation must work in the app Will is reviewing.

**Current state:** Earlier implementation/test receipts remain below. At 14:39 the lead says every repository page failed because Code Storage credentials were omitted; at 14:53 the recovery restart is still queued. The clone GIF was also reported blank.

**Next step:** Restart with credentials, rerun the repo browser journey and replace the broken recording.

**Open questions for Will:** None; the lead can settle implementation details.

Evidence: Will's typed messages and the lead's text updates in session `6253ecf2`, 12:54–14:55 PDT; [rulings](../rulings.md); queue answers through 14:36 PDT. These are reported receipts, not a new verification run by the tracker.

## Earlier tracker history

Previous owner record: none; review round 4's R4-23 fixed by the SDK batch 2 agent, reported 12:52:09 on 2026-10-20. Until 12:52: the wiring agent, reported done 05:54:14 on 2026-10-20: execution ids are a UUID per clone attempt (migration `0009`), with regression tests, and all 3 `e2e/repo.spec.ts` cases pass in the final fresh-state run; the lead pointed Will at `/octocat/Spoon-Knife` at 05:54. Leftovers are [repo follow-ups](repo-follow-ups.md) and Will's [repo-view package split](repo-view-package-split.md) answer. Until 05:54: the wiring agent, from about 04:56 on 2026-10-20 fixing the clone `StartConflict` as a product bug under the lead's ruling (a generated UUID per clone attempt, proven by a regression test after a reset); the fix and three regression tests on disk by 05:09, the unit suite green at 05:13:29, no `e2e/repo.spec.ts` run with the fix yet, unreported (at 05:04: migration `0009_clone_ids` and `worker/Repos.ts` only, no test). Until 04:56: the wiring agent; its 04:55 run (`wiring/e2e-5`) has all 3 `e2e/repo.spec.ts` cases green after it wiped the dev Durable Object state, unreported. From 04:43 on 2026-10-20, the wiring agent, whose fresh-database run has all 3 `e2e/repo.spec.ts` cases red (unreported). Until 04:43: R3 to R5 agent (started about 01:00, reported done by 02:35 on 2026-10-20); the router and boot wiring went to the wiring agent's sub-agent C1 (by 02:35); leftovers are [repo follow-ups](repo-follow-ups.md); the lead wires the deploy secret; the feature 2 agent finished R1 and R2. Until 02:35: "R3 to R5 agent (started about 01:00 on 2026-10-20; R3 and R4 code, the live clone test, the e2e spec and `docs/features/repo.md` on disk by 02:01; repo files at 100% coverage by 02:27; in final checks at 02:33, routes not wired, unreported)"


## What

Clone a public GitHub repo into Code Storage, Pierre's git provider, with no sign-in, key or App install, and view it: file tree, breadcrumbs, code (`@pierre/diffs`) and Markdown in the WYSIWYG editor. Routes follow GitHub's paths, so swapping github.com for our domain opens the same view. One `RepoView` serves the full page and the chat embed.

## Why

Will: "We need the ability on the backend to clone and view a repo. We can ignore every other requirement to start except the very simple clone and view." "Go ahead and use pierre diffs for this." "Note this should be an embedded app though". On the mock: "The actual page is great but it should be a full screen view."

## State

- Decision 0006 is proposed; the build proceeds on its recommended answers.
- Cloning is the durable flow `repo/Clone` on the Cloudflare host; metadata lives in Postgres and syncs through Electric.
- Freestyle's git hosting was discontinued on Sep 9, which is why Code Storage won.
- On disk, uncommitted, as of 21:23 on 2026-10-19:
  - `packages/effect-code-storage`: `CodeStorage` and `GitRemote` modules, README, changelog and docs, with unit, live and browser-bundle tests.
  - `@smthrs/ui`: `Breadcrumbs`, `DirectoryListing` and `RepoView` (`src/adapters/repo-view`), with their CSS wired in.
  - The agent is writing the path helpers and the `RepoView` tests.
- 21:18: the weekly usage limit stopped the agent; it resumed by 21:21.
- 21:29: decision 0006's plan table records the first two parts as built, uncommitted:
  - R1, `@smthrs/effect-code-storage`: 40 tests at 100% statements, branches, functions and lines.
  - R2, `@smthrs/ui`: `Breadcrumbs`, `DirectoryListing`, `RepoView`; `CodeFileView` takes `lineEnd` to mark a range. Every new file at 100% lines and functions, and the package's 2,032 tests pass. The ui changelog lists them.
  - R3 (migration, `RepoApi`, `repo/Clone`, Worker secrets) waits for W5's Cloudflare host. R4 (app routes and screens) waits for the `db`, `worker` and `src` rewrites, and the chat embed for feature 3's template registry. R5 (e2e, bench, docs) comes with R3 and R4.
  - Registries the lead changes: the `docs/libraries.md` row, the root `PACKAGE.ts` SDK rule lists, the browser-bundle contract, the `@smthrs/ui/adapters/*` exception in `apps/mvp/PACKAGE.ts`, and a fixture repo `smithersai/repo-view-fixture`.
- The lead lists the agent as running at 21:29.
- 21:36: the agent reported both phases done (design proposed; R1 and R2 built and tested). Nothing is committed.
  - R1, `@smthrs/effect-code-storage`: each request signs its own five-minute token for one repo and one scope; every response body read is capped; errors carry only the server's `code`, and a test proves the key, the token and the server's error text reach no error, span or log. Typecheck, lint, format, circular check, build, docs and `pnpm docs:check` pass. A live test against GitHub passes; the live Code Storage round trip skips with no key.
  - R2, `@smthrs/ui`: `RepoView` at `@smthrs/ui/adapters/repo-view` is about 14 MB bundled. Checked in a real browser in light, dark, inline and at 390 px.
  - A change other apps see: `MarkdownEditor` takes its container's background, and its code blocks use the code-block background. The old `apps/app` picks this up.
  - It didn't wrap `@pierre/storage` 1.17.1: the SDK uses deprecated routes and copies the server's error text into its errors. `@pierre/trees` is a beta on a Preact beta, so the tree stays our `FileTree`.
- 21:39: R6 done. The lead added the package to `docs/libraries.md` (two rows), the root `PACKAGE.ts` SDK rule lists and `browser-contract.mjs`; `pnpm docs:check` passes. Until the app integrates it, the package has no consumer.
- 21:39, the finding that changes the plan: Code Storage has no anonymous access. Every request carries a JWT signed by the organization's ES256 key, and an unauthenticated call returns `401`. The cheapest plan is $20 a month, plus about $3.60 per GB-month stored and $0.15 per GB read; no free tier. Will's "no API key or app install" holds only for the person cloning: public mode mirrors a public GitHub repo with no GitHub credential, but Smithers still holds one organization key.
- 21:39 and 21:43: the lead asked Will to create the organization and add its key as `CODE_STORAGE_KEY`. No answer yet. Blocked on Will: nothing clones outside tests until then.
- Still to create for R5: the fixture repo `smithersai/repo-view-fixture`.
- 21:45: the lead opened the Code Storage sign-up page in Will's browser. `@pierre/diffs` already renders; only cloning needs the paid account.
- 21:49: Will bought Starter: "pierre is spinning up servers I only did $20 plan though so we should have it set up so we fail gracefully if we reach capcity". The $20 is a minimum monthly spend, not a cap. The lead started a [spend caps](code-storage-spend-caps.md) agent.
- 21:51: Will: the private key is `CODE_STORAGE_API_KEY` in `~/.zshrc`. The lead checked it's a valid PEM private key without printing it. The SDK reads `CODE_STORAGE_KEY`, so on this Mac the lead maps one name onto the other when running.
- 21:52: Will: "make sure you don't use code storage apis without first wrapping it in effect". The app reaches Code Storage only through `@smthrs/effect-code-storage` (Effect `HttpClient`); mvp `ImportRules` bans `@pierre/storage` ([ImportRules and Jev](import-rules-and-jev-lint.md)).
- 21:52: the lead asked Will for the organization name, the subdomain in `api.<org>.code.storage`. No answer at 21:54. Blocked on Will for the live clone test, and on W5 for R3.
- By 22:02: decision 0006 gained a "Capacity and spend" section from the [spend caps](code-storage-spend-caps.md) agent. `repo/Inspect` now also reads the repo's size from GitHub's REST API (with an optional `GITHUB_TOKEN`) and runs admission, sealing `Admitted` or `Capacity`; `repositories` gains `capacity`, `stored_bytes` and `retry_at`; a new row state `capacity`. R3 now also needs an injected Cache API service in `@smthrs/platform-cloudflare` and a fix for `@smthrs/integrations`' Node-only root.
- About 22:00: the organization name is first of five asks on [decisions for Will](decisions-for-will.md). No answer at 22:04.
- 22:05: Will: "smithers is org name". 22:06: **Code Storage works.** With organization `smithers` and Will's key (`CODE_STORAGE_API_KEY` mapped to `CODE_STORAGE_KEY`), the live test passed 2 of 2: it mirrored the public `octocat/Spoon-Knife` into Code Storage, waited for the sync, listed its files and read its README. Will is no longer a blocker.
- 22:06: the [spend caps](code-storage-spend-caps.md) agent finished: design in decision 0006, SDK metering built. Admission itself is built with R3.
- Now blocked only on:
  - [durable answering](durable-answering.md) W5, the Cloudflare host's app cutover. W5 waits on W1, which Will stopped at 22:08; whether to restart it is an open question to Will.
    - 22:16: Will said the stop was unintentional; 22:17: the lead restarted W1; a fresh replacement started about 22:20 from the work on disk. W5 now waits only on W1 finishing.
  - two SDK pieces: [an edge cache service in `@smthrs/platform-cloudflare`](platform-cloudflare-edge-cache.md) and [a browser-safe `@smthrs/integrations` root](integrations-browser-safe-root.md).
- 22:31: decision 0011 keeps `repo/Clone` remote under `flows.local-first-placement`: it needs the Code Storage organization key, which a person must not hold. 0011 keeps W1 and W4 (`@smthrs/platform-cloudflare`) for remote flows such as cloning. W5 no longer moves answering to Cloudflare, so wiring the Cloudflare flow host into `worker/`, which R3 needs, has no owner yet ([durable answering](durable-answering.md)).

- 22:42: the gap from 22:31 has an owner. The lead's 0011 docs agent writes W5 (c) into `HOST-PLAN.md`'s "Revised by 0011" section: wire `@smthrs/platform-cloudflare`'s flow host into `worker/` for remote flows such as `repo/Clone`. It also adds a Consequences line to 0011 naming that owner. Neither file had changed at 22:46, and W5 hasn't started. R3 still waits on W1 finishing and on W5 (c) ([durable answering](durable-answering.md)).
- 22:58: W1 finished; `@smthrs/effect-code-storage` gained a Retry-After test (`CodeStorageError` through `RetryPolicy.decide`) and `@smthrs/flow` as a devDependency, at 47 tests and 100% coverage ([durable answering](durable-answering.md)).
- 22:59: **W5 (c) started**: the flow host in the Worker and Alchemy, proven by a 2-step remote flow, the step R3's `repo/Clone` needs ([Cloudflare flow host](cloudflare-flow-host.md)).
- 23:01: **the integrations root started** ([integrations root](integrations-browser-safe-root.md)); its first file, a failing browser-bundle test, is on disk at 23:07. The [edge cache](platform-cloudflare-edge-cache.md) has no agent.
- 23:01: [Codex checkpoint review 2](code-reviews.md) found two P2 defects in `@smthrs/effect-code-storage`, not yet assigned:
  - `GitRemote.ts:106` and `:115` slice decoded strings by pkt-line lengths, which count bytes, so a repository whose default branch is non-ASCII (`日本語`) returns `invalid_response`. Codex reproduced it with the real `GitRemote.head`. Fix: frame on `Uint8Array` byte offsets; make the test helper count encoded bytes; test Unicode branch names across split chunks.
  - `internal/token.ts:65` and `:94` sign with ambient `globalThis.crypto.subtle`. Fix: an injected key-import and signing service from the host packages.
  - Also flagged: the review's P1 that the Cloudflare runtime can't run child flows; it matters if `repo/Clone` starts one ([Cloudflare flow host](cloudflare-flow-host.md)).
- 23:02: the lead's board: "2 Repo view: SDK + UI done; GitHub client works in browser/Worker (new) → app integration, after W5's Cloudflare host + an edge cache".
- By 23:12: review 2's findings on this feature are settled ([code reviews](code-reviews.md)):
  - `GitRemote` and non-ASCII branches: a new agent fixes it test-first; its first test change is on disk at 23:14 ([GitRemote byte framing](gitremote-unicode-branches.md)).
  - Ambient `crypto.subtle` in token signing: rejected by the lead; web-standard globals aren't platform code, so `internal/token.ts` stays ([web-standard globals](web-standard-globals-rule.md)).
  - The P1 on child flows has its own agent in `platform-cloudflare` ([Cloudflare flow host](cloudflare-flow-host.md)).
- 23:15: the integrations root has no `node:` import left in `src`, unreported ([integrations root](integrations-browser-safe-root.md)). W5's flow-host wiring is on disk in `worker/`, unreported. The [edge cache](platform-cloudflare-edge-cache.md) still has no agent.

- 23:27: **two of R3's prerequisites are done.** The [integrations root](integrations-browser-safe-root.md) runs in a browser and a Worker, and [`GitRemote`](gitremote-unicode-branches.md) reads non-ASCII branch names. The integrations package now moves to Effect `HttpClient` ([Effect HttpClient](integrations-effect-httpclient.md)), the client `repo/Inspect`'s size call will use. Left before R3: W5 (c), the child-flow fix and the [edge cache](platform-cloudflare-edge-cache.md), which still has no agent.

- 23:39: **W5 (c) is done**: the `FlowExecution` Durable Object is in ChatApi and the stack, and a 2-step remote flow resumes after a kill, so far against a stand-in Durable Object ([Cloudflare flow host](cloudflare-flow-host.md)). Left before R3: the child-flow fix, whose docs were written by 23:41, and the [edge cache](platform-cloudflare-edge-cache.md), still without an agent. The [flows root](flows-root-platform-neutral.md) fix, started 23:39, also concerns the Worker bundle `repo/Clone` runs in.
- 23:36 to 23:43: the [Effect HttpClient](integrations-effect-httpclient.md) move is on disk with its tests and a consumer change in `packages/smithers/src/operator/Integrations.ts`, unreported.

- 00:02 on 2026-10-20: the child-flow fix waits on its last engine-store coverage run before it reports ([Cloudflare flow host](cloudflare-flow-host.md)). The edge cache still has no agent. By 00:05 the browser gate passes `@smthrs/flows`, `@smthrs/integrations` and `@smthrs/effect-code-storage` for a Worker ([flows root](flows-root-platform-neutral.md)).

- 00:21 to 00:25 on 2026-10-20: **two more of R3's prerequisites are done.** The Cloudflare host runs child flows and handoffs on their own Durable Objects ([Cloudflare flow host](cloudflare-flow-host.md)), and `@smthrs/integrations` calls GitHub through Effect `HttpClient`, never following a redirect with a token ([Effect HttpClient](integrations-effect-httpclient.md)). The [edge cache](platform-cloudflare-edge-cache.md) is the last SDK piece, still without an agent at 00:27.

- About 00:35 on 2026-10-20: **the [edge cache](platform-cloudflare-edge-cache.md) started**, the last SDK piece before R3. Its scope widened to one platform-neutral immutable cache keyed by content address, with Workers Cache API, browser Cache Storage and memory layers. The lead told Will at 00:32: "It caches file reads by commit".


- 00:41 to 00:46 on 2026-10-20: the [edge cache](platform-cloudflare-edge-cache.md)'s code is on disk, unreported: `ImmutableCache` in `@smthrs/artifacts`, `EdgeCache.layer` in `platform-cloudflare` and `BrowserCache` in `platform-browser`. Its doc example is R3's case: `ImmutableCache.readThrough(ImmutableCache.key("repo.tree", repo, sha), readTree(repo, sha))`.
- 00:44: the lead's wiring checklist (scratchpad `final/WIRING.md`) puts the repo view after the edge cache: R3 (the clone flow and `RepoApi`), R4 (the routes), R5 (e2e, which needs the `smithersai/repo-view-fixture` repository), and the deploy secrets mapping `CODE_STORAGE_KEY` from `CODE_STORAGE_API_KEY` in `~/.zshrc`, with organization `smithers`.

- 00:52 on 2026-10-20, on disk, no report: the [edge cache](platform-cloudflare-edge-cache.md)'s changeset, catalog row and decision 0006's SHA-cache paragraph ("built 2026-10-20") are written. R3 to R5 and the `CODE_STORAGE_KEY` deploy-secret mapping are in the lead's [app wiring](app-wiring.md) step, after the edge cache reports.

- **By 01:00 on 2026-10-20: the [edge cache](platform-cloudflare-edge-cache.md) is done**, the last SDK piece. Nothing blocks R3 now.
- **About 01:00: R3 to R5 started**, in one agent. The lead to Will: "I've started two more agents. One builds repository cloning and viewing in the app." Its scope:
  - **R3, backend:** the `repositories` migration; `repo/Clone`, a durable flow on the [Cloudflare flow host](cloudflare-flow-host.md), with the [spend caps](code-storage-spend-caps.md) admission; `RepoApi` reading through `ImmutableCache`.
  - **R4, app:** `src/features/repo` and the three routes, `/$owner/$repo`, `/$owner/$repo/tree/$ref/$` and `/$owner/$repo/blob/$ref/$` (decision 0006).
  - **R5:** an e2e test on `octocat/Spoon-Knife`, the public repository the live Code Storage test mirrored at 22:06 on 2026-10-19, and `docs/features/repo.md`. Best guess: this replaces the planned `smithersai/repo-view-fixture` repository, which was never created.
- The owner line until 01:00, for history: "lead; R3 to R5 wait on the edge cache (running since about 00:35 on 2026-10-20; its service and Workers layer on disk by 00:44); the child-flow fix is done (00:21 on 2026-10-20); W5 (c), the [Cloudflare flow host](cloudflare-flow-host.md) wiring, is done (23:39); the integrations root, its `HttpClient` move (00:25 on 2026-10-20) and the `GitRemote` fix are done; feature 2 agent finished R1 and R2"
- As of 01:05: no R3 file on disk. `db/migrations/` ends at `0006_answer_parts.ts`, `src/features/` has no `repo` folder, and `worker/` has no `RepoApi`. No report.

- 01:06 to 01:14 on 2026-10-20: **R3 and R4 code is on disk**, unreported:
  - **R3, backend:**
    - the migration `db/migrations/0007_repositories.ts` and `db/Database.ts` (01:09);
    - `worker/Repos.ts` (01:10), `RepoUpstream.ts` (01:11), `RepoReads.ts` (01:12) and `RepoMetrics.ts` (01:14);
    - the clone flow, `worker/flows/RepoClone.ts` (01:13): `repo/Clone { id, owner, name, attempt, requestedAt }` runs `repo/Inspect`, then `repo/Import`, `repo/Pull`, `repo/AwaitSync` and `repo/Settle`; a refused or failed clone goes straight to `repo/Settle`. It runs remotely on the per-execution Durable Object, because it needs the Code Storage organization key, and on the Node host in tests. The host injects Postgres, Code Storage and GitHub; the engine owns retries and waits.
  - **R4, app:** `src/features/repo/` holds 13 files, written 01:06 to 01:14: `schema`, `flows`, `api`, `rows`, `contract`, `paths`, `reader`, `view`, `metrics`, `clipboard`, `queries`, `store` and `actions`. `src/router.tsx` is unchanged since 23:32 on 2026-10-19, so the three routes aren't wired yet.
  - Not yet: tests for the repo feature, `docs/features/repo.md`, the e2e test, the report.
- 01:14: a full `apps/mvp` unit run (scratchpad `full.log`, started 01:14:23) fails 3 of 349 tests; the same file passed at 01:04:
  - `db/Database.test.ts`, `migrateAndReport`: best guess, the new migration changes what it applies;
  - the `probe/Pause` cases in `worker/ExecutionHost.test.ts` and `ExecutionHost.workerd.test.ts`: expected `Parked` then `Settled`, got `Retrying` then `Settled`.
  - Whose run this is, and what changed `probe/Pause`, aren't on record.
- 01:12: Codex Astra review 3 started. It passes lightly over `features/repo` and `worker/Repo*.ts`, since they're still landing ([code reviews](code-reviews.md)).

- 01:20 to 01:27 on 2026-10-20, on disk, unreported:
  - **Screen:** `src/screens/repo/RepoScreen.tsx` and its CSS, and `features/repo/components/RepoPage.tsx`, `RepoHeader.tsx` and `RepoContext.tsx` (01:20).
  - **Flow and app logic:** `worker/flows/RepoClone.ts` (01:23) with `RepoClone.test.ts` (01:25); `features/repo/store.ts`, `contract.ts` and `actions.ts` (01:25 to 01:27).
  - **Tests:** `features/repo/api.test.ts` with `src/test/repoDevice.ts`, `worker/RepoApi.test.ts`, `worker/test/repos.ts` and `features/repo/repo.test.ts` (01:20 to 01:27).
  - Two probe files, `worker/zz_debug.test.ts` (01:22) and `features/repo/diag.test.ts` (01:23), were gone again by 01:43.
  - No report.

- 01:44 to 01:54 on 2026-10-20, on disk, unreported:
  - **R3:** `worker/RepoUpstream.ts`, `Repos.ts` and `RepoConfig.ts` (01:51), with `RepoConfig.test.ts` (01:47) and `RepoUpstream.test.ts` (01:44). `RepoUpstream` reads a spent rate limit's reset from a new `rateLimitResetAt` in `@smthrs/integrations`' error details: `x-ratelimit-reset` uncapped, "so a caller can tell a person when GitHub answers again" (changeset `integrations-rate-limit-reset.md`, 01:45). `worker/RepoApi.ts` (01:53) serves Electric's `repositories` shape whole and drops subset requests, like the ShapeProxy change ([local-first](local-first.md)). `worker/flows/RepoClone.test.ts` changed at 01:52.
  - **The live clone test:** `worker/RepoClone.live.test.ts` (01:48) runs RepoApi over the compose Postgres, with `repo/Clone` on the Node host, real GitHub and the real Code Storage organization. It clones `octocat/Spoon-Knife` and reads its tree and README through the GET routes. Without `CODE_STORAGE_ORG` and `CODE_STORAGE_KEY` it skips and names the missing credential.
  - **R4:** `features/repo/faults.test.ts` (01:45) and `contract.test.ts` (01:52). `src/router.tsx` is unchanged since 23:32 on 2026-10-19, so the three routes still aren't wired.
  - Not yet, as of 01:54: the routes, `docs/features/repo.md`, an e2e spec, the report.
- 01:59 to 02:01 on 2026-10-20, on disk, unreported: **R5's e2e spec and the feature doc.** `e2e/repo.spec.ts` (01:59) has three real-browser cases: "clone: two devices see the repository open on its README once Code Storage has it"; "browse: a file from the listing, its lines, a reload, and the permalink at the head commit"; and "refusals: a repository GitHub doesn't have says Not found, and so does a missing file". `docs/features/repo.md` exists (02:01). `src/router.tsx` is still unchanged, so the routes aren't wired yet, and no run of the spec is on record.

- 02:20 on 2026-10-20, on disk, unreported: `worker/flows/RepoClone.test.ts`, `worker/test/repos.ts` and `worker/test/flowHost.ts` changed. In scratchpad `full5.txt` (02:23) "repo/Clone on the Node host > each budget settles capacity with no Code Storage call" fails with Postgres `too many clients already`, a shared-stack limit ([dev stack hygiene](dev-stack-hygiene.md)). No R3 to R5 report.
- 02:18 to 02:35 on 2026-10-20, in the agent's transcript, unreported:
  - **Shared Postgres:** the agent sampled 93 to 102 connections during a full run and made each test engine default to 4 connections, opened lazily (`worker/test/flowHost.ts`, 02:25; `worker/test/repos.ts`). A full run fell from 24 failures to 10; after the lead raised Postgres to 300 connections, 2 ([dev stack hygiene](dev-stack-hygiene.md)).
  - **Coverage:** the repo files together, `RepoApi`, `RepoClone`, `RepoUpstream`, `RepoConfig` and `ExecutionHost`, pass 109 of 109 tests (02:26). Every repo file has 0 uncovered items (02:27): migration `0007_repositories`, the 14 `src/features/repo` modules, and `worker/ExecutionHost.ts`, `RepoApi.ts`, `RepoConfig.ts`, `RepoMetrics.ts`, `RepoReads.ts`, `RepoUpstream.ts`, `Repos.ts` and `flows/RepoClone.ts`.
  - **The full run** after the Postgres change (02:28, scratchpad `full7.txt`): 465 passed, 2 failed, 4 skipped. Neither red is a repo test: `agent.test.ts` streaming and `chat.test.ts`'s corrupt-shape case ([app wiring](app-wiring.md)).
  - **Final checks** (02:31 to 02:33): migrations `0007_repositories` and `0008_browser_answering` are both registered in `db/Database.ts`; typecheck is clean. `//apps/mvp:importRules` couldn't run, blocked by `@smthrs/std`'s stale `PACKAGE.ts` path ([agent root in the browser](agent-root-browser-safe.md)). Run directly, the import rules find 1 violation in 218 files: `src/features/repo/components/RepoPage.tsx:4` imports `@smthrs/ui/adapters/repo-view`, not the root (`rootImportsOnly`). That is the open exception question ([deep-import migration](deep-import-migration.md)).
  - `apps/mvp/AGENTS.md` (02:32) now names `RepoApi` beside `ChatApi`, and the agent reran `docs:check`.
  - `src/router.tsx` is still unchanged since 23:32 on 2026-10-19 at 02:35, so the three routes aren't wired, and no run of `e2e/repo.spec.ts` is on record.

- **By 02:35 on 2026-10-20: R3 to R5 are done**, reported by the agent. The lead to Will: "Repository clone and view is built". Signed-out people can browse; cloning needs sign-in.
  - **Tests:** 109 repo tests, every new file at 100% coverage. The live test cloned `octocat/Spoon-Knife` into the `smithers` Code Storage organization, then read its tree and README.
  - **Built:** migration `0007_repositories`; `worker/Repo*.ts`; `worker/flows/RepoClone.ts` with admission and spend alerts; `src/features/repo/**` and `RepoScreen`; `e2e/repo.spec.ts`; the bench's `repo` suite ([benchmarks](benchmarks.md)); `docs/features/repo.md`.
  - **Upstream fix:** `@smthrs/integrations` puts `rateLimitResetAt` on GitHub errors.
  - **Differences from decision 0006**, now written at the top of 0006: `repo/AwaitSync` is a step whose retry policy waits (2 s doubling to 30 s), not a `Poll.make`; `repo/tree` and `repo/read` run on the device and read through RepoApi's GET routes; a clone is a plain request; a new failure `empty`.
  - **Not built:** `repo/SetImports`, delivering the spend alert to Will, the chat embed and the large-fixture benchmarks. They are [repo follow-ups](repo-follow-ups.md).
  - **Handed over:** the router and boot wiring, to the wiring agent; its sub-agent C1 is on it ([app wiring](app-wiring.md)).
  - **One open question for Will:** the `@smthrs/ui/adapters/repo-view` deep import. A: allow it as one exception. B, which the lead recommends: move the heavy renderers (Shiki, about 10 MB, and Milkdown) into their own package, such as `@smthrs/repo-view`, imported from its root ([repo-view package split](repo-view-package-split.md)). `importRules` stays red on that one import until he answers.
- 02:41 to 02:42 on 2026-10-20, on disk, unreported: **the routes are wired.** `src/router.tsx` (02:41) has `/$owner/$repo`, `/$owner/$repo/tree/$ref/$` and `/$owner/$repo/blob/$ref/$` on `RepoScreen`, each loader calling `context.repo.actions.openRoute`. `src/boot.ts` (02:42) composes `Repo.layer`, `RepoStore.layer` and `RepoClient.layer`. C1's route-matching probe is scratchpad `c1/routes.mjs` (02:41). No run of `e2e/repo.spec.ts` is on record; it needs the app's engine worker loading ([app wiring](app-wiring.md)).

- 02:56:58 to 03:06 on 2026-10-20, scratchpad `wiring/e2e-1.log`, unreported: **`e2e/repo.spec.ts` ran in a real browser for the first time**, in the wiring agent's run, and all three cases (clone, browse, refusals) failed on the test's locator, not the page. Both `<main class="repo-screen">` and `<header class="repo-header">` carry `aria-label="Repository"`, so `getByLabel('Repository')` matches two elements (strict mode). The page shows the heading "octocat / Spoon-Knife" and a Clone button, and for a missing repository its name. The fix is in the [app wiring](app-wiring.md) step: one element labeled "Repository", or a narrower locator. Status stays done; the item's code was reported done at 02:35.

- 03:12 on 2026-10-20: the run finished with the three `repo.spec.ts` cases still red on the locator. 03:14:05, on disk, unreported: the wiring agent narrowed the spec's header locator to `header[aria-label="Repository"]`, a test change, not a page change. A rerun started about 03:16 ([app wiring](app-wiring.md)). Status stays done.
- 04:23 to 04:24 on 2026-10-20 (scratchpad `wiring/e2e-3.log`): all three `e2e/repo.spec.ts` cases (clone, browse, refusals) pass in the full serial run. Status stays done ([app wiring](app-wiring.md)).
- **04:43 on 2026-10-20, scratchpad `wiring/e2e-4.log` finished: 32 passed, 3 failed, 1 skipped in 13.9 minutes, unreported: all three `e2e/repo.spec.ts` cases fail on the fresh database.** Two clone requests for `github/octocat/spoon-knife` got 503 with `@smthrs/mvp/flows/StartConflict` (`repo.clone.request` outcome `unavailable`), and the page shows "Couldn't clone" with Try again. The missing-repository clone, whose id is new each run, started (202) and settled `not_found`. Best guess: the fresh database restarted the clone attempt at 1, while the dev Durable Object for `repo-clone:github/octocat/spoon-knife:1` still holds an earlier run's intent with another payload. The same three cases passed at 04:23 in `wiring/e2e-3.log`. A failing e2e is broken, so this item reopens as in-progress ([app wiring](app-wiring.md)).
- **04:45:23 to 04:55 on 2026-10-20, scratchpad `wiring/e2e-5.log`, one worker: 35 passed, 1 skipped, 0 failed in 9.9 minutes (exit 0), unreported. All three `e2e/repo.spec.ts` cases pass: clone (10.2 s), browse (14.3 s), refusals (14.8 s).** At 04:44:39 the wiring agent stopped `alchemy dev`, deleted the dev Durable Object state (`.alchemy/local/*FlowExecution*`), wiped Postgres (`docker compose down -v`, `pnpm db:up`, `pnpm db:migrate`) and restarted the dev server at 04:45:01; no source file in `apps/mvp` changed after 04:40. So the `StartConflict` cleared when the dev Durable Object state was wiped with Postgres, with no product change, which fits the 04:43 best guess. Status stays in-progress until the wiring agent reports the cause and says whether that is a dev-reset gap or a product bug ([app wiring](app-wiring.md)).
- **About 04:56 on 2026-10-20, the lead's ruling: the `StartConflict` is a product bug, not a dev-reset gap.** An execution id must never collide across a database restore, a rollback or a deployment that reuses Durable Object storage. So the clone's execution id comes from a UUID generated on the row, not from the `attempt` counter, which restarts. A regression test must show a new clone starting cleanly after a reset. The lead sent this to the wiring agent and told Will.
- 05:04 on 2026-10-20, on disk, unreported: **the clone-id fix.**
  - `db/migrations/0009_clone_ids.ts` (05:04:03) adds `repositories.clone_id uuid NOT NULL DEFAULT gen_random_uuid()`. The migration settles rows still `cloning` as `failed` `unavailable`, since no execution carries their new id; the page then shows Try again. It is registered in `db/Database.ts` (05:04:07).
  - `worker/Repos.ts` (05:04:26): a new attempt draws `clone_id = gen_random_uuid()`; admission and settle are fenced by `clone_id`, never `attempt`. The comment names the execution `repo-clone:<id>:<clone_id>`.
  - Not yet on disk: a regression test for a clone after a reset (no test file names `clone_id` at 05:04), or a run of `e2e/repo.spec.ts` with the fix.
- 04:57 to 05:00 on 2026-10-20 (scratchpad `wiring/bench.log`; `bench/results/2026-10-20T12-00-25Z.json`): the bench's `repo` suite failed its seed at 04:57 (90 s timeout), then passed 21 checks at 05:00 with no regressions against the 00:25 baseline ([benchmarks](benchmarks.md)).
- 05:05 to 05:13 on 2026-10-20, on disk, unreported: **the clone-id regression tests.**
  - `worker/RepoApi.test.ts` (05:06:16): "after a database reset that kept the Durable Objects, attempt 1 again starts cleanly and settles".
  - `worker/flows/RepoClone.test.ts` (05:06:48): "a run from before a reset can't admit or settle the new row, though both are attempt 1".
  - `db/Database.test.ts` (05:07:13): `0009_clone_ids` gives every row its own id and fails the clones started under the counter.
  - `worker/flows/RepoClone.ts`, `worker/RepoApi.ts`, `worker/Repos.ts` and `worker/RepoMetrics.ts` changed 05:05 to 05:09. `docs/features/repo.md` (05:08:50) documents `clone_id` and the execution id `repo-clone:<id>:<clone_id>`; decision 0006 (05:09:04) lists it as its fourth difference from the build.
  - Unit suite at 05:13:29 (scratchpad `wiring/unit5.log`): 495 passed, 4 skipped, 100% statements, branches, functions and lines.
- 05:15 to 05:24 on 2026-10-20, on disk, unreported: `worker/ExecutionHost.ts` and `worker/test/repos.ts` (05:15:54) map the host's `IntentConflict` to `StartConflict`; `worker/ErrorCode.ts` (05:22:36) gives `worker/RepoReads.ts` and `worker/Flows.ts` one `codeOf` for log lines. Still no `e2e/repo.spec.ts` run with the clone-id fix ([app wiring](app-wiring.md)).
  - Still missing: an `e2e/repo.spec.ts` run with the fix and without wiping the dev Durable Object state. Status stays in-progress.
- **05:53:06 on 2026-10-20, `wiring/e2e-fresh.log`:** "clone", "browse" and "refusals" pass (16.0 s, 21.9 s and 22.0 s) in the full run, 36 passed and 1 skipped. That run started on fresh Durable Object state (recreated 05:40:26), so on its own it doesn't show a clone after a reset; the unit regression tests (`db/Database.test.ts`, 05:07:13) do ([app wiring](app-wiring.md)).
- **05:54:14 on 2026-10-20, the wiring agent reported done.** Cause: "execution ids came from a counter that restarts after a database reset. They are now a UUID per attempt (migration `0009`)." Repo clone and view work end to end, and the bench repo suite passes 21 of 21 ([benchmarks](benchmarks.md)).
- **05:54 on 2026-10-20, the lead to Will:** "Open `/octocat/Spoon-Knife` to browse a cloned repository", one of six things to try ([decisions for Will](decisions-for-will.md), row 4). Status: done. The one `importRules` red left in the app is this view's deep import, waiting on Will ([repo-view package split](repo-view-package-split.md)).
- **05:56 on 2026-10-20: Will opened a repository page.** Will: "how do I view a repo?" The lead opened http://localhost:1337/octocat/Spoon-Knife: "Swap `github.com` for the app's address, as on GitHub", with `/tree/<branch>/<path>` for a folder and `/blob/<branch>/<path>?L=10-20` for a file. "Only public repositories work for now. The app has no link to a repository yet, so you have to type the URL." No defect from Will is on record by 06:05.
- 05:57 to 05:58 on 2026-10-20: Will asked to open a repository from chat; not yet possible. A [navigate flow](navigate-flow.md) the agent can call is being built.
- **06:08 on 2026-10-20: Fable review 2 found three P3s here** ([Fable review 2 fixes](fable-review-2-fixes.md)). P3-3: `worker/RepoApi.ts:127-130` refuses only the signed-out, so any GitHub account that authorizes the App can clone up to the cap (100 repositories, 3 GB) and block Members; the budgets bound the money, so it's denial of capacity. P3-7: the remote flow door ships answering 404 for every name, and `repo/Clone` starts from `RepoApi.ts:94-99` directly. P3-8: decision `0006:7` still says "no sign-in". The worker fix agent requires Member or above to clone, per 0007, and fixes the doc line; the engine and hosts agent decides the door. Status stays done: P3 findings don't reopen a done note.
- 06:14:43 on 2026-10-20, on disk, unreported: `worker/Flows.ts` says "every remote flow today is admitted by the route that starts it (docs/features/remote-flows.md#no-remote-door)", so the door goes and `repo/Clone` keeps starting from `POST /api/repos`. `RepoApi.ts` is unchanged since 05:07.
- **07:01:52 on 2026-10-20: P3-3 and P3-8 fixed, reported** by the worker Fable fix agent ([Fable review 2 fixes](fable-review-2-fixes.md)): cloning needs Member or above (`canClone`), so a Guest or a person with no role gets 403 `forbidden`; decision 0006 and `features/repo.md` no longer say otherwise.
- **07:07:38 on 2026-10-20: P3-7 fixed, reported:** the remote door is removed. "Nobody can start `repo/Clone` with a payload alone: `POST /api/repos` first checks sign-in, the repository cap, the budget, the row and the `cloneId`."
- 07:07:47 on 2026-10-20: the lead told the repo view extras agent to make `/clone` a local flow over that route; `repo/clone` is on disk from 07:08, offered to Members and up ([repo view extras](repo-view-branches-raw-clone.md)).

- **11:04 to 11:05 on 2026-10-20: [review round 4](review-round-4.md) on `@smthrs/effect-code-storage`, unrouted by 11:07.**
  - **R4-23 (Claude Fable S-P2-1 as P2, measured; Claude Opus P3-10 as P3, reproduced): `GitRemote.ref` re-parses the whole advertisement on every chunk** (`packages/effect-code-storage/src/GitRemote.ts:288-292`, `internal/bounded.ts:52-58`). Fable measured 10k refs at 165 ms, 20k at 625 ms and 40k at 2.8 s; at the 8 MiB cap (about 120k refs, a mirror with `refs/pull/*`) that is 25 to 30 s of CPU, past a Worker's budget, so `branch/track` on such a repository never answers. An advertisement over 8 MiB is `invalid_response`, which `docs/api.md:293` doesn't say. Fix: parse from the last complete packet and stop at the wanted ref or the flush; give truncation its own code.
  - Opus P3-10: `CodeStorage.gitRemote` ignores `CODE_STORAGE_API_URL` (`CodeStorage.ts:676-692`). Fable S-P3-3: request building and classification are duplicated (`GitRemote.ts:200-216` and `:272-287`; claims in `CodeStorage.ts:604-611` and `:681-688`). Fable S-P3-4: `docs/api.md:3, 6` says "two namespaces" for three exports, and `GitRemoteError.message` says `HEAD` for `ref` (`GitRemote.ts:57-59`).
  - R4-24 (Fable S-P2-2): the ambient `crypto.subtle` in Code Storage signing (`internal/token.ts:65, 94`); the lead rejected that finding at 23:12 on 2026-10-19 ([web-standard globals](web-standard-globals-rule.md)).
  - Verified by Fable: the pkt-line parser is byte-based at every cut offset (the [GitRemote byte framing](gitremote-unicode-branches.md) fix holds), and `ImmutableCache` is clean. Fable P3-1: anonymous repository reads are unthrottled and spend the monthly read budget ([repo view extras](repo-view-branches-raw-clone.md)).
  - Status stays done: the reviewers split on R4-23's severity, so it waits for the lead's ruling (round 4 tracker rule).
- **12:52:09 on 2026-10-20: R4-23 fixed** by [review round 4](review-round-4.md)'s SDK batch 2 agent, with a test that failed on the old code; uncommitted, changeset `git-remote-ref-linear`. `GitRemote.ref` and `head` read the advertisement one packet at a time and stop at the wanted ref or the flush, keeping the byte framing, fatal UTF-8 decoding and the cap. 4k to 16k refs take 5 to 11 ms each, where the 3k-to-12k test took 20 s. An oversized answer fails with a new `too_large` code; the cap in this working copy is 1 MiB. `effect-code-storage` is at 100% coverage. 12:55 (scratchpad `final/WIRING.md`): the changeset becomes minor before the release, since `head` gains a code. Status stays done.

## Next

From 12:52 on 2026-10-20: R4-23 is fixed and lands in round 3 of [land to main](land-to-main.md). Still left: Will's A or B answer on the deep import ([repo-view package split](repo-view-package-split.md)), the [repo follow-ups](repo-follow-ups.md), the Code Storage P3s (Opus P3-10, Fable S-P3-3 and S-P3-4) in the [P3 cleanup](review-round-4-p3-cleanup.md), and the list below.

Until 12:52 on 2026-10-20 the next step was, from 11:07 on 2026-10-20: the lead's ruling on round 4's R4-23 and the Code Storage P3s ([review round 4](review-round-4.md)). Still left: Will's A or B answer on the deep import ([repo-view package split](repo-view-package-split.md)), the [repo follow-ups](repo-follow-ups.md) and the list below. The [repo view extras](repo-view-branches-raw-clone.md) are done (10:52).

Until 11:07 on 2026-10-20 the next step was, from 07:07 on 2026-10-20: nothing from Fable review 2. Left: Will's A or B answer on the deep import ([repo-view package split](repo-view-package-split.md)), the [repo follow-ups](repo-follow-ups.md), the [repo view extras](repo-view-branches-raw-clone.md), and the list below.

Until 07:07 on 2026-10-20 the next step was, from 06:09 on 2026-10-20: the worker fix agent's clone role check with its test (P3-3) and the doc line (P3-8), and the engine and hosts agent's door decision (P3-7) ([Fable review 2 fixes](fable-review-2-fixes.md)). Also left: Will's A or B answer on the deep import ([repo-view package split](repo-view-package-split.md)), the [repo follow-ups](repo-follow-ups.md), and the list below.

Until 06:09 on 2026-10-20 the next step was, from 05:54:14 on 2026-10-20: done, reported 05:54:14 on 2026-10-20. Left: Will's A or B answer on the deep import ([repo-view package split](repo-view-package-split.md)), the [repo follow-ups](repo-follow-ups.md), the Fable review ([code reviews](code-reviews.md)), and the list below.

Until about 05:54 on 2026-10-20 the next step was, from about 04:56 on 2026-10-20 (the lead's ruling): the clone-id fix finished and proven. A regression test shows a new clone starting cleanly after a reset of the database or the Durable Object storage, and `e2e/repo.spec.ts` passes in the wiring agent's full run without wiping the dev Durable Object state. Then the wiring agent's report, and this item is done ([app wiring](app-wiring.md)). The list below still holds.

Until about 04:56 on 2026-10-20 the next step was, from 04:55: the wiring agent's report naming the `StartConflict` cause: dev Durable Object state outliving a Postgres wipe, or a clone attempt id that can collide in the product. If it's the dev reset, the reset clears both stores; if it's the product, a fix with a regression test. Then this item is done ([app wiring](app-wiring.md)). The list below still holds.

Until 04:55 on 2026-10-20 the next step was, from 04:43: a clone of `octocat/Spoon-Knife` starts on a fresh database, with the `StartConflict` fixed at its cause (see State), and `e2e/repo.spec.ts` green in the wiring agent's full run ([app wiring](app-wiring.md)). The list below still holds.

Until 04:43 on 2026-10-20, from 02:35, this item was done. What's left is elsewhere:
- C1's routes and boot wiring, then `e2e/repo.spec.ts` in a real browser, once the engine worker loads ([app wiring](app-wiring.md)). As of 03:06 the routes render, and the spec's three cases are red on the duplicate `Repository` label (see State). At 03:14 the locator is narrowed to the header; the rerun is pending.
- Will's A or B on the deep import ([repo-view package split](repo-view-package-split.md)).
- The `CODE_STORAGE_KEY` deploy secret (from `CODE_STORAGE_API_KEY`, organization `smithers`), in the [app wiring](app-wiring.md) step.
- `repo/SetImports`, the spend alert's delivery, the chat embed and the large-fixture benchmarks ([repo follow-ups](repo-follow-ups.md)).

Until 02:35 on 2026-10-20 the next step was: the R3 to R5 agent's report. Two things it can't settle alone: the `@smthrs/ui/adapters/repo-view` deep import needs the lead's or Will's call ([deep-import migration](deep-import-migration.md)), and the routes and the e2e need the app's engine worker loading ([app wiring](app-wiring.md)). Proof:
- the clone e2e mirrors `octocat/Spoon-Knife`, opens its tree and a Markdown file through the three routes, and survives a killed `repo/Clone` without a second import;
- admission refuses an import at capacity and says so, and a cache hit is served when the read budget is spent;
- tree and blob reads go through `ImmutableCache.readThrough`;
- 100% coverage and `docs/features/repo.md`.

Then the lead adds the `CODE_STORAGE_KEY` deploy secret (from `CODE_STORAGE_API_KEY`, organization `smithers`) in the [app wiring](app-wiring.md) step. The chat embed waits for feature 3's template registry (V3).

Until about 01:00 on 2026-10-20 the next step was: the [edge cache](platform-cloudflare-edge-cache.md) agent's report. Then R3 to R5 as listed below.

Until about 00:35 on 2026-10-20 the next step was: assign the [edge cache](platform-cloudflare-edge-cache.md), the last SDK piece before R3; `platform-cloudflare` is free since 00:21 on 2026-10-20. Then R3 to R5 as listed below. (Until 00:21 on 2026-10-20 the list below was the whole next step.)

- Store the Code Storage key in deploy secrets as `CODE_STORAGE_KEY`, with `smithers` as the organization `Config`. (The live round-trip test is done: 22:06, 2 of 2.)
- Build the two SDK pieces, which need neither W1 nor W5: [edge cache](platform-cloudflare-edge-cache.md) (no agent at 23:07) and [integrations root](integrations-browser-safe-root.md) (running since 23:01). (Integrations root done 23:27.)
- Fix review 2's two `@smthrs/effect-code-storage` defects before R3 depends on them. (By 23:12: the `GitRemote` fix is running; the `crypto.subtle` finding was rejected. Done 23:27: the `GitRemote` fix.)
- R3 (migration, `RepoApi`, `repo/Clone` with [spend caps](code-storage-spend-caps.md) admission in its Inspect step, Worker secrets) once [durable answering](durable-answering.md) W5 lands the Cloudflare host. R4 (routes and screens) after the `db`, `worker` and `src` rewrites; the chat embed after feature 3's template registry. R5: an e2e test that clones `smithersai/repo-view-fixture` and opens a Markdown file, with benchmarks and `docs/features/repo.md`.
- Later states: [repo open states](repo-open-states.md).

## Questions for Will

- Answered 22:05: the Code Storage organization is `smithers`. (Earlier question: what's the organization name?)
- Restart W1, so W5 and then R3 can proceed? Asked 22:09 to 22:14 on [durable answering](durable-answering.md). (Answered 22:16: accidental; restarted about 22:20.)
- Answered 21:49 and 21:51: Will bought Starter and put the key in `~/.zshrc` as `CODE_STORAGE_API_KEY`. (Earlier question: create the organization and add its key.)
- **Open, asked 02:35 and 02:36 on 2026-10-20:** `@smthrs/ui/adapters/repo-view` as one exception to root-only imports (A), or move the heavy renderers into their own package such as `@smthrs/repo-view`, imported from its root (B)? Recommended: B, so the rule has no exception ([repo-view package split](repo-view-package-split.md)).
- Allow `@smthrs/ui/adapters/*` as the one deep-import exception (`CodeFileView` is about 10 MB with Shiki)? Recommended: yes. Same question as [deep-import migration](deep-import-migration.md). Asked again at 22:15; second in line on [decisions for Will](decisions-for-will.md), after the design questions. (Replaced at 02:35 on 2026-10-20 by the A or B question above; the recommendation changed to B.)
- Markdown read-only for now? Edits would diverge from GitHub. Recommended: yes. Asked again at 22:15, with the adapters question.
