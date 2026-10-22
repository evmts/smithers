---
title: Outbox owner security review
status: done
area: local-first
owner: Codex Astra
updated: 2026-10-21
links: [../decisions/0023-device-ownership-and-queued-authority.md]
---
Review queued authority across activation, upgrade and discard; regressions precede fixes.

Held: a fresh claim gained legacy-write authority on reload; upgrade callbacks saw foreign writes;
foreign parked writes could be discarded; memory-only activations sealed their own new writes.
Each was reproduced before its fix. Eligibility now persists in the owner record, upgrade/discard
check ownership, and memory writes use the request binding's `@none` identity.
Rejected: cookie changes bypassing ownership (immutable activation and server binding), and sealed
writes disappearing on owner return (real executor recovery regression passes).
Library catalog: `@smthrs/effect-tanstack-db`, stored collections and queued writes across deploys.
SDK changeset: `outbox-owner-review`. SDK suite: 169 tests, all four coverage dimensions 100%; typecheck passed.

Final device/auth/chat plus worker-auth run: 230 passed, one shortcut scope-cleanup assertion failed
outside this change. All new regressions passed. Docs sync completed; the full docs check could not
acquire the shared local test lock. No browser E2E was run in this review.
