---
title: Stop test temporary-file leaks
status: done
area: testing
owner: codex-tmp-leak
updated: 2026-10-22
links: []
---
Surveyed MacBook temporary files read-only: 19.53 GiB. No deletion, dependency installation on this Mac, or push authorized/performed. Evidence and the requested twelve-line report live at `~/smithers-builders/tmp-leak-REPORT.md`; exact deletion candidates require Will's approval and a fresh open-file check.

Library catalog entry: filesystem host services. Engine-store uses Effect FileSystem.makeTempDirectoryScoped with the existing Node host layer. Test-only Node fixture boundaries retain Node filesystem helpers with finalizers. No production runtime or third-party dependency changes.

Sources fixed independently: MVP device SQLite fixtures; Vitest 5 root SSR transforms through an ownership-checked close hook (no dependency patch); engine-store recovery, drill, scheduler, cycle and catalog fixture scopes; coverage teardown; inherited test scratch and compiler caches; matrix process/report ownership and cancellation; CLI shard/merge scratch; and media scratch beneath the existing output directory. Caller-owned coverage reports are preserved.

Validation runs only through Latitude, sequentially. MVP full suite: 3,143 passed, two expected failures, thirteen skipped. Final engine-store: 2,206 passed and both typechecks passed. Tooling: 172 passed, typecheck passed, real success/failure coverage/cache/matrix cleanup regressions passed. Every touched library default suite has run; several unrelated behavior and environment gates remain red, with receipts outside the repository. Final real matrix success/failure/published-report/SIGINT/SIGTERM regressions passed. CLI shard discovery/cleanup (two tests), agent discovery (five tests), and agent typecheck passed. The CLI payload-admission and coding-resume failures reproduce with original baseline tests/config. No aggregate coverage claim.

Astra and Fable reviews identified socket length, Windows preload URL, matrix cancellation and regression finalizer issues; fixes retained their regression tests. Generated target index was regenerated on Latitude with all shared helper inputs declared.

The sixty touched library suites were executed on Latitude; fifty-one are green after focused reruns. Representative failures in each of the nine remaining packages reproduce with the fetched baseline configs: CLI, harness, build-cli, targets, flows, capability, observability, platform-node, and gateway. CLI typecheck/lint also remain red in unchanged source/test fixtures. These are not green gates.

Final focused app repeats could not acquire a host app permit on either Latitude host and were cancelled while queued. The earlier full app receipt is retained; no fresh app typecheck receipt is claimed. The Mac TMPDIR survey and candidate list resolve `/var` and `/private/var` aliases before comparing lsof; 3,367 exact old closed paths remain candidates, checked at 11:10 PDT. Shared caches and active/recent paths remain excluded.
