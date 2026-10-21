---
title: Prelaunch — host the VibeLang repository on smithers.sh
status: in-progress
area: app
owner: Opus post-deploy coding-factory builder assigned by lead
updated: 2026-10-21 04:44 PDT
links:
  - ../rulings.md
  - prelaunch-custom-domains.md
  - ../../../../docs/libraries.md
---

## Tracker reconciliation — 2026-10-21 04:44 PDT

**What:** Prove the VibeLang repository and coding factory in production Smithers.

**Why:** SCOPE-13 makes the hosted VibeLang factory the short-term north star.

**Current state:** The earlier todo status is stale: the lead launched the Opus production-factory job at 02:56 PDT and confirmed it active at 04:13. Round 4 is live and App installation is confirmed. QuickJS on Cloudflare, restored PR pages, the running-TODO view and the promoting-main-deploys warning are assigned scope; production import and a completed factory journey remain unproven. See vibelang-coding-factory.md for the same builder’s detailed execution scope.

**Next step:** Obtain real Cloudflare and scratch-repository end-to-end receipts before enabling TODO runs; verify production repository import, home, browsing and issues. Coordinate docs/search and custom domains through their existing notes.

**Open questions for Will:** None new.

Evidence: script-extracted user-typed text and lead text replies from session 6253ecf2, approximately 02:43–04:43 PDT; no user-typed messages in that window. Current rulings and queue answers take precedence over shared briefs, panel designs, decisions, proposals, TODOs and rules. Execution ownership is recorded above; Codex curates documentation only. Product checks are lead-reported; this tracker runs only the maintainer-site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 02:55 PDT

**What:** Prove the VibeLang repository and coding factory in production Smithers.

**Why:** SCOPE-13 makes the hosted VibeLang factory the short-term north star.

**Current state:** The App installation is confirmed and round 4 is now live with basic smoke checks passing in the lead’s 02:54 PDT reply. The deploy prerequisite is cleared. Neither a real production repository import nor a factory execution receipt is present; status remains todo.

**Next step:** Verify production import, repository home, browsing, issues and factory execution; track docs panes/search and domain configuration in their existing notes.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead replies from session 6253ecf2, latest approximately two hours through 02:54 PDT. Automated notifications and teammate messages excluded. Current rulings and queue answers override historical briefs, panel designs, decisions, proposals, TODOs and rules. Product checks are lead-reported; this tracker runs the site build only. Execution ownership retained; Codex curates documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 01:44 PDT

**What:** Run the VibeLang coding factory in production Smithers.

**Why:** SCOPE-13 makes this the short-term north star.

**Current state:** Will’s 01:16 Installed answer is confirmed at 01:38 using the GitHub App’s own credentials: installation covers the smithersai organization and all its repositories, including vibelang. Installation is complete; production import and factory execution are not yet proven.

**Next step:** After the combined deployment, verify production import, home, browse, issues and factory execution; then address docs panes, docs search and authorized audience switching.

**Open questions for Will:** None; the App installation is settled.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, 23:43–01:43 PDT; rulings, queue answers through 01:19 PDT, shared feature/host/panel briefs and designs, decisions, proposals, TODOs and rules. Product receipts are reported evidence; this tracker runs only the site build. Existing execution ownership and status retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


## What
smithers.sh hosts the VibeLang repository: its repository home (visitor, contributor and maintainer views, from `.smithers/home.json`), code browsing, issues and the coding factory. vibelang.sh then points at that Smithers app through a custom domain.

## Why
Will, 2026-10-21 (SCOPE-12): "later we will be making it [vibelang.sh] a custom smithers app and pointing at our domain though (that is prelaunch btw it should be on your radar we want the vibelang repo to be hosted at smithers.sh and add support to smithers for configuring your own domain in same way you can on vercel."

## Current state
- **Repository home:** the curated-home schema (`@smthrs/views`) and VibeLang's `.smithers/home.json` exist. The Effect home is the worked example.
- **Docs site:** vibelang.sh is the Vocs site for now. effeck.dev retires and redirects to vibelang.sh; smithers-53 owns that.
- **GitHub App:** Will installed smitherspreviewrelease on smithersai/vibelang (2026-10-21, about 01:16).
- **Missing:** the production deploy with sign-in, and custom domains (see prelaunch-custom-domains.md).

## Next step
After tonight's deploy, open smithersai/vibelang in production Smithers and check that its home, browse and issues work. List the gaps.

## Open questions for Will
None yet.

## VibeLang's sandbox needs (from smithers-53, 2026-10-21)
- **Toolchain:** Go 1.27 (`typescript/tsc/go.mod`), Node 26 (the repo and docs run 26.10; the compiler package declares >=22), Bun 1.4.1 or later (integration tests ran 1.4.2).
- **Setup:** `sh scripts/setup.sh`. It checks go, bun and node, builds the native compiler (`scripts/build-vibelang.sh` → `packages/compiler/native/vibelang`), installs, builds and packs the runtime, and installs the starter template.
- **Checks,** for the factory's check flow once flows-as-code is approved:
  - `cd typescript && sh vibelang/smoke.sh --jobs 16`;
  - `cd typescript/tsc && CGO_ENABLED=0 go test -trimpath ./internal/vibelang/ ./internal/vibelangfmt/ ./cmd/tsc/`;
  - `cd packages/compiler && node --test test/*.test.mjs`;
  - `sh packages/vite/test/run.sh` and `sh packages/unplugin/test/run.sh`, with `VIBELANG_BINARY` set to the built compiler;
  - `node --test scripts/release/*.test.mjs scripts/brand-gate.test.mjs` and `bun run check:tokens`.
- **Machine size:** several cores. The smoke suite takes a few minutes with `--jobs 16` on nyc-01. A Cloudflare Container branch sandbox needs an image with Go 1.27, Node 26 and Bun 1.4, plus enough CPU; check the Containers instance types.
