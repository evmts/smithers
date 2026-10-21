---
title: Live attention across devices
status: in-progress
area: notifications
owner: Claude Opus (live-attention)
updated: 2026-10-21
links: [../features/agent-status.md, ../features/notifications.md, ../features/sign-in.md, ../decisions/0015-agent-status.md, ../decisions/0009-notifications-and-live-work.md]
---

Three journeys: a needs-you card on every device, Hide reaching the other device, and hovering Runs without a crash.

| Journey | Cause found |
|---|---|
| Needs-you card | Status joined only home messages, leaving branch answers out. Reports that wrote nothing could still park the agent on an invisible question. |
| Hide across devices | Summary requests flooded sync. A busy or reloaded tab could lose a person-only press to a refused credential; failed pending acts stayed held. Branch pages had no toast stack. The two archived Hide failures had receipts on both devices, so the door and pending-act faults do not explain those failures. |
| Hover Runs | One renderer crash under load; the rerun passed. No stack survived, so the cause remains unknown. Capture the tab, crash time and heap trend on recurrence. |

Commits `80f07699`, `337bb976` and `5aeece7d` (Codex Astra's review) fix conversation status, report refusals and ordering, person-only presses, pending-act recovery, transport diagnostics, transient retries, watch recovery, branch detail updates, clone retry receipts and branch toasts.

Unit tests prove branch statuses and title counts across two devices, settled-answer precedence, serialized reports, final refusals, 408/429 retries, duplicate Answer suppression, preservation of the next question's draft, session use after a silent door, and removal of a pending act that can't land, with a fresh run for the next press. Attention tests cover watch recovery, branch detail subscriptions and the branch stack. The telemetry relay test preserves dropped-act and door-timeout diagnostics. The relay also keeps timeline summary diagnostics; its missing `unconfigured` record was exposed by the telemetry suite. These tests use the catalog's `@smthrs/flow`, `@smthrs/notifications`, `@smthrs/observability`, `@smthrs/effect-tanstack-db` and `@smthrs/ui`.

The real-model two-device test checks the card, toast, bell and title, Hide across devices, and an answer from the second device. Browser crash records retain the last two heap samples. Playwright execution belongs to the deployment sweep.

production e2e: pending deploy
