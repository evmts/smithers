---
title: Replace Tevm Nx with Smithers repo automation
status: todo
area: process
owner: Claude plans after deploy; Codex Sol performs mechanical removal
updated: 2026-10-20 23:34 PDT
links: [tevm-ci-security.md, ci-cd-parity.md, flows-as-code-api.md, ../rulings.md]
---

**What:** Replace Nx commands, config and cache integration with Smithers repository automation in Tevm.

**Why:** Will explicitly rejects Nx as a competitor; removing it also removes its committed cache token.

**Current state:** OTHER-5 and the 23:30 lead update authorize the migration after deployment and the workflows-as-code design. Tevm already has WORKSPACE.ts. No migration proof yet; claude.yml restriction was declined.

**Next step:** Inventory Nx responsibilities, plan replacements through current Smithers APIs, remove Nx completely, and verify affected build/test/release behavior.

**Open questions for Will:** None; existing rulings authorize this scope.

Evidence: Will’s queue answers and lead text replies, 23:27–23:33 PDT, session 6253ecf2. Added by Codex tracker curator; no implementation or test receipt claimed.
