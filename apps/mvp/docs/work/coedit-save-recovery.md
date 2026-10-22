---
title: Co-edit save ordering and reload recovery
status: in-progress
area: app
owner: co-editing builder; Codex tracker owns documentation
updated: 2026-10-21 23:24 PDT
links: [branch-coediting.md, mac-mini-test-farm.md, ../features/coedit.md, ../rulings.md]
---

**What:** Keep save acknowledgements correct when saves overlap or a page reloads during a save.

**Why:** Saved must describe the persisted edit, and a reload must retain a truthful save state.

**Current state:** At 23:17 the lead confirms the normal two-device production save journey passes, but explicitly leaves two known gaps: simultaneous saves can leave the wrong Saved mark, and reloading during a save leaves no mark. These remain open despite the completed normal save slice. No repair receipt is reported.

**Next step:** Retain regressions for overlapping acknowledgements and reload during an unresolved save; fix ordering and recovery, then prove both locally and against production. The full mini suite waits on test-farm isolation; the answer-box flake and two-person journey also remain with the co-editing owner.

**Open questions for Will:** Second GitHub test account username when available; creation was already approved. No new design decision needed.

Evidence: lead text reply at 23:17 PDT, script-filtered from session 6253ecf2 within the latest two-hour window. Current rulings and queue answers take precedence. Codex owns this tracker note; implementation stays with the co-editing builder.
