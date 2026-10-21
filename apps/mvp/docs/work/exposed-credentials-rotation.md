---
title: Rotate credentials exposed by configuration diagnostics
status: blocked
area: infra
owner: Will rotates credentials; lead verifies safely
updated: 2026-10-20
links: [code-storage-key-rotation.md, secrets-proxy.md, self-hosted-grafana.md, ../rulings.md]
---

## Current specification — 2026-10-20, 19:07 PDT

**What:** Rotate credentials printed during configuration inspection without retaining their values in the tracker.

**Why:** The lead reports a second diagnostic disclosure at 19:06; OBS-5 forbids secret values in diagnostics.

**Current state:** Reported exposure includes CLOUDFLARE_API_TOKEN, CF_ANALYTICS_TOKEN and ALCHEMY_PASSWORD, plus Anthropic/OpenAI keys and RPC URLs on commented lines if still live. The earlier Code Storage key still needs rotation. No rotation receipt is evidenced.

**Next step:** Rotate affected active credentials through their secret stores, update consumers and verify access without printing values. Retain only completion receipts and references. The old Grafana/Hetzner configuration is historical, not evidence of an active Cloud stack.

**Open questions for Will:** Rotate the named active credentials; confirm whether the commented keys and RPC URLs remain live.

Evidence: session 6253ecf2 user text and assistant replies extracted by script for the latest approximately two hours, through 2026-10-21 02:07 UTC; queue answers through 01:57 UTC; current rulings and shared briefs. Latest answers supersede older proposals. Receipts below are lead-reported; this tracker verifies only the maintainer-site build. Execution owners are retained; reconciliation by Codex.

## Earlier tracker history (retained)


