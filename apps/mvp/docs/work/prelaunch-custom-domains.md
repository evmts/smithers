---
title: Prelaunch — custom domains, Vercel-style
status: in-progress
area: hosting
owner: codex custom-domains rebase
updated: 2026-10-22
links:
  - ../rulings.md
  - prelaunch-vibelang-on-smithers.md
  - ../infrastructure.md
  - ../decisions/0039-custom-domains.md
  - ../features/domains.md
  - app-at-domain.md
---

## Rebase — 2026-10-22

Rebased the two-commit feature stack on `998199dc6263`. Decision 0039 and migration 0044 preserve main's records and reserved migration 0043. Domain flows extend the shared person-only registry; boot, routes, telemetry and the execution host retain main's plugin, sign-in, attention, TODO and recovery behavior. Domain collections are not persisted, so decision 0021's schema history and epoch 63 are unchanged. Latitude: all four typechecks, importRules, schema-lock generation (byte-identical, epoch 63), 405 targeted tests and 122 domain tests passed; domain statements, branches, functions and lines are 100%. Mac mini: both domain journeys passed together. The full app run passed 3,334 tests with three failures; the missing Auth provider in the connection test renderer and upstream telemetry contract drift were fixed and revalidated. The remaining killed-run recovery timeout in `src/features/status/flows.test.ts:233` reproduces on untouched main `998199dc6263` on a second Latitude host. Full-app validation is blocked by that existing failure; no assertion, timeout or coverage gate was weakened. The external rebase report records the receipts. Library catalog entries remain the feature's existing flow, Electric and TanStack DB wrappers; no dependency or SDK package is added.

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
Built behind Cloudflare for SaaS custom hostnames ([decision 0039](../decisions/0039-custom-domains.md), [feature](../features/domains.md)): the `DomainProvider` service (Cloudflare and DNS adapters, ARCH-7), `domain/Verify` (a durable poll) and `domain/Remove`, the Maintainer-only routes and shape, and the repository Settings page's Domains section. Tests and the e2e pass against the `dns` provider; GIF: `~/Desktop/smithers-mvp/gifs/domains-maintainer.gif`.

## Next step
1. From the MacBook: the Cloudflare setup in [domains.md](../features/domains.md#cloudflare-setup-once-from-the-macbook) and `worker/domains/Cloudflare.live.test.ts`.
2. With the smithers.sh cut-over: the fallback origin and Worker route in `alchemy.run.ts`, and the site Worker serving a custom host's repository app.

## Open questions for Will
None yet. The design will bring any, with confidence scores.
