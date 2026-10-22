---
title: Reviewed WireTrace export contract
status: done
area: sdk
owner: Codex
updated: 2026-10-22
links: []
---
9d77a930 deliberately added WireTrace (changeset model-wire-trace-host and model API docs), but omitted the reviewed additions ledger. Preserve the historical maps and register only this addition with contracts/register-public-export.mjs; no assertions removed. No library choice: repository metadata tooling uses existing workspace-packages inventory.

Latitude: export contracts 39/39, package suite 168/168 (100% coverage), pnpm check and touched contract ESLint passed. Receipt: /tmp/main-reds-2-exports.log.
