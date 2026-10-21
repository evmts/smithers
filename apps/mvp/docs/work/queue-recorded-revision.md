---
title: Queue code at its recorded revision
status: done
area: maintainer-site
owner: sol-baseline-queue
updated: 2026-10-21
links:
  - ../../../maintainer-site/serve.mjs
---

Serve code and TypeScript outlines from the slice's recorded `commit`, cached by commit and path; use the working copy only without a recorded commit. Keep existing file refusal rules. Catalog: existing TypeScript parser and jj host executable in this standalone Node maintainer tool; no new library.

`revision` remains the text hash used by answers. An unavailable recorded commit returns 404, never newer working-copy code. The client keys its file and outline promises by slice, commit, text hash and path. Real jj fixture tests cover changed/deleted files, historical outlines, legacy text hashes, refusals and the 32-entry cache.

Validation: 78 unit tests pass; queue keyboard e2e and code-tools e2e pass on the Mac mini. Node syntax checks pass. New server lines are exercised by the real-jj regression test; whole-server coverage is not 100%.

`pnpm docs:check` passes with the existing native helper.
