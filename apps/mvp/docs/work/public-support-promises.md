---
title: Reconcile public support promises after legacy removal
status: done
area: process
owner: Codex
updated: 2026-10-21
links: [../rulings.md]
---

Will chose “Remove both promises until the new app ships them; keep the contact routes” in the decision queue on 2026-10-21 at 21:06 PDT (decision:support-md-promises).

SUPPORT.md removes Pro billing and priority-support promises and the account export/erase section. All contact routes and policy links remain. Repository searches found no links to the removed section and no generated copy sourced from SUPPORT.md.

Checks: contact and policy link sets match the original; removed promises are absent; generated support pages pass `sync-support-docs.mjs --check`. No SUPPORT.md projection or removed-section links were found, so docs sync was unnecessary. `pnpm docs:check` ran under heavy.lock but failed because workspace dependencies lack `tinyglobby`. The optional support-matrix test could not start because workspace dependencies lack `yaml`. No library or SDK changes.
