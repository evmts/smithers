---
title: Preserve the VibeLang website during the public repository move
status: blocked
area: process
owner: VibeLang release session and lead; resync-session steering awaits Will
updated: 2026-10-20
links: [vibelang-0-0-2-publish.md, vibelang-release-docs.md, ../rulings.md]
---

**What:** Preserve the website source and stop the hourly resync from overwriting the new repository layout.

**Why:** The chosen public repository currently hosts the source for vibelang.sh in docs/.

**Current state:** At 19:55 PDT the lead reports an hourly resync from ~/vibelang, most likely a Codex desktop session in ~/vibelang-release, with no scheduled job found. The source’s move to site/ is a plan, not a completed receipt; attribution to that session is an inference. The lead sent the blocker to Will through the authorized private Telegram chat.

**Next step:** Coordinate with the owning release session, preserve website history under site/, confirm the actual writer and prevent stale resync writes. Verify the site builds and the public move preserves its source before declaring continuity complete.

**Open questions for Will:** Redirect that existing Codex session to site/ or stop its resync when back. Do not silently stop an unrelated session based on inferred attribution.

Evidence: script-filtered user-typed text and lead replies, session 6253ecf2, latest approximately two hours through 2026-10-21 02:55 UTC; queue answers through 02:38 UTC; rulings, decisions 0001–0020, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later rulings supersede older proposals. Builder receipts are reported evidence; tracker verification is the site build. Execution ownership retained; reconciled by Codex tracker curator.
