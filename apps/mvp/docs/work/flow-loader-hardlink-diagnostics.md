---
title: Explain flow-loader filesystem refusals
status: in-progress
area: sdk
owner: docs-sync fix agent; tracker curator records follow-up
updated: 2026-10-20 22:54 PDT
links: [docs-check-flow-outcome.md, docs-sync-agent-authorization.md, release-burn-down.md]
---

## What

The flow loader must name the syscall, path and refusal reason without exposing file contents.

## Why

Bare Operation not permitted errors blocked every flow and prevented debugging.

## Current state

The lead reports docs:check passes at 22:47 after deleting the scratch snapshot that hard-linked checkout files. File/syscall diagnostics are fixed; the deeper hard-link refusal reason still needs a native helper rebuild after the test pause.

## Next step

Retain regression and landing receipts; rebuild the helper with the refusal reason and validate after the pause.

## Open questions for Will

None.

Evidence: script-filtered lead text replies, session 6253ecf2, 2026-10-20 22:47–22:54 PDT; current rulings and queue answers. Added by Codex tracker curator; execution ownership is as stated.
