---
title: Production repository refusal locator
status: blocked
area: app
owner: Codex Sol (prod-repo-refusals)
updated: 2026-10-22
links: [../features/repo.md]
---

The supplied production snapshot and run-2293-six.log show the failing assertion:
the broad status locator matches both Not found and Connection. The product
keeps distinct sibling live regions for repository availability and connection
health. `AppShell` is only on `/app`; repository routes render `RepoHeader`
through Root's Outlet, so the two connection pills never share this page.
`ConnectionPill` is empty when connected and contains only connection changes.
W3C's [ARIA22](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22) describes
status regions for independent status messages; these regions do not duplicate
the same announcement.

The refusal assertion now matches the status's exact text, since a status role
does not derive its accessible name from its contents. The same test requires
exactly one Connection status on the entire page, in the repository header,
with polite announcements. Clone settlement and missing-file assertions stay.
No product code, UI copy, dependency or public API changes; the existing
`@smthrs/ui` catalog entry supplies the unchanged pill's Badge and Button.

Validation: frozen install and Playwright discovery (`pnpm --filter @smthrs/mvp
exec playwright test repo.spec.ts --list`) pass, listing all three tests.
Farm execution is pending: mini-run is absent from PATH and no mini-run or
MINI-RUN.md was found under the home directory through depth four or the
standard executable locations; the requested command exits 127 (command not
found). The runner path was requested. Astra review found no issues. Fable
review could not start: the local Claude CLI is not logged in. No production
e2e, deployment or farm modifications in this job. No browser pass is claimed.
