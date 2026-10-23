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
