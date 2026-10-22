---
title: Point the coding agent at a model of our own
status: done
area: agent
owner: Opus merger and builder for "subscriptions" (session 6253ecf2)
updated: 2026-10-21 21:09 PDT
links: [../decisions/0033-coding-model-role.md, ../features/model-endpoint.md, ../rulings.md]
---

**What:** The `coding` model role: the `todo` run's agent asks it, an Admin sets it with `admin/SetModel`, and until then it answers with the `agent` role's model. A deployment points it at any endpoint the product's model protocols speak, with a key pinned to that endpoint's origin.

**Why:** PROC-23 and its addendum (Will, 2026-10-21 20:50): the product supports the seam, names no vendor, and has no rules about whose TODO runs where; our own Claude Code and Codex use is our configuration, at our own risk.

**Current state (2026-10-21 21:09):** built with tests and docs ([decision 0033](../decisions/0033-coding-model-role.md)); with the lander. The earlier agent-CLI design (runner, MCP tools, vendor adapters) was dropped by the addendum. Two generic fixes to `@smthrs/flow`'s `ExternalJob` from that work ship on their own.

**Next step:** none. Our `coding` role points at a normal API endpoint; we build no relay for our subscriptions (decision 0033 §5), and our builders keep using the CLIs directly.

**Open questions for Will:** none.
