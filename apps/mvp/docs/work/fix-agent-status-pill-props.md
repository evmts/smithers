---
title: Preserve clickable status pill props
status: done
area: ui
owner: codex
updated: 2026-10-22
links: []
---

Fix AgentStatusPill dropping host props when clickable. Uses the library catalog's @smthrs/ui component entry and existing Badge primitive. Validate real React DOM attributes, refs and event delivery before and after the fix on Latitude.

Regression on Latitude: original code failed the clickable id assertion (19 pass, 1 fail). Fixed suite: 2,586 pass, 0 fail. UI and apps/mvp typechecks and the UI importRules target passed.

Browser validation: mini-run apps/mvp -- pnpm e2e status.spec.ts was cancelled while waiting for a farm slot; no browser test executed. No e2e result is claimed.
