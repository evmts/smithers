---
title: Branch views production e2e race
status: blocked
area: web
owner: Codex
updated: 2026-10-22
links: [../features/branch-workspace.md]
---

The test chose Chat from an immediate false `isVisible()` result while the
branch route was pending. Its URL and public branch chrome can precede its
workspace. The helper now waits for either visible input or Chat, then opens
Chat only when present. Asking, switching branches and opening the first web
page all use it. Full-screen checks wait for the embedded page's content.

The timeout snapshot proves eventual composer presence, not a separately late
composer. `BranchScreen` renders the conversation and composer controls under
the same access gate; `Composer` supplies Chat even before its query settles.
The production log already confirmed sign-in before navigation. No separate
composer defect was established, so product code and UI copy are unchanged.
A confirmed delay after the messages with neither eligible composer control
would be a product defect; the overall conversation load has its own test.

Existing library catalog entries: `@smthrs/ui` composer and branch controls;
TanStack Router route entry. No dependency or public API changes.

The original helper fails the deterministic Chromium regression (absent Chat
with a late textbox); the fix passes all three cases at 100% statements,
branches, functions and lines. Its browser fixtures test actual Playwright
visibility and waits, without network interception or sleeps.

Mini-run is absent from PATH and the searched home/tool directories; its path
was requested. No farm files were changed. A separate local Postgres/Electric
and Alchemy stack in this clone passed all four branch-workspace tests (4.8 m).
The independent branch-load run stopped in fixture setup: an answer write
returned 503 (`chat.answer.write`, `sql:UnknownError`), before paint measurement.
No branch-load pass is claimed. Production e2e, shape concurrency and probe
scripts remain untouched. Frontend typecheck and ImportRules pass. Astra
review found no issues; no Fable reviewer is available in this session.

Final views rerun with both original iframe visibility checks and visible
content checks and a full-screen capture passed (34.1 s). The resulting GIF/video pass media checks:
`/tmp/prod-branch-views-e2e/gifs/branch-workspace-branch-views.gif` and
`/tmp/prod-branch-views-e2e/videos/branch-workspace/branch-views.mp4`.
A separate real local paint observation found conversation and composer
control in the same animation frame on open and reload (0.1 ms query skew
and 0 ms respectively); the conversation followed chrome by about 0.5 s.
Raw receipts: `/tmp/prod-branch-views-e2e/`, helper red/green logs at
`/tmp/prod-branch-views-helper-{red,green}.log`.

The fix and isolated local proof are complete. This note is blocked only on
the requested mini-run farm proof; the client is unavailable here. Astra
review's visibility concern was fixed by retaining the original checks;
its final review found no further issues.
