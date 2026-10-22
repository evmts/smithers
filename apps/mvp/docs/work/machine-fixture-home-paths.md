---
title: Machine fixture preserves host home paths
status: done
area: branch
owner: codex
updated: 2026-10-22
links: []
---

Investigate Machine.test.ts on Latitude without local dependencies or pushing.
Main 9039b6ce7ee5: 12 failures, 7 passes. The fixture globally rewrites quoted
/home paths, including the runner's private TMPDIR under /home/lane. That
changes checkout paths passed to SandboxTools, causing not_a_repository.
The faulty mapping was introduced in 600fc254a6bb, unchanged by recent pushes.
Library catalog entry used: @smthrs/sandbox SandboxTools.execute/checkpoint;
production behavior and assertions stay unchanged. Map only guest user homes.

Historical probes (one Latitude invocation each):
- 9039b6ce7ee5: 12 failed / 7 passed.
- cfb31c39 (before 2fb38e9ddee3): cancelled while waiting for a host permit; no result.
- 60ababaa (before 49779ebdb7ca): 11 failed / 7 passed, same symptoms.
- 600fc254a6bb (test introduction): blocked before tests by its stale app lockfile.
There is no demonstrated recent green-to-red product commit. The introducing
commit contains the same broad rewrite; the external runner's October 22
private TMPDIR change exposes it. No historical install failure is a test result.

Fix proof on nyc-02 slot 1: Machine.test.ts 20/20, including all original 19
and a direct host/guest path regression, exit 0. Existing assertions unchanged.

Final Latitude proofs, nyc-02 slot 1, all exit 0:
- pnpm test worker/branch/Machine.test.ts --coverage.enabled=false: 20/20 (15.7s total).
- pnpm typecheck: all four app/worker/infra/evals projects passed (124.2s).
- pnpm exec smithers-build test //apps/mvp:importRules: ran, not cached; passed (16.2s).
- pnpm test worker/branch --coverage.enabled=false: 173 passed, four Docker-only
  probe tests skipped; 14 files passed and one skipped (15.2s).
No suite-wide coverage claim, local dependency installation, or push.
