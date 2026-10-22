---
title: Terminal frame decoder bounds
status: done
area: terminal-frame
owner: codex
updated: 2026-10-22
links: []
---

Reject port shortcuts outside the documented Cmd/Ctrl+K allowlist and dimensions outside 1–65535. Reuse the protocol's existing isPageKey predicate; no new libraries.

Validation: both new regression tests failed on the original decoder. After the fix, Latitude ran 34 package tests successfully with 100% line/function coverage; package importRules, package typecheck and apps/mvp typecheck passed.

Mac mini browser rerun was canceled after remaining queued without an assigned slot; the four real Chromium probes passed in the Latitude package run.
