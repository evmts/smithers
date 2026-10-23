---
title: Production CI e2e through the App installation
status: done
area: test
owner: Codex GPT-6.1 Sol (mini/prod-ci)
updated: 2026-10-23 PDT
links: [../features/ci.md, ../decisions/0082-repository-flow-allowlist.md, ../decisions/0087-production-ci-e2e-pusher.md]
---

Use the existing App credentials to push a scratch branch on deployments and correlate GitHub's real delivery by commit SHA in ChatApi's tail. Local development retains the person token and signed delivery. Keep the run view and commit status assertions. No production e2e is authorized for this builder; the deployer runs it.

Library catalog entry: `@smthrs/integrations` (`GitHub.AppAuth` and `GitHub.GitHubClient`) supplies authentication, REST and credential redaction. No public API or dependency changes.

Validation: prerequisite regressions failed against the old implementation, then all 45 unit tests passed. The new helpers have 100% statements, branches, functions and lines, with a real RSA key and faulty HTTP service for absent installation, refused mint and malformed mint responses; inspected diagnostics contain no key, JWT or token. Import rules and all four TypeScript projects passed. Local Playwright: fixture passed, CI case skipped for its declared missing repository prerequisite. No live CI or GIF receipt is claimed.

`smithers-build lint '//apps/mvp:jevRules'` completed with 314 app-wide findings and exit 1, including `test.skip-only-when-absent` on the whole `e2e/target.ts` registry (0.71). The new spec and helpers received no findings. The lint gate and rules are unchanged; its package-wide failures remain open for the lead.
