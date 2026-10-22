---
title: Remote flows and their features in production
status: in-progress
area: platform
owner: prodflows-store (Codex)
updated: 2026-10-21 23:30 PDT
links: [../features/remote-flows.md, ../features/todos.md, ../features/spend-alerts.md, ../features/repo.md, ../features/branch-workspace.md, ../infrastructure.md, prod-e2e.md, land-and-deploy-mvp.md]
---

**What:** In production, webhook issue sync, clone, TODO runs, spend alerts, role checks, answer expiry and sign-out's token revocation each run, proven by an e2e test. The flow engine's `MigrationError` on every alarm is the `prod-remote-flows` builder's; this note covers what breaks each feature once migrations apply.

**Found, 2026-10-21 (four-model panel, checked against the code):**
- TODO runs: a TODO's machine cloned its branch through the deployment's forge, the Code Storage mirror, which never has the branch `todo/Begin` makes on GitHub. Every production run would fail at checkout; `alchemy dev` has no Code Storage, so the live loop passed there. ChatApi also ran at the default 30 s of CPU per alarm, and an alarm gets 15 minutes of wall time against `todo/Implement`'s 40.
- Spend alerts: a server flow's model calls (the TODO agent, triage's judge) never started their window's alert.
- Clone and About: GitHub REST reads went out anonymously, 60 an hour per IP shared with every Worker on Cloudflare's addresses; 3 of 5 About reads answered 503.
- Electric's container held Postgres' direct URL, password included, as plain container configuration that the Cloudflare API returns.
- Webhook sync, role checks, answer expiry and revocation need nothing beyond the migration fix and a Member session.

**Built, 2026-10-21 10:00 to 10:31 PDT:**
- A TODO's machine reads its branch from GitHub (`SandboxBranch.forge`, `Forge.forgeOf`); ChatApi has five minutes of CPU; a test kills the engine mid-implement and shows the resume re-asks only the unanswered frame.
- Server seats start their window's spend alert (`Executions.starter`).
- GitHub reads go out as the App's installation token for `GITHUB_REPOSITORY`, `metadata: read` (`worker/github/ReadToken.ts`). Checked live: such a token reads other public repositories at 9,400 calls an hour.
- Electric's `DATABASE_URL` is the gateway Worker's secret binding, passed at container start. `alchemy plan --stage prod` from the workspace: 6 updates, 2 binding changes, no errors.
- `e2e/remote-flows.spec.ts` and a Cloudflare tail for `LogTail` in a deployment. `e2e/logs.test.ts` opened a live tail on production and saw the record of its own signed-out read.

**Not built, by decision (merged plan):** durable spend-alert admission after a failed start, keeping sign-out's tokens past five failed revocations, an authority re-check before a TODO's Publish, and a staging stage.

**Waiting on:** the migration fix and these commits on main, a deploy, then the smoke checks: a TODO's checkout from GitHub, a server seat's alert recorded, a clone's size read with the App's token, the Electric container's environment names without `DATABASE_URL` and shapes answering 200, and `e2e/remote-flows.spec.ts` against production, `E2E_LONG=1` included.

**Device store correction:** Repository cache v4 resyncs through `Migrations.synced` (`@smthrs/effect-tanstack-db`, library catalog: carry device stores across deploys), per decision 0021. The deployed v3 schema and fixture remain immutable and validated against their recorded fingerprint. No local row migration applies to this server-backed cache.
