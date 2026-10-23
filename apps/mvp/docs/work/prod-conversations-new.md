---
title: Surface a refused production new conversation
status: done
area: conversations
owner: Codex prod-conversations-new
updated: 2026-10-23
links: [../features/conversations.md]
---

Retain a failing regression for `/new` when the deployment repository's forge
answers not found, then surface the existing branch failure copy in the composer.
Verify Member creation separately from GitHub's single-repository writes route.
No production e2e or pushes; delivery follows the SOLC brief.

Library catalog: existing `@smthrs/flow` dispatch and
`@smthrs/effect-tanstack-db` composer/menu collections. This fixes the existing
core conversation command, adding no feature or library.

Production evidence: `conversation.new` settled `not_found`. Its branch route
uses the deployment's Code Storage forge, not GitHub's single-repository writes
route. Member creation succeeds when the deployment mirror has a default branch;
the browser record cannot distinguish a missing mirror from a missing default.

The composer now restores the submitted `/new` line and reuses
`Couldn't make a branch` on terminal failure or unavailable engine. Newer typing,
dismissal, a nonempty direct draft and a different conversation fence restoration.
No new UI prose or permission change. Decision: 0080 (renumbered at landing).

Validation receipts:

- Red first: missing deployment mirror and existing branch both left a null
  refusal (`/tmp/prod-conversations-new-red.log`). Astra found accepted menu
  completion restored `/`; its regression also failed first
  (`/tmp/prod-conversations-new-review-red.log`), then the submitted text fixed it.
- Real-handler/device integration tests cover Member success, missing deployment
  mirror, existing branch, unavailable engine, asynchronous launch and stale
  failure guards. Branch and forge suites also pass.
- Changed commands actions/store meet the unchanged 100% statement, branch,
  function and line gates; no threshold or check was changed.
- App typechecks and `smithers-build test //apps/mvp:importRules` pass.
- Astra review finding fixed and re-reviewed with no findings. Fable is not
  available in this session.
- The original successful browser spec was not run locally: this clone has no
  Code Storage credentials, which its declared `codeStorage` need requires.
  No production e2e ran; no deploy or push. Successful production `/new` still
  requires its repository's writable Code Storage mirror and default branch;
  this fix makes a refusal visible, not a false success.

Commands: `pnpm --dir apps/mvp exec vitest run
src/features/conversations/conversations.test.ts
src/features/commands/commands.test.ts worker/branch/Branches.test.ts
worker/branch/Forge.test.ts --maxWorkers=1
--coverage.include=src/features/commands/actions.ts
--coverage.include=src/features/commands/store.ts`; after the review fix, rerun
the two browser state-machine suites with the same coverage gate.
