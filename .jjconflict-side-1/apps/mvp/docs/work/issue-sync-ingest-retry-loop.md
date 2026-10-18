---
title: Delete the unused issue-sync retry loop
status: todo
area: sdk
owner: unassigned; the lead queued it for "a cleanup" (about 01:03 on 2026-10-20)
updated: 2026-10-20
links: [integrations-durable-retries.md, everything-is-a-durable-flow.md, repo-checks-green.md, ../../../../AGENTS.md, ../../../../docs/libraries.md]
---

## What

The last hand-rolled retry loop in `@smthrs/integrations`. `IssueSync`'s `ingest` (`packages/smithers/agent/integrations/src/core/IssueSync.ts`, about lines 125 to 139) posts an event to `/events`. When a reaction post gets a `409`, it sleeps `100 * 2 ** attempt` ms with `setTimeout` and tries again, up to 4 attempts.

Nothing in the repository uses `IssueSync`: no TypeScript package or app imports it, outside its own tests and the public export-map fixture. The Go backend has its own issue sync. So the lead's plan is to delete it, not move it into a flow step.

Best-guess spec:
- Confirm no consumer with a repository-wide search, including `apps/app` and `.smithers/flows`.
- Delete `IssueSync` and its tests (`IssueSyncDurability`, `IssueSyncDelivery`, `IssueSyncIntake`), its export subpath, its `PACKAGE.ts` entries and its row in the public export-surface fixture.
- Add a changeset for `@smthrs/integrations` and refresh its docs.
- If a consumer turns up, it becomes a durable step under `Core.ActionFailure.retryPolicy` instead.

## Why

Root `AGENTS.md` (Will, 2026-10-19, permanent): "App and library code never write their own retry loops". Will, 2026-10-19: "we have no tolerance for tech debt or dead code."

## State

- About 01:03 on 2026-10-20: the [integrations retries](integrations-durable-retries.md) agent reported the loop as the one left. The lead to Will: "One hand-rolled retry loop is left in the issue-sync ingest. Nothing in the repository uses it, so it's queued for deletion in a cleanup."
- Not assigned. The [repo checks](repo-checks-green.md) agent edits the public export-map fixture this deletion would also change.
- About 01:13 on 2026-10-20: the lead's brief for this refresh confirms the loop remains and that this note tracks it.
- As of 01:17: the loop is unchanged at `IssueSync.ts` lines 127 to 137, a `for (let attempt = 0;; attempt++)` with `setTimeout(resolve, 100 * 2 ** attempt)`. The repo checks agent is still running; its API-baseline declaration build started again at 01:15. Not assigned.

## Next

Assign it after the repo checks agent reports, since both touch `public-export-surface.json`. Proof: no `setTimeout` retry or sleep loop remains in the package's `src`; typecheck, lint, tests at 100% coverage, the export-map check, `pnpm docs:sync` and `pnpm docs:check` pass.

## Questions for Will

None.
