---
title: Move patterns hosting from Wrangler to Alchemy
status: todo
area: infra
owner: Codex tracker (documentation); implementation unassigned
updated: 2026-10-21 11:04 PDT
links: [infrastructure-as-code.md, legacy-code-removal.md, ../rulings.md]
---

**What:** Replace patterns.smithers.sh’s Wrangler deployment configuration with the supported Effect-native Alchemy hosting path.

**Why:** ARCH-3 requires Alchemy for Cloudflare; the legacy inventory exposed a remaining exception.

**Current state:** At 11:00 the lead explicitly retains the current patterns site and flags its Wrangler configuration as a follow-up. No migration or deployment is reported.

**Next step:** Inspect the retained site’s deployment contract, implement equivalent Alchemy infrastructure through injected services, and retain build/deploy/smoke receipts before removing the old path.

**Open questions for Will:** None; settle implementation choices through the existing architecture.

Evidence: lead text replies extracted by script through 11:03 PDT on 2026-10-21 from session 6253ecf2. Telegram authorization is lead-reported, not independently read from Telegram. Current rulings take precedence. Codex owns this documentation reconciliation; named builders retain implementation ownership.
