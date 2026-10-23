---
title: Production CI e2e through the App installation
status: done
area: test
owner: Codex GPT-6.1 Sol (mini/prod-ci)
updated: 2026-10-23 18:05 PDT
links: [../features/ci.md, ../decisions/0082-repository-flow-allowlist.md, ../decisions/0087-production-ci-e2e-pusher.md, ../decisions/0088-worker-config-at-build.md]
---

Use the existing App credentials to push a scratch branch on deployments and correlate GitHub's real delivery by commit SHA in ChatApi's tail. Local development retains the person token and signed delivery. Keep the run view and commit status assertions. No production e2e is authorized for this builder; the deployer runs it.

Library catalog entry: `@smthrs/integrations` (`GitHub.AppAuth` and `GitHub.GitHubClient`) supplies authentication, REST and credential redaction. No public API or dependency changes.

Validation: prerequisite regressions failed against the old implementation, then all 45 unit tests passed. The new helpers have 100% statements, branches, functions and lines, with a real RSA key and faulty HTTP service for absent installation, refused mint and malformed mint responses; inspected diagnostics contain no key, JWT or token. Import rules and all four TypeScript projects passed. Local Playwright: fixture passed, CI case skipped for its declared missing repository prerequisite. No live CI or GIF receipt is claimed.

`smithers-build lint '//apps/mvp:jevRules'` completed with 314 app-wide findings and exit 1, including `test.skip-only-when-absent` on the whole `e2e/target.ts` registry (0.71). The new spec and helpers received no findings. The lint gate and rules are unchanged; its package-wide failures remain open for the lead.

Second round complete: ChatApi captures the repository set beside REPO_FLOWS and injects it into the execution program and both dispatch steps. Blank still allows none. The compiler-based `effect.config-at-build` test catches the original Dispatch reads and follows deferred worker helpers, layers, and named/factory-created step callbacks. Its other hits are fixed: alert URLs, home repository lookups, egress hosts, docs/forge configuration and sandbox idle time. Docs capture settings separately from runtime cache acquisition. The touched test harnesses now capture the selected Electric endpoint rather than pinning the shared port. No public SDK API or dependency changed.

Second-round receipts: injected-set tests failed on the original Dispatch; the source guard failed on its match/start reads and other deferred Config reads; named/factory callback fixtures also went red before their guard fix. Final isolated Postgres 17.11/Electric 1.8.1 run, one worker under `.full-suite.lock`: 17 files, 459 tests passed, no skips. The coverage selection (Dispatch, docs Source, Conversations, AlertChannels, SandboxEgress, SandboxKeep and RepoApi) earned 100% statements (595/595), branches (322/322), functions (145/145) and lines (533/533). All four TypeScript projects and importRules passed. The selected suites include ExecutionHost, RepoApi and chat, so every case that timed out on the shared stack passed in this final run. Build-only Worker wiring is typechecked and reviewed; no live deployment proof is claimed.

The optional full app run used `.full-suite.lock` and was interrupted after five timing failures in RepoApi/chat; no full-app pass is claimed. Final evidence used the documented isolated test endpoints on localhost ports 55463/30463, with real Postgres/Electric. Astra's cache-acquisition and named-callback findings were fixed and its follow-up review was clean. Fable review was unavailable: existing CLI OAuth sessions could not refresh. No production e2e, push or deployment.
