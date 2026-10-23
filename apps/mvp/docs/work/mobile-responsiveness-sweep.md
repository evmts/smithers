---
title: Mobile responsiveness sweep
status: blocked
area: frontend
owner: codex-mobile-sweep
updated: 2026-10-23
links: []
---

Will's sweep at 390×844, 768×1024 and 1280×800 lives in the private mobile-sweep jj clone. Never push. Installs, unit suites and static checks ran on Latitude; browser checks ran through mini-run. No local node_modules installation.

Catalog entries: @smthrs/ui for shared controls and @smthrs/repo-view for repository presentation. No new dependency. Minimum 32px targets apply only through 960px; desktop tap sizing remains outside the change.

The desktop defects have red-first receipts. Docs routes now declare their header bell in the route contract, preventing a duplicate mount; the CSS hiding workaround is removed. The README editor takes its content height. The timeline measures wrapped labels, bounds its octave windows by available height and aligns viewport bands with row gaps and partial groups. Open disclosures stack above the docked composer through 1179px; the 1024×600 regression failed before this fix and passes after it. Signed-out Issues uses the same narrow alignment as New issue.

The spec audits both identities and populated composer, flow editor, conversation, queue, run and toast states. It opens the narrow rail and checks hit targets, row bounds, labels and bands. The separate timeline journey chooses its seeded question explicitly and follows entry identity through changing zoom windows. Files/HTML viewers require Code Storage and membership; issue/PR detail requires the GitHub App. Exactly eight existing prerequisite skips per size remain. No product defect was converted to a skip. Secrets are audited empty; synthetic unfinished notices stay local-only.

Every desktop capture compares the same live DOM with the indexed mobile additions applied and removed, retaining the approved desktop repairs. This guards against accidentally widening the indexed rules to desktop; it is not a historical golden comparison. No content masks or page exemptions. Changed desktop surfaces are docs/index and docs pages (both identities), repository and branch README (both identities), signed-out terminal README, and the populated conversation timeline.

Rebased cleanly onto main@origin a7b2bd8cf98c23aaf4c341ab0d9bd79f05c44eec. No migrations or decisions renumbered; no merge conflicts. Astra reviewed the sweep; Fable's final review found no remaining substantive defects after its contract and breakpoint findings were fixed. Fable was read-only with no shell tool. GitHub anonymous quota failures were handled by waiting for their observed resets, never by skipping docs or adding product retries.

Latitude: all four app typechecks and importRules pass. The full app suite has 3,751 passing tests, two existing expected failures and 16 existing skips, across 290 passing files and six skipped files. The unchanged global coverage gate fails: lines 99.98%, functions 99.92%, statements 99.93%, branches 99.80%. The changed attention contract is 100% in all four. Nine untouched app source files remain below the gate.

Shared UI typecheck and all 2,641 tests pass. All 14 changed UI production files have 100% measured lines/functions; 35 other UI source rows remain below 100%. Repo-view has 167 passing tests and 100% measured lines/functions. Bun does not provide the app's four-dimension coverage report. No thresholds, production exclusions or assertions were weakened.

BLOCKED by the requested package-wide coverage gates. The exact final browser receipts, docs-check result, commit IDs in landing order and lander notes are in ~/smithers-builders/mobile-sweep-REPORT.md. Evidence is in ~/smithers-builders/mobile-sweep-evidence/. No push.
