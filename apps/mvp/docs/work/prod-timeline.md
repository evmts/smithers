---
title: Production timeline proof
status: done
area: timeline
owner: codex-prod-timeline
updated: 2026-10-23
links: [../decisions/0078-timeline-entry-objects.md, ../features/timeline.md]
---

Add a real-model journey on the deployment account's own branch, preserving both scripted journeys. Use the existing device recording and step chapters. Catalog: `@smthrs/ui` ChatTimeline owns rail accessibility; no new model or workflow implementation.

Generated summaries currently replace the recorded object in a button's accessible name. Retain that object and outcome alongside the visible summary so navigation remains identifiable regardless of model wording. Cover this gap red, then green.

Completed: `e2e/timeline-live.spec.ts` declares `member`, `ownConversation`, and `liveModel`. The existing `timeline.spec.ts` has no diff and retains `requires("scriptedAgent", "member")`. The live journey uses device action recording, chapter steps, this run's question and answer IDs, the rail's `aria-controls`, and recorded question/outcome names. It accepts answered or failed, requiring the failure to be visible. No model wording assertion or new visible product copy.

Validation: frozen install passed; `pnpm exec playwright test e2e/timeline.spec.ts --list` lists the unchanged two cases; listing it with `e2e/timeline-live.spec.ts` lists all three. The deployment `BASE_URL=https://smithers.sh` list includes the live case and three auth setup cases (6 total), without executing them. `pnpm --filter @smthrs/mvp typecheck` (all four configs), `pnpm --filter @smthrs/ui check`, and `pnpm exec smithers-build test '//apps/mvp:importRules'` passed. ESLint's TypeScript recommended rules found zero errors/warnings in all three changed TypeScript files; neither package declares a lint script. UI timeline tests passed 13/13. The new unit regression first failed on the missing accessible name, then passed; Bun line coverage records 121 hits on the sole changed product line. No whole-package or branch-coverage claim.

Astra approved with no substantive findings. Fable is unavailable in this session. Production execution and GIF capture are deferred to the deployer, as requested. No push or deployment. Public prop shapes are unchanged; package docs and a patch changeset describe the accessibility fix.
