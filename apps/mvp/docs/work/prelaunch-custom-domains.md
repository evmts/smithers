---
title: Prelaunch — custom domains, Vercel-style
status: in-progress
area: infra
owner: Opus custom-domains builder running in isolated mini repository; Codex tracker curates note
updated: 2026-10-21 20:55 PDT
links:
  - ../rulings.md
  - prelaunch-vibelang-on-smithers.md
  - ../infrastructure.md
---

## Tracker reconciliation — 2026-10-21 20:55 PDT

**What:** Allow Maintainers to configure and verify custom domains with TLS.

**Why:** Provide the hosting controls needed by the VibeLang factory.

**Current state:** At 20:54 the lead reports the custom-domains builder running on the mini. The background-login blocker is superseded for this builder; no implemented or production-proven domain journey is reported.

**Next step:** Implement and prove add, DNS verification, TLS state and removal through injected services and durable flows, with server-enforced Maintainer access.

**Open questions for Will:** None newly identified.

Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, latest two hours through 20:55 PDT; synthetic notifications and tool blocks excluded. Current rulings and queue answers govern over historical decisions and proposals. Available recovered briefs were read; wiped scratch files are not missing work. Product results are lead-reported; Codex curates documentation and runs the maintainer-site build. Previous implementation ownership is retained below.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 20:47 PDT

**What:** Let Maintainers configure and verify custom domains with TLS.

**Why:** VibeLang needs Vercel-style hosting controls.

**Current state:** At 20:46 an Opus builder has an isolated mini clone and brief but awaits background Claude authentication. The feature is assigned, not implemented or production-proven.

**Next step:** Start the prepared builder; implement the approved Maintainer-only domain journey through injected services and durable flows.

**Open questions for Will:** No product question yet; mini background login is required.

Evidence: script-filtered human text and lead replies, 18:46–20:46 PDT, session 6253ecf2; current rulings and queue answers prevail. Runner results are recovered report receipts. Codex curates this update; existing implementation ownership is retained.

## Earlier tracker history (retained)


## What
A repository owner adds their own domain to a Smithers app in Settings, the way Vercel does it:
1. Enter the domain.
2. Get the DNS records to add (a CNAME, or A/AAAA records at the apex).
3. Smithers verifies ownership and issues TLS.
4. The domain serves the repository's app or home.
Remove and re-verify, the same way.

## Why
SCOPE-12, Will, 2026-10-21: "add support to smithers for configuring your own domain in same way you can on vercel." The first user is vibelang.sh.

## Authorization and UI (SCOPE-13)
- **Maintainers only:** the configuration is hidden from visitors and contributors, and the server enforces it, not just the UI.
- **Vercel-quality UI:** add a domain, DNS records to copy, live verification status, certificate state, and remove.

## Current state
Not built. Cloudflare (ARCH-3) offers Custom Hostnames, Cloudflare for SaaS, for exactly this. It must be reached through dependency injection (ARCH-7), as a service whose Cloudflare layer is one implementation.

## Next step
A design pass after tonight's deploy: the data model, the verification flow (durable, DUR-1), TLS status, the Settings UI, and who may add a domain (Maintainers and up).

## Open questions for Will
None yet. The design will bring any, with confidence scores.
