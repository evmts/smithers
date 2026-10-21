---
title: Round 4 public API baseline
status: done
area: sdk
owner: sol-baseline-queue
updated: 2026-10-21
links:
  - ../../../../.smithers/flows/release/check-api-baseline.mjs
---

Re-record round 4c/4d declarations after checking their changesets. Uses the repository release baseline gate.

Compatibility review against `80b1220e..cf6bd457`:

| Packages / declaration changes | Release notes |
| --- | --- |
| agent ModelStep; engine-store origin, parked state and placement; flows RuntimeOptions; flow RunMetrics; platform-cloudflare origin and placement | `flow-run-metrics.md` |
| flow transported capability intersections and containment | `flow-transported-ceilings.md` |
| gateway InspectionJournal, RunTrace and exports | `flows-run-graph-slice-one.md` |
| integrations GitHub pulls, refs, commits and client methods | `integrations-pulls-refs-commits.md`, `integrations-github-count.md` |
| notifications Channels and exports | `notifications-channels.md` |
| platform-browser language service and worker protocol | `platform-browser-language-server.md` |
| platform-browser preparation and leader database lifecycle | `browser-runtime-prepare.md`, `device-migrations.md` |
| sync SharedText and exports | `sync-shared-text.md` |
| targets Factory/Home use the shared Home format; Typecheck gains optional compiler | `targets-home-from-views.md`, `vibelang-packages.md` |
| views newly public Home sections, audiences and blocks | `views-home-sections-public.md`, `views-home.md`, `views-web-page-check.md` |

All changes are intended features or the documented Home format consolidation. `GitHubClient.count` is a new required member for manually constructed client services, explicitly called out by its changeset. Later engine/flow readability commits preserve the surface. No API change lacks a changeset. The gate also hashes private declarations referenced by public signatures; their drift belongs to the listed features. No new library or dependency.

Validation: fresh declaration emit re-recorded 51 public packages (12 changed); a separate fresh declaration build passes the baseline check for all 51. `pnpm docs:check` passes with the existing native helper.
