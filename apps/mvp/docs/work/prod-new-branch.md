---
title: Restore branch creation after cloning
status: blocked
area: branches
owner: Codex prod-new-branch
updated: 2026-10-23
links: [../features/branch-workspace.md]
---

Reproduce production `/new` failing after a ready clone. First retain safe Forge
failure diagnostics, then fix the cause through the Effect Code Storage wrapper.
Library catalog: `@smthrs/effect-code-storage` for branch creation and git reads.
No production e2e, push or deployment in this workstream.

Diagnostics implemented, production defect unresolved. `CreateRefused` retains the
Code Storage tag/code/status; route logs and both spans identify the failed call.
Red: Branches.test.ts, 1 failed / 25 passed, missing injected Forge cause fields.
Green: Branches.test.ts + Forge.test.ts, 36 passed; focused production coverage
100% statements, branches, functions and lines. Worker TypeScript and
`pnpm exec smithers-build test '//apps/mvp:importRules'` passed.
Code Storage suite: 127 passed, 1 skipped, 100% coverage in every dimension;
the authenticated live round trip skipped because credentials are absent.
RepoClone.test.ts: 19 passed (coverage disabled; investigative suite unchanged).
Astra review: no findings; its suggested span assertions are retained and pass.
Fable review: unavailable (`claude-rr`: all accounts failed or cooling, tried none).

Investigated RepoClone, Forge, GitRemote, token signing and the current public API
spec (<https://code.storage/openapi.json>). The wrapper uses the documented
`POST /api/repos/{repo_name}/branches/create`, `base_ref` / `target_branch` body
and `git:write` scope. Initial `SyncPending` is an expected retry until a commit
exists; it does not establish the later branch-write failure's cause. Public
sync and isolated namespace docs alone do not justify changing the namespace.

Blocked on an existing credential source: environment and clone have no Code
Storage credentials; no Keychain entry matches `CODE_STORAGE_KEY` or Code Storage.
Requested the source's location, never its secret value. Need an authenticated
reproduction through `@smthrs/effect-code-storage` before a product/SDK fix or an
exact deployment setting can be established. No production e2e, push or deploy.

Second round (resumed): reviewed the 11 unfinished files in the same working
copy. Production evidence identifies `create_ref` unauthorized (401). Reproduced
the refusal bug against the prior Forge/Branches behavior: 7 regression failures,
36 passes. Restored the fix: Code Storage HTTP 401/403 becomes 403 `forbidden`,
with provider tag/code/status retained in logs and spans. The browser's durable
`conversation/new` completes as a failure after one write attempt, with no
navigation; it does not retry the provider refusal.

Credential investigation remains blocked, separate from the completed refusal
fix. Clone create, sync, reads and Forge use the canonical lowercased
`github/<owner>/<name>` ID. All REST operations use the same signer; import asks
for `repo:write`, sync and createBranch both ask for `git:write`, reads for
`git:read`. Each token gets current Effect Clock Unix seconds, ES256 and a
300-second lifetime. No namespace or ref-policy claim is set. The current
provider docs/OpenAPI match these claims and request shape. Clone and ChatApi
read the same Config names, but their deployed values and registered key
restrictions cannot be compared from this clone. Local shell, expected infra
path and the local secrets names supply no Code Storage credential. Requested
the approved deployed credential/config source (path only). A 401 alone does not
prove a missing scope, expiry, key rotation or repository mismatch; no speculative
SDK or deployment permission change is included. See decision 0085.


Resumed validation: `pnpm install --frozen-lockfile` passed under Node 26.5.0.
`pnpm --filter @smthrs/mvp exec vitest run worker/branch/Forge.test.ts
worker/branch/Branches.test.ts worker/branch/Shares.test.ts
worker/branch/Presence.test.ts src/features/conversations/conversations.test.ts
src/features/branch/branch.test.ts --coverage.include=worker/branch/Forge.ts
--coverage.include=worker/branch/Branches.ts
--coverage.include=src/features/branch/flows.ts
--coverage.include=src/features/branch/contract.ts`: 108 passed; 100% statements,
branches, functions and lines across those production modules. An initial
four-suite run passed 86 tests but missed unchanged contract helper coverage;
the expanded existing suites close it without changing thresholds.
`pnpm --filter @smthrs/effect-code-storage exec vitest run`: 127 passed, one
credential-dependent live integration skipped; 100% in every coverage category.
`pnpm exec smithers-build test '//apps/mvp:importRules'` passed (executed), as did
`pnpm --filter @smthrs/mvp exec tsc -p worker/tsconfig.json --noEmit` and
`pnpm --filter @smthrs/mvp exec tsc -p tsconfig.json --noEmit`.
`pnpm --filter @smthrs/mvp exec vitest run worker/flows/RepoClone.test.ts
--coverage.enabled=false`: 19 passed (unchanged investigative suite).
Resumed Astra review: no findings. Fable review could not run: `claude-rr`
reported every account failed or cooling, tried none. No production e2e,
deployment, push, `main` mutation or SDK credential change.
