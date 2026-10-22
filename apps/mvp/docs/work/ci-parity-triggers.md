---
title: CI parity: GitHub events start repository flows
status: in-progress
area: sdk
owner: Codex GPT-6.1 Sol (ci-spine)
updated: 2026-10-23 PDT
links: [../proposals/ci-cd-parity.md, ../features/ci.md, issues.md, no-github-actions.md, ../features/issues.md, ../decisions/0017-everything-is-a-plugin.md]
---

## Built, 2026-10-22 (the CI spine's slice 4)

- With `REPO_FLOWS=true`, the webhook route starts `triggers/Dispatch` (`triggers/dispatch:<delivery>`) for every push and pull request; only repositories named by `REPO_FLOWS_REPOSITORIES` may start flows (`worker/github/Api.ts`, `worker/ci/Dispatch.ts`). It reads `.smithers/factory.json` on the default branch as a `Plugin.Manifest`, keeps the `github.push` and `github.pull_request` trigger rows that match (`worker/ci/Triggers.ts`: `branches`, `tags`, `actions`, globs) and whose flow's `flow.ts` is on the default branch, and starts each as `repo/Run` under `<flow>:<delivery>` with `{ repo, sha, ref, event }`. A fork's pull request or one from below Member runs with `secrets: false`. Each run reports `smithers/<flow>` on the commit ([CI on Smithers](../features/ci.md#triggers)).
- **Conflict with this note's design, resolved by FLOW-10:** the proposal's `triggers` literal on `Flow.make` is not built. Triggers are manifest data (flows-as-code-api.md §5.7-5.8, "a flow file never says when it runs"); `Trigger.bind` in `FACTORY.ts` is the authoring helper still to build, and it projects to the same JSON.
- Execution ids: `<flow>:<delivery>` as asked, not `<repo>:<flow>:<delivery>`: delivery ids are GUIDs, unique across repositories.

**Not built:** `trust: "base"`; tags beyond push filters, issues, comments, labels and reviews; the Smithers agent answering mentions; `concurrency` and path filters (their own notes).

## What

The webhook route starts each active repository flow whose trigger matches a push, pull request, tag, issue, comment, label or review, for every repository the GitHub App is installed on.

## Why

Today `POST /api/github/webhook` starts only `github/Apply` and `triage/Run`, for one synced repository (`worker/github/Api.ts:323-405`; `worker/github/Config.ts:1-5`). Pushes to the default branch and releases become notifications only (`worker/Notifications.ts:261-290`). 28 of the 44 live workflows start on these events.

## Repositories

Smithers, Tevm, Effect.

## Smallest slice

Push and pull request first. Match `on`, `branches`, `tags` and `types`; start with `{ repo, sha, ref, event, pr }` under execution id `<repo>:<flow>:<delivery>`. Triggers come from the default branch's active snapshot; a pull request's body loads at its head unless the trigger says `trust: "base"` (GitHub's `pull_request_target`). Fork pull requests, and pull requests from people below Member, run without secrets. Then tags, issues, comments, labels and reviews, with `contains`, `startsWith` and `minimum` role filters for comment commands (Tevm's `@claude`, Effect's `/effect-bot` and `/rebase`). The Smithers agent answers a mention, replacing claude-code-action.

## Disposition

Build now, 4 of 18. Matrix rows 1 to 6 and 31. Design: [the CI/CD parity proposal](../proposals/ci-cd-parity.md).

## History

2026-10-20 22:50 PDT: written by the Claude Opus merger from the merged CI/CD parity proposal (Opus and Codex Sol designs, ruling FLOW-8).

## Rebase and rollout, 2026-10-23

Owner: Codex GPT-6.1 Sol (ci-spine). Rebased onto eeb01ea499d0; retained main’s per-repository roles and ViewRealm helper. Recorded decision 0082 and added a closed-by-default repository flow allowlist and the exact legacy main factory fixture. Validation receipts follow below. Library catalog: new Sucrase transform entry (no prior runtime TypeScript/import transform entry); sandbox uses the existing `@smthrs/plan` entry via `workspace:*`.

## CI-spine rebase receipt, 2026-10-23

Rebased on `eeb01ea499d0`; migration `0053_repo_runs`, generated device epoch 75, decision 0082. Latitude full app gate: 308 files passed, 4,014 tests passed, 2 expected failures and 17 skips; all four coverage metrics 100%, exit 0. Mini CI fixture: 1/1 passed. The grant-store summary integration test now verifies six real ModelStep attempts and allows 90 seconds because the unchanged retry policy can spend 31 seconds in delays. Sandbox: 61 files, 862 tests passed, 31 platform skips, all four coverage metrics 100%. Final typecheck and importRules passed. Docs site generation completed with no output changes; both docs CLI tails timed out after 180 seconds, so the lander runs docs:check on the MacBook as requested. This receipt supersedes the earlier rebase and coverage blockers in this note.
