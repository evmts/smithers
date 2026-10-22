---
title: Model host durability and credential regressions
status: done
area: sdk
owner: codex-mini-fix-rework-829c3ee0-586255
updated: 2026-10-22
links: [host-agnostic-flows.md]
---

Six findings fixed in the isolated mini clone: writes read the current cursor
when executed; commit refusals and malformed receipts stop immediately;
preflight fallback notifications use their own role's credential; notifications
have a one-second deadline; all fallback credentials are removed from output;
and malformed stream messages are rejected before model resolution.

Catalog entries used: `@smthrs/model-host` for host composition and
`@smthrs/model` for provider transport. No new library or runtime.

Loopback HTTP tests exercise cursors, receipt refusals, split credential echoes,
separate provider origins and null message requests. Effect TestClock proves
notification timeout and cancellation without fixed waits. Additional cases cover
reasoning, tool IDs/names/arguments, subscription token/account parts, preflight
reasons, and transport loss during receipt reading.

Reworked 829c3ee0c367 on main's Effect-returning `diagnostics.begin`. The public
write suspends a private commit so cursor reads happen at execution time without
reindenting the existing commit body. Retained caller-context diagnostics,
failed-outcome reporting and receipt-integrity refusal records. Updated the
new main regression to expect one failed observation for a malformed receipt;
its duplicate observation depended on the unsafe retry being removed.

Still blocked: completed context selection replay. Its regression observes two
selector calls after the first answer fails, despite a committed completion
frame. Retained as an explicit `test.fails` contract, not claimed fixed. The
legacy host has neither an injected persistent flow runtime nor a replay read
port; its receipts retain metadata rather than the complete selection answer.
The host migration must use the catalog's `@smthrs/agent` / `@smthrs/flow` durable
execution, a stable execution identity and the complete selected answer. A
process-local cache or another progress receipt would not repair it.

Validation: Node 26.5.0; `pnpm install --frozen-lockfile --offline` passed.
`pnpm --dir packages/smithers/agent/model-host exec vitest run` passes 496 tests
and one expected failure for the unresolved replay contract. The complete
`packages/smithers/agent/model` Vitest suite passes 1,085 tests with nine live
cases skipped. Both suites report 100% statements, branches, functions and
lines. `node --test packages/smithers/agent/model/scripts/provider-live.test.mjs`
passes all eight provider-launch guard tests. Model-host
`tsc -p tsconfig.test.json --noEmit`, changed-source ESLint,
formatting, and both packages' `importRules` targets pass. The apps/mvp
`pnpm exec tsc --noEmit` check passes before and after the rework. No E2E tests
run. No schema or library dependency changed.
