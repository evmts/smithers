---
title: Prevent configuration diagnostics from exposing secrets
status: idea
area: process
owner: lead proposes settings hook; Will decides
updated: 2026-10-20
links: [exposed-credentials-rotation.md, code-storage-key-rotation.md, ../rulings.md]
---

## Current specification — 2026-10-20, 19:07 PDT

**What:** Prevent agent commands from reading shell configuration or printing environment secrets.

**Why:** At 19:06 the lead reported the same disclosure twice despite an instruction to check presence only.

**Current state:** The lead proposed a Claude Code hook blocking reads of ~/.zshrc and environment-value dumps, and asked Will before changing personal settings. No reply or installed-hook receipt is present.

**Next step:** Keep presence checks boolean and values out of output immediately. If Will accepts the proposed settings change, implement and test the hook against disclosure paths and harmless checks; document its limits.

**Open questions for Will:** Should the proposed Claude Code settings hook be added? No authorization is evidenced yet.

Evidence: session 6253ecf2 user text and assistant replies extracted by script for the latest approximately two hours, through 2026-10-21 02:07 UTC; queue answers through 01:57 UTC; current rulings and shared briefs. Latest answers supersede older proposals. Receipts below are lead-reported; this tracker verifies only the maintainer-site build. Execution owners are retained; reconciliation by Codex.

## Earlier tracker history (retained)


