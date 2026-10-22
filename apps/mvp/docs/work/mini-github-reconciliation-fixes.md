---
title: Fix GitHub reconciliation, credentials, paths and pagination
status: done
area: sdk
owner: Codex mini/fix-s-smithers-agent-integrations-src-github-463254
updated: 2026-10-21
links: [../../../../packages/smithers/agent/integrations/README.md]
---

Use the library catalog's `@smthrs/integrations` entry for GitHub operations.
Reproduce the six supplied findings before changing production code, then run
the affected files and package suite. No Playwright tests in the mini clone.

Design: decode complete reconciliation lists and fail without writing if a
record cannot be decoded. Require the caller's App id for check runs and
compare it with each run's App attribution. Preserve descriptions by using
GitHub's dedicated closing-reference mutation instead of a body replacement.
GitHub does not support conditional PATCH requests for this endpoint.

API references:
- https://docs.github.com/en/graphql/reference/issues#addcloseissuereferences
- https://docs.github.com/en/enterprise-cloud@latest/graphql/reference/pulls
- https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests-if-appropriate

Install: the offline attempt failed with ERR_PNPM_NO_OFFLINE_META for
@anthropic-ai/sdk; retried the prescribed frozen-lockfile install online.

Regression evidence on the original production code:
- Affected-file run: 17 tests reproduced malformed reconciliation writes,
  foreign-App adoption, blank-token fallback, malformed Unicode defects and
  dropped pagination links. The description-race test initially had a faulty
  Effect tap; after correcting the test, its focused run failed because the
  initial description replaced the concurrent edit.
- Enterprise endpoint regression: observed `/api/v3/graphql` rather than
  `/api/graphql`; corrected routing for the new closing-reference operation.

The first full package run passed all 779 executed tests but failed coverage
on three new linking refusal paths. Added Effect transport fault-injection
cases for query errors, incomplete lists, inaccessible repositories and
unconfirmed mutations, without lowering the coverage thresholds.

Final validation:
- Node 26.5.0; pnpm frozen-lockfile install passed online after the offline
  metadata miss.
- `pnpm --filter @smthrs/integrations exec vitest run`: 801 passed,
  4 credential-dependent tests skipped; coverage gate passed unchanged.
  GitHub source: 100% statements, branches, functions and lines. Package:
  99.95% statements/lines, 100% branches, 99.85% functions; the documented
  PostgreSQL-only SourceStore arm remains outside this SQLite run.
- `pnpm --filter @smthrs/integrations exec tsc -p tsconfig.test.json --noEmit`:
  passed.
- ESLint on the four changed source files: passed; changed TypeScript files
  formatted with the package's dprint configuration.
- e2e: not run (mini clone).

Compatibility: CheckRun callers now supply the authenticated App's numeric
`appId`. LinkPullRequest adds a manual closing link without modifying the
body; servers without `addCloseIssueReferences` refuse the operation safely.
The action implementation versions changed for these two contracts.

Astra review found a new GraphQL rate-limit regression: HTTP 200 query errors
failed permanently, and mutation errors retried in 502 ms despite a 1 s
Retry-After. Four failing regressions proved it. The client now classifies
whole-request GraphQL rate limits before schema decoding and retains delay
and reset headers; partial mutation data stays subject to reconciliation.
Astra's follow-up review reported no remaining findings. Fable review was
unavailable: no Fable model/tool or executable is available in this session.
