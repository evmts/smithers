---
title: Flow settlement and payload reflection regressions
status: done
area: sdk
owner: codex-340682
updated: 2026-10-21
links:
  - packages/smithers/flows/flow/test/InterpreterPersistence.test.ts
---

Fix the five supplied flow interpreter and graph findings in the isolated jj workspace.
Library catalog entry: `@smthrs/flow` (durable workflows); no new library.
All five regression cases failed on Latitude before production changes.

Validation on Latitude, using `LAT_RUN_SRC` set to this workspace:

- `pnpm exec vitest run test/Graph.test.ts -t 'symbol payload|length getter'`: both failed before the fix (silent symbol loss and raw length trap).
- `pnpm exec vitest run test/InterpreterPersistence.test.ts`: all three failed before the fix (premature consumers, erased waiting annotation, escaped child).
- `pnpm exec vitest run`: 69 files, 909 tests passed; statements, branches, functions and lines each 100%.
- `pnpm run check`: passed.

Node settlement records remain the observability boundary; publishing follows
successful persistence. Join reads use a shallow instance copy so consuming a
journal result cannot mutate a sibling's waiting annotation. Losing fibers
receive interruption before the cancellation journal write can yield. Payload
symbols are refused because the graph's canonical payload format is string-keyed;
array lengths are obtained from the same inert descriptor snapshot as members.

Final checks on Latitude: the corrected concurrent waiting regression fails
with the original journal-read code restored and passes with the fix. All
three persistence regressions pass together. `pnpm exec eslint src examples
--max-warnings=0` and `pnpm exec dprint check src/Graph.ts src/Interpreter.ts
test/Graph.test.ts test/InterpreterPersistence.test.ts` passed.
