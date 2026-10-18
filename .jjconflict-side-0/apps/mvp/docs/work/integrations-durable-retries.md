---
title: Integration retries move into durable flow steps
status: done
area: sdk
owner: integrations retries agent (started about 00:33 on 2026-10-20, reported done about 01:03, with three callers outside a flow); found by the integrations agent (00:25 on 2026-10-20); the leftover issue-sync loop is its own item
updated: 2026-10-20
links: [issue-sync-ingest-retry-loop.md, integrations-effect-httpclient.md, everything-is-a-durable-flow.md, sign-in.md, sdk-test-reds.md, ../../../../AGENTS.md, ../../../../docs/libraries.md, repo-checks-green.md]
---

## What

Retries in `@smthrs/integrations` move from in-process loops into the flow engine's retry policy, so a retry survives a crash and one write makes a bounded number of HTTP attempts.
- `GitHubClient` and `OAuthToken` retry inside a step with an Effect `Schedule`, which doesn't survive a crash.
- Write-back actions also have a 3-attempt engine retry policy, so one write can make up to 12 HTTP attempts.
- The engine already honors a failure's `retryAfterMillis`, but `IntegrationFailure` drops GitHub's `retryAfterMs`. Once the failure carries it, the retry can move into the flow step.
- `OAuthToken`'s `rotatedFrom` is a hand-rolled sleep-and-reread loop. The proxy never retries.

## Why

Root `AGENTS.md` (Will, 2026-10-19, permanent): "The flow engine supplies retries, resumption after a crash, idempotency and deadlines. App and library code never write their own retry loops". A double retry also multiplies GitHub calls against the rate limit.

## State

- 00:25 on 2026-10-20: the integrations agent reported all four with the [`HttpClient` move](integrations-effect-httpclient.md) and left them unchanged, outside its brief. Not assigned.
- S1's token refresh uses this package's `exchangeRefreshToken` ([sign-in](sign-in.md)).
- 00:30: the lead told Will: "Another agent is moving those retries into the flow engine, which already honors GitHub's wait-before-retry header."
- About 00:33: **started.** The brief:
  - add `retryAfterMillis` to `IntegrationFailure`, so the engine's `RetryPolicy` waits GitHub's `Retry-After`;
  - delete the in-step `Schedule` retries, so the engine's `RetryPolicy` is the only retry and it is durable;
  - replace `OAuthToken.rotatedFrom`'s sleep loop with a durable wait;
  - list the callers outside a flow, which lose their in-process retry.
- 00:34, scratchpad probes, best guess this agent's: `tag.test.ts` and `probe.mts` construct an `IntegrationFailure` and print its `_tag` and `RetryPolicy.errorTag`, to check how the engine's policy matches the failure. The package's `src` is unchanged since 23:10 on 2026-10-19 (`Environment.ts`). No report.


- 00:41 to 00:46 on 2026-10-20, on disk, unreported:
  - `src/core/ActionFailure.ts` (00:42) adds a `RetryableIntegrationFailure` that carries `retryAfterMillis`, which replaces the engine policy's backoff. `GitHubClient.ts` (00:45) reads the server's `Retry-After` or `x-ratelimit-reset` into `retryAfterMillis`, capped; `Actions.ts` (00:42) says up to a minute. `OAuthToken.ts` (00:46) also returns retryable failures with the server's wait.
  - `Config.ts` (00:44), `CredentialHttp.ts` (00:45) and `IssueSync.ts` (00:42) changed, and so did the `Core`, `GitHubClient`, `ClientTracing`, `Examples`, `GitHubSync` and `IssueSyncDelivery` tests (00:41 to 00:43).
  - `maxRetries` is gone from `GitHubConfig`. `@smthrs/cli`'s `src/operator/Integrations.ts` (line 213) still passes it, so the release API-baseline declaration build failed at 00:45 ([repo checks green](repo-checks-green.md)). That caller is one this agent must move or list.
  - No test result or report.

- Between 00:47 and 00:52 on 2026-10-20: **the lead told this agent to fix `@smthrs/cli`'s `src/operator/Integrations.ts:213`**, the `maxRetries` consumer that broke the API-baseline declaration build ([repo checks green](repo-checks-green.md)).
- 00:47 to 00:53 on 2026-10-20, on disk, unreported:
  - **The CLI caller is changed** (00:52): `probe` now calls `GitHubClient.make({ token, apiBaseUrl: entry.apiBaseUrl }, {})`. No `maxRetries` remains in the CLI or in the package's `src`.
  - **The crash test exists:** `test/WriteBackResume.test.ts` (00:51) adds "add-labels resumes after a crash between attempts, waits the persisted Retry-After, and writes once", beside four resume cases for `add-labels`, `upsert-comment`, `check-run` and `link-pr`.
  - `Actions.ts` (00:47), `ActionFailure.ts` (00:52) and `github/Sync.ts` (00:53) changed, with `OAuthToken.test.ts` (00:48), `test/Http.ts` (00:49), `GitHubActions.test.ts` (00:51) and `GitHubSync.test.ts` (00:53). A backup, scratchpad `ActionFailure.bak` (00:52), is best guess this agent's.
  - No changeset for this change, no test result and no report.

- 00:55 to 00:57 on 2026-10-20, on disk: the `Core`, `Examples`, `GitHubActions` and `OAuthToken` tests (00:55), then the package's README and docs (`api.md`, `concepts/durable-actions.md`, `guides/github.md`, `quickstart.md`, `troubleshooting.md`, `testing.md`; 00:56 to 00:57).
- 01:02: **changeset** `.changeset/integrations-engine-retries.md`: a major bump for `@smthrs/integrations` and a patch for `@smthrs/cli`. "The flow engine is now the only retry." `GitHubClient` and `OAuthToken` make one request per call; a failure carries `details.retryable` and `details.retryAfterMillis`, capped at one minute; `RetryableIntegrationFailure` is the retryable tag and `IntegrationFailure` is never retried; `maxRetries` is removed; `OAuthToken` no longer sleeps and rereads after a refused rotation. "A caller outside a flow step now gets one attempt."
- **About 01:03 on 2026-10-20: done**, reported to the lead:
  - **Requests per write:** at most 3, down from 12.
  - **Final failures stop at once:** a 404 or 422 no longer retries.
  - **Rate limits:** a `Retry-After` is honored, even after a crash.
  - **Tests:** 1,104, at 100% coverage.
  - **Left:** one hand-rolled retry loop in the issue-sync ingest. Nothing in the repository uses it, so the lead queued it for deletion in a cleanup ([issue-sync retry loop](issue-sync-ingest-retry-loop.md)).
  - The brief the lead wrote for this refresh, before the report, still listed this item as running.

- **Callers outside a flow**, from the agent's report as the lead relayed it in the brief for the refresh at about 01:13 on 2026-10-20. Each now makes one attempt, with no retry:

  | Caller | Where | What a failure means now |
  |---|---|---|
  | the CLI's `probe` | `@smthrs/cli`, `src/operator/Integrations.ts` | the check reports the failure; run it again |
  | the sign-in code exchange | `apps/mvp`, `worker/GitHubAuth.ts` ([sign-in](sign-in.md)) | a GitHub 429 or 5xx fails that sign-in; the person signs in again |
  | `GitHub.Sync`, the issues and pull-request sync adapter | `@smthrs/integrations`, `src/github/Sync.ts` | the page fails; its sync driver commits each page with its cursor |

  - The `IssueSync.ingest` `setTimeout` loop remains, still at `src/core/IssueSync.ts` lines 127 to 137 at 01:17 ([issue-sync retry loop](issue-sync-ingest-retry-loop.md)).
- 01:12: Codex Astra review 3 checks `RetryableIntegrationFailure`, the `HttpClient` move and redirect safety as finished work ([code reviews](code-reviews.md)).

## Next

None for this note, unless Codex Astra review 3 finds a defect here ([code reviews](code-reviews.md)). Best guess one attempt is right for all three callers outside a flow: each is a request a person or a driver repeats. If one must survive a crash, it moves into a flow step. The unused issue-sync retry loop is [its own item](issue-sync-ingest-retry-loop.md).

Until about 01:13 on 2026-10-20 the next step said: none for this note. The unused issue-sync retry loop is [its own item](issue-sync-ingest-retry-loop.md). The report doesn't list callers outside a flow; the CLI's `probe` is one, and the changeset says such a caller now gets one attempt.

Until about 01:03 on 2026-10-20 the next step was: the agent's report, test first:
- a 429 waits its `Retry-After`;
- a crash between attempts resumes without a second write;
- one write makes at most the engine policy's attempts, not 12.

Also needed: 100% coverage, a changeset, docs, and the list of callers outside a flow, each moved into a flow step or listed with an issue. The CLI's `probe` is one: it calls the client outside a flow. The API-baseline build should pass once this lands ([repo checks green](repo-checks-green.md)).

Until about 00:33 on 2026-10-20 the next step was, as a best guess: carry `retryAfterMs` on `IntegrationFailure`, delete the `Schedule` retries so the engine's policy is the only one, and replace `rotatedFrom`'s loop with a durable sleep in the step that calls it. Test first: a crash between attempts resumes without a second write, and a 429 waits its `Retry-After`.

## Questions for Will

None.
