---
title: Boot asserts the pull request layer
status: done
area: browser
owner: Codex boot-layers
updated: 2026-10-21
links: [../features/pulls.md, ../decisions/0012-git-end-to-end.md]
---

The nineteenth layer is `Pulls`, intentionally restored by `2ae1b8c5`
("the pull request pages are back, with GH-9's deploy warning beside Merge").
Its boot diff adds `Pulls.layer`, the render argument and the client/store wiring.
`main.tsx` passes it to `PullsProvider` and the router; decision 0012 and the
[pull request documentation](../features/pulls.md#the-browser) require the pages.
Retain the layer and append `Effect.service(Pulls)` to the test's expected list:
the existing exact-length and per-position `toBe` assertions now check all 19.
No public API or production behavior changes.

Validation: the original boot test reproduced "length of 18 but got
19" at its render assertion. The full app typecheck (browser, worker, infra and
evals) passed, as did the browser typecheck repeated after the test edit.
Astra reviews of both changes found no issues. Fable is unavailable in this session.

The last rerun passed seven tests and the new layer assertions, then failed the
existing assertion that a key after stopping leaves the composer open. A real
Node 26.5.0 `EventTarget` reproduction calls a listener twice when it is removed
with boolean `true`, but once when removed with `{ capture: true }`. Use that
equivalent options form in shortcut cleanup; keep the existing boot and chat
shortcut cleanup regressions. No library choice changes: this is the app's
existing DOM boundary, not a replacement UI or flow implementation.

Final verification on Node 26.5.0:

```sh
pnpm --filter @smthrs/mvp exec vitest run src/boot.test.ts src/features/chat/chat.test.ts --testNamePattern 'shortcuts|renders the chat|the repository layer:|when the device.s conversation|a browser that|logs an uncaught|reload counts|start is the boundary:|start takes faulty services|hides while online; shows Offline' --coverage.include=src/boot.ts --coverage.include=src/features/chat/shortcuts.ts --maxWorkers=1 --silent
pnpm --filter @smthrs/mvp typecheck
pnpm --filter @smthrs/mvp exec tsc -p tsconfig.json
```

The test command passed all eight boot tests, all five shortcut tests, and the
existing offline-to-online test (14 passed; 55 other chat tests intentionally
unselected). Both measured modules reached 100% statements, branches, functions
and lines (85/85 statements, 25/25 branches, 24/24 functions, 80/80 lines).
The offline-to-online test covers the optional confirmation deadline through
`appLayer`; without it this focused selection covered 96% of branches and
correctly failed the unchanged 100% gate. The full app typecheck passed before
the shortcut fix; the frontend check passed again after the final code edit.
Full app tests and end-to-end tests were not run. Nothing was pushed.
