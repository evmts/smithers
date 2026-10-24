---
title: Capture repository branch creation configuration at program build
status: done
area: branches
owner: Codex prod-new-branch-config
updated: 2026-10-24
links: [../decisions/0088-worker-config-at-build.md, ../features/branch-creation.md]
---

Reapply 9823226b on origin main `1876aca7`, retaining migration 0055 and decision 0095.
`jj log` confirms landed Code Storage `248507ec` and harness `89f5937d`
(the landed versions of the original `8ea5310f` and `fdf5f288`).
Capture GitHub App, repository-role allowlist and Code Storage configuration
at program construction; requests and durable steps consume injected services.
Catalog: `@smthrs/flow`, `@smthrs/effect-code-storage`, `@smthrs/integrations`,
`@smthrs/plugin` and `@smthrs/harness` retain their existing responsibilities.

Red: tests/worker-config.test.ts reports all 24 request-time Config reads.

Implementation: `BranchApi.make` captures the App and Code Storage client before
building handlers. `Executions` captures App settings and the allowed repository
set, then provides `GitHubCreation.Settings` to durable registrations. The action
constructs provider services from that injected value. Request and action tests
run with an empty runtime ConfigProvider; allowed-repository refusals remain
terminal without any provider write.

Validation (2026-10-23–24):

- Original config guard: 24 violations (`config-red.log`); fixed guard: 2 passed.
- Focused branch, checkout and migration suite: 145 passed (`focused.log`).
- Final focused branch/config/host suite: 118 passed (`focused-green.log`).
- Astra found that GitHub's `maintain` permission was refused before its write.
  The durable regression failed (`maintain-red.log`), then passed after including
  `maintain` in the write check. Astra confirmed the fix; no outstanding findings.
- `pnpm --dir apps/mvp typecheck`: browser passes; worker reports exactly 35
  `TS2741` missing-`preconnect` diagnostics and no other class (`typecheck-final.log`).
  Infra and evals pass independently (`typecheck-infra.log`, `typecheck-evals.log`).
- `pnpm exec smithers-build test '//apps/mvp:importRules' --workspace .`: passes.
- `pnpm docs:check`, with the brief's jj-export helper: all 51 tarballs pass.
- Fable review unavailable: `claude-rr --model fable -p` reports every account
  failed or cooling (tried none). No Fable approval is claimed.

The first full run was interrupted after discovering that its transform cache
retained the pre-review permission check; it is not acceptance evidence
(`.mvp-config-interrupted.log`). It also exposed an existing RemoteRuns initial
snapshot race, reproduced alone under the global lock (1 failed, 21 passed).
The test now awaits actual step entry before opening Electric's initial snapshot,
then asserts the exact row. All 22 RemoteRuns tests pass under the lock
(`remote-runs-green.log`); Astra found no issues. No timeout or gate was weakened.

The restarted full suite completed under `~/smithers-builders/.full-suite.lock`
with `--maxWorkers=2` in 3277.54 seconds (`.mvp-config-full.log`):
4,240 passed, 2 declared expected failures and 12 skipped. Coverage is **100%**:
statements 23,359/23,359; branches 12,875/12,875; functions 7,004/7,004;
lines 20,208/20,208 (`coverage/branch-config/coverage-final.json`).
The two allowed pre-existing VibeLang bundle failures remain:
`worker/ChatApi.startup.test.ts` (Rolldown parsing `.vibe`) and
`worker/ExecutionHost.workerd.test.ts` (esbuild has no `.vibe` loader).
One additional `Checks.test.ts` beforeEach hook timed out before its test body.
Its unchanged file then passed **25/25** in an isolated `--maxWorkers=1` replay
under the shared lock (`checks-replay.log`, 80.81 seconds). No source, timeout,
assertion or threshold changed for that replay.
The final full run passes both the actual-step-entry regression and the
maintainer-permission/allowlist regressions.
No production e2e, push or deployment was run.
