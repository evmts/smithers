---
title: Prelaunch — custom domains, Vercel-style
status: todo
area: hosting
owner: none
updated: 2026-10-21
links:
  - ../rulings.md
  - prelaunch-vibelang-on-smithers.md
  - ../infrastructure.md
---

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
