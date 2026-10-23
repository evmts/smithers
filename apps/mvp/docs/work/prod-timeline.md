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

## Second round: wait for the linked reply

The deployed `0c544cbd` run is the red receipt. In `~/smithers-builders/evidence/prod-timeline/`, `error-context.md` shows only a queued question and its rail entry; there is no reply entry yet. `Timeline-thread.json` records the accepted question (`202`) and only the person's message. `Timeline-browser.log` records acceptance at 29.20 s, `chat/Answer` starting at 29.24 s with the expected answer id, and memory recall still running at 33.14 s. The PATCH for that same answer id is aborted at 33.26 s. There is no mounted or settled reply receipt before the five-second role assertion expires. `run-0c54-timeline.log` confirms that exact assertion, rather than the 180-second settlement assertion, failed.

This is a premature test lookup, with no evidence of a mismatched product link. `railEntries` and `Conversation` both use the message's id, from the same conversation projection; `ChatTimeline` puts that id in `aria-controls`, and `ChatMessage` forwards it to the article. The transcript maps its messages directly, with no virtualization. The rail cannot contain this assistant entry before the same projection contains its message. A `202` acknowledges admission, not Electric delivery. No product behavior or public API changes.

The live journey now gives the reply entry 180 seconds to appear, follows its link, reads the actual `aria-controls` target and verifies it is the recorded answer id. It retains the assistant-role assertion, done-or-failed settlement deadline, linked question subject and outcome, rail state, settled response, viewport jump, and visible failure checks. Catalog: the existing `@smthrs/ui` timeline and message components; no new library.

Validation: Node 26.5.0 frozen install passed; `pnpm exec smithers-build test '//apps/mvp:importRules'` passed; `pnpm --filter @smthrs/mvp typecheck` passed all four configs. Playwright `--list` discovers the live journey and both unchanged scripted journeys (3 total). ESLint's TypeScript recommended rules report zero errors/warnings for the changed spec. Executing `env -u BASE_URL -u E2E_TARGET pnpm --filter @smthrs/mvp exec playwright test e2e/timeline-live.spec.ts --workers=1` is blocked before test execution: local Alchemy requires the absent `CEREBRAS_API_KEY`. No green browser receipt or executed coverage claim. Production e2e was not run, as requested. Astra approved the second-round diff without findings; Fable is unavailable. No push or deploy.
