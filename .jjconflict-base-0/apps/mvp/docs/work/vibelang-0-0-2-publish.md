---
title: Publish VibeLang 0.0.2
status: blocked
area: process
owner: Will (npm one-time password)
updated: 2026-10-19
links: []
---

## What

Publish the tested VibeLang 0.0.2 build (11 packages, commit `8a67c2ec`) to npm under `fucory`, then install it with npm and Bun and build a test app.

## Why

Will: "hwo do I publish vibelang make it really easy for me". The VibeLang benchmark and effeck.dev waited on it, and the benchmark falls back to 0.0.1 after 12:00 on 2026-10-19.

## State

- Staged on this Mac: `sh ~/effectscript/dist-npm/publish-0.0.2.sh`. All 11 files match the release checksums, and a dry run passed.
- `npm view vibelang version` still returns 0.0.1 at 21:10 on 2026-10-19.

## Next

Will runs the script in his own terminal and types the npm one-time password.

## Questions for Will

- Still wanted, or does 0.0.2 wait for the next release?
