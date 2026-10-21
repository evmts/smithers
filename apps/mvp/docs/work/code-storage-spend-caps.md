---
title: Code Storage spend caps (fail gracefully at capacity)
status: done
area: infra
owner: spend caps agent (finished 22:06); enforcement ships with R3 of repo clone and view
updated: 2026-10-21 00:14 PDT
links: [repo-follow-ups.md, ../decisions/0006-repo-clone-and-view.md, ../todo.md, ../rules.md, ../../../../docs/libraries.md, repo-clone-and-view.md, token-spend-alerts.md, platform-cloudflare-edge-cache.md, integrations-browser-safe-root.md, decisions-for-will.md, ../decisions/0011-the-agent-runs-in-the-browser.md]
---

## Tracker reconciliation — 2026-10-21 00:14 PDT

**What:** Keep graceful Code Storage admission and align Config caps with the purchased plan.

**Why:** Will wants the larger git-hosting plan rather than the old small limits.

**Current state:** ARCH-13 and the 00:09 queue answer request an upgrade around $200. At 00:10 the lead explains existing 3 GB/40 GB caps belong to the $20 plan; Will owns billing. No upgrade or new limit receipt exists. Existing enforcement remains completed; the new configuration follow-up is pending.

**Next step:** After Will upgrades, obtain actual plan limits and raise the storage, read, repository and budget Config values consistently; retain graceful capacity behavior.

**Open questions for Will:** Confirm upgraded plan and included limits when available; no credential values.

Evidence: script-filtered user text and lead replies through 00:13 PDT; queue answers through 00:10 PDT, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product checks are reported receipts; tracker validation is the site build. Execution ownership retained; Codex curates documentation only.

## Earlier tracker history (retained)


## What

Smithers enforces its own Code Storage budget, because Pierre won't stop at $20:
- Budgets as Effect `Config`, with defaults that keep the monthly bill at or under $20: total hot GB, outbound GB per month, `REPO_MAX_REPOSITORIES` (already 100) and a per-repository size limit.
- Admission in `repo/Clone`'s Inspect step. Over a budget, the flow settles with a typed `capacity` outcome; it doesn't fail or retry forever.
- What a person sees, in honest product words (M-46): imports paused while existing repositories stay readable; a busy Code Storage retried by the durable flow honoring `Retry-After`; an over-budget read served from the SHA cache when it can be.
- Metering we own: bytes stored per repository and bytes read, in a Postgres row and metrics; a `code_storage_bytes_read` counter by operation in `@smthrs/effect-code-storage`.
- Alerts to Will at 50%, 80% and 100% of the monthly budget, beside the [token-spend alert](token-spend-alerts.md).
- An operator switch that pauses imports, as a flow.

## Why

Will, 2026-10-19, 21:49: "pierre is spinning up servers I only did $20 plan though so we should have it set up so we fail gracefully if we reach capcity". Then, 21:52: "make sure you don't use code storage apis without first wrapping it in effect".

## State

- 21:49 on 2026-10-19: Will bought Starter. The lead checked code.storage pricing and `/docs/api/overview.md`:
  - $20 is a minimum monthly spend, not a cap; usage above it is billed.
  - Hot storage $0.005/GB/hr (about $3.60 per GB-month); cold $0.0002/GB/hr for repos untouched more than 7 days; inbound $0.06/GB; outbound $0.15/GB. $20 buys about 5.5 GB-months hot, or about 133 GB outbound.
  - "Capacity" therefore means our own budget, plus Code Storage's `429 rate_limited`, 5xx, `409 repository_thawing` (with `Retry-After`) and `403 authentication_unavailable`. `@smthrs/effect-code-storage` already classifies these as transient and parses `Retry-After` into `retryAfterMs`.
- About 21:50: the lead started one agent. Scope:
  1. Research from `code.storage/docs/llms.txt`: whether the API reports usage or repository size, any documented plan or rate limit, and whether a GitHub repo's size is knowable before import without spending GitHub's 60-per-hour unauthenticated quota.
  2. Design: a "Capacity and spend" section in decision 0006, with a table of recommended defaults.
  3. SDK, test first: the bytes-read counter, unknown codes mapped to their status's generic code, at 100% coverage, with `pnpm docs:sync` and `pnpm docs:check`.
  4. A Code Storage spend item in `todo.md` under the spend-alerts section.
  - It edits only `packages/effect-code-storage/**`, decision 0006 and `todo.md`. The clone flow itself waits for W5, so it isn't built here. It never reads or prints a key.
- 21:52: the rule is enforced: mvp `ImportRules` bans `@pierre/storage` (rule `effect.wrap-every-library` in `rules.md`). The spend caps extend the same wrapper.
- `@smthrs/flow`'s `RetryPolicy.decide` reads `retryAfterMs` while `ModelError` carries `retryAfterMillis`; W1 owns that fix ([durable answering](durable-answering.md)).
- 21:54: no report yet. Decision 0006 (last changed 21:29), `todo.md` and `packages/effect-code-storage/src` are unchanged on disk.
- On disk by 22:02, uncommitted, not yet reported: parts 1 to 4 are written.
  - Research, in decision 0006's new "Capacity and spend" section: Code Storage has no usage or billing API (`repos.get` returns no size) and publishes no rate limit; a 429 carries `Retry-After`. A repo untouched 7 days goes cold and answers `409 repository_thawing` until thawed. A GitHub repo's size before import comes only from GitHub's REST `GET /repos/{o}/{n}` (KB, hourly, 0 for a new repo), so Inspect sends an optional `GITHUB_TOKEN` when set (5,000 an hour instead of 60).
  - Budgets, as Effect `Config`, holding a worst-case month to about $17:

    | Config | Default | Worst-case month |
    |---|---|---|
    | `REPO_MAX_STORED_GB` | 3 | $10.80 |
    | `REPO_MAX_READ_GB_PER_MONTH` | 40 | $6.00 |
    | `REPO_MAX_SIZE_MB` | 1,000 | within the 3 GB |
    | `REPO_MAX_REPOSITORIES` | 100 | |
    | `REPO_BUDGET_USD` | 20 | base for alerts |

    `smithersai/smithers` (0.62 GB) fits; `facebook/react` (1.15 GB) doesn't.
  - Admission in `repo/Inspect` under one `SELECT … FOR UPDATE` on `repo_imports`; the first rule that holds decides: `paused`, `size_unknown`, `too_large`, `storage`, `reads`, else `Admitted`. `Capacity` settles as `status = 'capacity'`, never a failure or a retry.
  - What a person sees: **Imports paused**, **Too large to import · 1.2 GB of 1 GB**, **Can't check its size until 15:40**, **Code Storage is busy**, **Reading paused until Nov 1**; ready repositories keep opening. Over the read budget, RepoApi serves tree and blob responses from a SHA-keyed edge cache.
  - Metering: `repositories.stored_bytes`, a `code_storage_usage` row per month, a `repo_imports` pause row, and metrics `code_storage_bytes_read`, `repo_stored_bytes`, `repo_spend_estimate_usd`, `repo_capacity`.
  - Alerts: each usage write recomputes the month's estimate; crossing 50%, 80% or 100% of `REPO_BUDGET_USD` starts `ops/alert` once a month per threshold, through `@smthrs/notifications` `Alerts.layerWebhook`, the token-spend alert's flow.
  - Operator switch: the flow `repo/SetImports {paused}`, CLI only until auth lands.
  - SDK, in `@smthrs/effect-code-storage` (changelog, tests and docs changed 22:01): `code_storage_bytes_read` by operation and `bytesRead` on each page; `retryAfterMs` renamed `retryAfterMillis` to match W1's `RetryPolicy`; unknown codes become their status's generic code, kept as `unknownCode`.
  - `todo.md` has the Code Storage spend item under spend alerts: the SDK parts are built, the rest lands with R3.
  - Prerequisites the design names for R3: an injected Cache API service in `@smthrs/platform-cloudflare`, and a fix for `@smthrs/integrations`' Node-only root (its `GitHub.GitHubClient` makes the size call).
- About 22:00: the lead lists the agent as still running.
- 22:06: the agent reported done. **Done for design and SDK**; uncommitted.
  - Design: decision 0006's "Capacity and spend" section. Worst-case month about $17 under the defaults above (3 GB stored $10.80, 40 GB read $6.00, 1 GB per repository, 100 repositories, $20 budget).
  - SDK, `@smthrs/effect-code-storage`: the `code_storage_bytes_read` counter, `bytesRead` on each page, unknown codes mapped to their status's generic code, and `retryAfterMs` renamed `retryAfterMillis`. 46 tests at 100% coverage.
  - A busy Code Storage: the durable flow retries after the `Retry-After` wait, and a new test proves the flow engine reads it.
  - Code Storage has no usage or billing API, so Smithers meters every byte read itself.
- 22:06: the live clone test passed against organization `smithers` ([repo clone and view](repo-clone-and-view.md)), so the metered client now runs against the real service.
- Not built here, by design: admission in `repo/Inspect`, the `code_storage_usage` meter rows, the alerts and the `repo/SetImports` switch. They land with R3, which waits on [durable answering](durable-answering.md) W5 and two SDK pieces ([edge cache](platform-cloudflare-edge-cache.md), [integrations root](integrations-browser-safe-root.md)).
- 22:31: decision 0011 rescopes W5, which this item's enforcement waited on. Admission in `repo/Inspect` now waits on the Cloudflare flow host being wired into `worker/` for `repo/Clone` ([repo clone and view](repo-clone-and-view.md)).

- 23:27: one of the two SDK prerequisites is done: `@smthrs/integrations`' root, whose `GitHub.GitHubClient` makes the size call, runs in a Worker ([integrations root](integrations-browser-safe-root.md)). The [edge cache](platform-cloudflare-edge-cache.md) is still unassigned.
- About 01:00 on 2026-10-20: **enforcement started.** R3 to R5 began, building `repo/Clone` with this design's admission, and the [edge cache](platform-cloudflare-edge-cache.md) that serves a hit when the read budget is spent is done ([repo clone and view](repo-clone-and-view.md)).
- **By 02:35 on 2026-10-20: enforcement is built**, reported with R3 to R5: `worker/flows/RepoClone.ts` runs admission, and `worker/RepoMetrics.ts`' `recordSpend` sets `repo_spend_estimate_usd` and, the first time a month crosses a threshold of `REPO_BUDGET_USD`, logs `repo.spend.alert` and counts `repo_spend_alerts`. **Not built:** delivering the alert to Will, and the `repo/SetImports` switch. Both are [repo follow-ups](repo-follow-ups.md).

## Next

Nothing left in this item. Admission and the alert line are built (by 02:35 on 2026-10-20); the alert's delivery and `repo/SetImports` are [repo follow-ups](repo-follow-ups.md). Until 02:35 this read: "Enforcement: `repo/Clone` (R3 of [repo clone and view](repo-clone-and-view.md)) implements admission once W5 lands; the alerts ship with the [token-spend alerts](token-spend-alerts.md); `todo.md` tracks the open boxes."

## Questions for Will

- Where should the 50/80/100% alerts reach you? Same open question as the token-spend alert.
- The budget defaults above (3 GB stored, 40 GB read a month, 1 GB per repository) hold a month to about $17. Building proceeds on them; change any number by saying so.
