---
title: Bound terminal input frame retention
status: done
area: infra
owner: Codex terminal input fix
updated: 2026-10-21
links: [branch-terminal.md, ../../../../packages/smithers/flows/platform-cloudflare/docs/guides/attach-a-terminal-to-a-container.md]
---

Amend terminal-input commit A in place, preserving its B1 child. Charge retained
frames 64 bytes plus binary length against the shared 1 MiB budget, releasing
the same cost after resize, reader drops and stdin writes.

Both stalled-stdin flood regressions fail on unchanged A: empty binary and resize
frames finish as `unsupported` instead of `failed` after a terminating invalid
frame. Dependencies were installed offline with zero downloads.

Package typecheck and lint pass. Full suite: 144 passed, 5 opt-in workerd smoke
cases skipped; statements,
branches, functions and lines each have 100% executed coverage. All 51 terminal
unit cases pass, including the 2,000 one-byte-frame regression. The shared-budget
boundary test includes the frame overhead and verifies resize cost is reclaimed.

Uses the library catalog's existing `@smthrs/platform-cloudflare` host entry and
Effect queues, deferreds and scopes; no new library or runtime.
