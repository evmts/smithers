---
title: The site's deployment test loads apps/mvp under Node
status: done
area: infra
owner: site-test fix agent; reported done 07:51:39 on 2026-10-20 (7 of 7 in `deployment.test.mjs`); the lead removed the dangling `review-evidence` symlink; nothing committed, so it lands in round 2 of the landing. Until 07:51: a small fix agent, started by the lead at 07:34:02 on 2026-10-20; unreported
updated: 2026-10-20
links: [land-to-main.md, repo-checks-green.md, land-and-deploy-mvp.md, infrastructure-as-code.md, dev-stack-hygiene.md, ../../../../AGENTS.md, docs-check-flow-outcome.md, api-baseline-rerecord.md]
---

## What

`apps/site`'s `check:docs` runs `scripts/deployment.test.mjs` under plain Node. Its test "every hostname has one owning Worker, in this repository or in the canary manifest" imports each app's `alchemy.run.ts` to read the domains it claims. `apps/mvp/alchemy.run.ts` now reaches app modules written for Vite and Wrangler, whose import paths have no file extension, and Node's ESM loader refuses them:

```
pnpm --filter @smithers/site run check:docs
  node --test scripts/deployment.test.mjs
    import apps/mvp/alchemy.run.ts
      └─ src/flows/declarations.ts imports .../features/agent/flows   (no .ts)
           ERR_MODULE_NOT_FOUND            ✖ 1 of 100 site tests
```

Best-guess fix, the agent's choice: read each stack's domains without loading the app's modules, or give those imports their extensions. The test still fails when one hostname has two owners.

## Why

It is the one red check on `main` after round 1 of [land to main](land-to-main.md) (`bba8df6fab`). A red check on `main` hides the next real regression, and round 2 should land on green.

## State

- 07:24:49 on 2026-10-20, scratchpad `site-check.log`, run in the lander's workspace `~/smithers-lander`: 99 of 100 site tests passed. `deployment.test.mjs:93` failed: "Cannot find module '…/apps/mvp/src/features/agent/flows' imported from …/apps/mvp/src/flows/declarations.ts".
- 07:30:21, the lead to Will: "Still red: one site test fails because it loads the new app under Node; I'll have it fixed."
- 07:30:37, the lander: it "fails for a real reason (how it loads the app), not because of load".
- **07:34:02: the lead started a small agent to fix it.** No report by 07:37.
- **07:51:39 on 2026-10-20: the agent reported done.** It changed the test, not `apps/mvp`; nothing is committed.
  - **Why it loaded `apps/mvp`:** the test imported every `alchemy.run.ts` to read the exported `domain` objects. `apps/mvp` exports none and claims no hostname, so the import pulled in its whole worker and `src` tree for nothing.
  - **Why not add `.ts` extensions:** "Adding `.ts` extensions would not fit repository conventions: `apps/app` has about 5,600 extensionless imports, `apps/mvp` has 633 against 351, and Vite and Alchemy bundle this code rather than Node."
  - **The change** (`apps/site/scripts/deployment.test.mjs`, 07:37): it parses every file that imports `alchemy/Cloudflare` in each stack's import graph and reads each `domain` (name, aliases, redirects) and each route `pattern`. Stricter than before: it covers Workers declared outside `alchemy.run.ts` (for example `apps/mvp/worker/ChatApi.ts` and `infra/ElectricGateway.ts`), fails on any hostname that isn't a literal, and checks that it finds bug-worker's two hostnames, so an empty read can't pass. All 7 tests pass in 0.1 to 0.3 s, where the old one failed after 8.5 s.
  - **`check:docs` still exited 1, for two reasons outside this change:** `~/smithers/review-evidence` was a broken symlink to a folder deleted since Sep 12, which failed `support-matrix.test.mjs` "generation repairs output drift"; and `sync-api-docs --check` reports `crypto.mdx` and `platform-cloudflare.mdx` out of date, from other agents' unfinished `crypto` and `platform-cloudflare` changes in the working copy.
- **07:51:49 on 2026-10-20, the lead to Will:** "The red site test is fixed. The test was importing the whole new app just to read its hostnames; it now reads them from source, which is stricter and takes 0.2 seconds instead of failing after 8.5. I also removed a broken local shortcut from September (`review-evidence`, untracked) that failed a docs test on this Mac." At 07:53, `~/smithers/review-evidence` is gone.
- **Status moved from in-progress to done** on the 07:51 report.
- **13:04:55 on 2026-10-20: landed on `main`** in round 2's docs commit `c9d1e0c5ed` (`apps/site/scripts/deployment.test.mjs`) ([land to main](land-to-main.md)). The lander's final checks passed `docs:check` and the site's `check-docs` at about 13:00, after its `docs:sync` regenerated the API reference for `agent`, `flow`, `model` and `platform-cloudflare`.

## Next

From 13:04 on 2026-10-20: none; it's on `main`.

Until 13:04 on 2026-10-20 the next step was: Done. It lands in round 2 of [land to main](land-to-main.md). Left in `check:docs`, not this item's: the `sync-api-docs` drift on `crypto.mdx` and `platform-cloudflare.mdx`, which a `pnpm docs:sync` clears once those SDK changes land.

Until 07:51 on 2026-10-20 the next step was: The agent's report: `check:docs` green, the test still catching a hostname claimed twice, and the fix landed in round 2 ([land to main](land-to-main.md)).

## Questions for Will

None.
