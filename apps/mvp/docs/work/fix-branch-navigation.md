---
title: Cancel obsolete branch navigation
status: done
area: navigation
owner: codex-fix-apps-mvp-src-030905
updated: 2026-10-21
links: []
---

Reproduce late branch navigation answers restoring presence, editor or terminal state after cleanup. Keep route orchestration in the framework-free branch feature; use the existing Effect services and TanStack Router (library catalog: app state and routing).


Decision: the router owns the lifetime of its live branch actions. Route exit aborts that lifetime before independent cleanup. Route-owned action bindings use Effect runtime cancellation; every asynchronous continuation also checks ownership. This extends existing APIs with optional signals and preserves their default behavior and observability. No new library was introduced.

Regression evidence: four delayed-answer cases failed against the original orchestration, then passed with ownership checks. Three additional cases failed while terminal storage, editor storage and socket teardown remained pending, then received Effect runtime cancellation. Astra review found no remaining defects after cancellation reached the presence bindings too.


Validation: `pnpm test src/features/branch src/features/navigation src/features/terminal src/features/coedit src/features/presence --coverage.enabled=false --silent` on Latitude: 122 passed across 8 files. Seven regression failures were demonstrated before their respective fixes. Coverage was not measured in these focused runs.

Browser baseline (`pnpm e2e e2e/branch-workspace.spec.ts`, Mac mini): branch views passed; branch conversation reload and both terminal journeys failed before the fix.

Browser TypeScript check: `pnpm exec tsc -p tsconfig.json --pretty false` passed on Latitude.

Final browser comparison was requested through `mini-run` but could not start: its shared browser lock remained occupied for over 45 minutes. The queued client was cancelled without disturbing the active run. Browser A/B validation remains blocked; no browser pass is claimed for this change.
