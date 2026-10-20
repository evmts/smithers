---
title: Recover or reset this browser's data
status: idea
area: app
owner: unassigned
updated: 2026-10-20
links: [old-app-feature-gaps.md, local-first.md, sign-in.md, settings-screen.md, bug-report-and-diagnostics.md, ../features/sign-in.md]
---

## What

When local storage breaks, a person saves what is on the device and starts clean.

Old app:
- **Download local recovery file:** a JSON copy of the device's data, without tokens (`apps/app/src/mainview/StorageRecoveryButton.tsx`, `state/controller/storage-recovery.ts`, `chain/StorageRecovery.ts`).
- **Reset this browser's data:** a second press erases and reloads, and the app says when another tab still holds the data.
- Both are offered on the startup failure screen (`StartupRecovery.ts`) and in chat (`storage.recovery`).
- On an account switch, the previous account's data is wiped first. Until that finishes, new actions say "Account cleanup is running" (`chain/PrivacyRetirement.ts`).

New app:
- Signing out wipes the device ([sign-in](../features/sign-in.md)).
- An engine failure shows "Smithers can't run in this browser" with Reload.
- No export or reset door. Sign-out drops queued asks without saying how many (sign-in's "Not built yet").

## Why

Local-first means the device holds work nobody else has: the outbox and Not sent questions. A broken OPFS store otherwise leaves a person with only Reload.

## How it fits

- `app/device/export`: a client flow that reads the local collections and the outbox and saves a file through the browser host.
- `app/device/reset`: reuses `DeviceWipe`.
- Both are offered on the failure pill and in [Settings](settings-screen.md). Neither ever includes tokens or cookies.

## Size

S.

## Questions for Will

None.
