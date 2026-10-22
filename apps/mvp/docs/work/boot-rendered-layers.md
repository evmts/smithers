---
title: Boot asserts the pull request layer
status: in-progress
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

Validation in progress: the original boot test reproduced "length of 18 but got
19" at its render assertion. The full app typecheck (browser, worker, infra and
evals) passed, as did the browser typecheck repeated after the test edit.
Astra review found no issues. Fable is unavailable in this session.
