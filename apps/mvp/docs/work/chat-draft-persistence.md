---
title: Diagnose an unsaved message draft
status: in-progress
area: app
owner: Codex Sol draft-diagnostics builder assigned by lead; Codex tracker curator
updated: 2026-10-21 16:53 PDT
links: [personal-chat-draft-isolation.md, production-e2e.md, conversations-and-history.md, ../rulings.md]
---

## What

Preserve an unsent message through the supported navigation and reload journey, with records that explain any loss.

## Why

The production sweep reported an unsaved-draft failure. Draft persistence needs separate evidence from personal-versus-shared draft privacy.

## Current state

At 16:53 PDT the lead reports the unsaved-draft journey passed on rerun. Codex Sol could not reproduce a defect and added diagnostic records for a recurrence. No landing receipt or deliberate fault regression is reported; do not claim a persistence bug fixed from this pass.

## Next step

Collect the diagnostics landing receipt and retain the passing production journey. Investigate a recurrence from its records, preserving draft content privacy (OBS-5).

## Open questions for Will

None.

## History

2026-10-21 16:53 PDT: added by Codex tracker curator from the lead's script-filtered 16:53:02 reply in session 6253ecf2. Rulings and queue answers override older briefs; no product tests run by this tracker.
