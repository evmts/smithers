---
title: Report a bug and read diagnostics from the app
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, observability.md, web-page-flow.md, device-data-recovery.md, ../../../../AGENTS.md]
---

## What

A person reports a bug with the ids we need to find it, and admins read the app's own state.

Old app:
- **`/bug`:** opens a prefilled GitHub new-issue form (default `smithersai/smithers`) with the route kind, the build, the failure code and the correlation id (`apps/app/src/mainview/BugReport.ts`, `flows/entries/bug.ts`).
- **Failure details:** each failure is one sentence with buttons such as Retry, and its raw text sits behind Details (`FailureNotice.tsx`, `FailureDetails.tsx`).
- **`debug.errors`:** recent app errors and the toast history, dismissed toasts included (`flows/entries/debug.ts`).
- **Admin dev tools**, ⌘⇧D: store collections, transitions, network, tool calls, the flow registry and session facts (`DevtoolsPanel.tsx`).
- **`/debug-api`:** a console that calls the documented API, with a confirmation before writes (`cards/DebugApiCard.tsx`, `cards/views/DebugApiView.tsx`).
- **Startup failure screens:** a 60-second watchdog shows Retry or Reload instead of a blank page (`StartupError.tsx`, `StartupWatchdog.ts`).

New app: telemetry with trace ids on every request ([observability](observability.md)), but no door for a person to report or read anything.

## Why

- The root `AGENTS.md` keeps bug intake.
- Will's observability rule: a failure must be explainable from its records. A trace id in a report joins the person's words to our logs.

## How it fits

- `app/bug/report`: a flow that opens GitHub's new-issue URL with the build and the trace id, through [`app/web/open { mode: tab }`](web-page-flow.md). It never adds question, answer or payload text (the telemetry sentinel rule).
- Failure Details shows the code and the trace id.
- Admin dev tools read the local TanStack DB collections and the engine's step record. They are hidden from members (mvp.md §8: Hide).

## Size

S for the bug report and Details; M with the dev tools.

## Questions for Will

None.
