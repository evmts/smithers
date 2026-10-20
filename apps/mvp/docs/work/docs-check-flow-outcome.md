---
title: Agents can't read whether docs:sync and docs:check passed
status: done
area: sdk
owner: docs-check fix agent, reported done 11:19:46 on 2026-10-20 (the lead to Will); a docs sync during landing fixes the stale `docsRedirectMap.ts` the check now reports. Until 11:19: docs-check fix agent, resumed by the lead at 10:42 on 2026-10-20 from where it stopped (the Claude usage limit stopped it from about 08:15 to 10:40); unreported by 10:44. Until 10:42: docs-check fix agent, started by the lead at 07:27:39 on 2026-10-20; unreported. Until 07:27: unassigned; reported by the slash commands, engine and hosts, plan identity and navigate agents on 2026-10-20
updated: 2026-10-20
links: [agent-jev.md, web-page-flow.md, site-deployment-test.md, land-to-main.md, slash-commands.md, navigate-flow.md, fable-review-2-fixes.md, plan-identity-across-deploys.md, plan-identity-minified-builds.md, pull-request-list-and-tabs.md, observability.md, dev-stack-hygiene.md, ../../../../AGENTS.md, branch-terminal.md]
---

## What

`pnpm docs:check` runs `go run ./packages/backend/modelprice/cmd/generate -check && smthrs flow start docs-sync --data '{"mode":"check"}' --wait`, and `pnpm docs:sync` runs the same flow with `mode: write` (root `package.json`). Every agent's proof list includes them, and their result can't be read:

```
pnpm docs:check
  └─ smthrs flow start docs-sync --wait
       06:45-06:56   _tag: Accepted, runId: run-211          exit 0, outcome unknown
       07:05-07:07   PASS ×12-16, then "All fibers interrupted without error"   exit 1
       07:11         run-218 failed: /control/LaunchFailed                       exit 1
  smthrs runs show run-211  ──▶  needs a browser session (agents' reports)
```

Best-guess spec:
- `--wait` waits for the run to settle, prints the outcome, and exits non-zero on a failure or a failed launch.
- `smthrs runs show` reads a run from the terminal with the CLI's own credentials.
- An interrupted run names what interrupted it.
- A failure's hint names its own cause. Today an interrupted check suggests `pnpx smthrs skills add`.

## Why

The repository's `AGENTS.md` requires `pnpm docs:check` for Smithers docs changes. An exit 0 that only means "accepted" lets a red docs check through, and three agents in one hour couldn't say whether theirs passed. The root `AGENTS.md` treats a cause the records can't show as an observability defect, with the same priority as the bug.

## State

- 2026-10-20, the [plan identity](plan-identity-across-deploys.md) agent: `pnpm docs:sync` returned only an `Accepted` receipt (run-194), and `smthrs runs show` needed a browser sign-in.
- 06:45 to 06:56 on 2026-10-20 (scratchpad `nav-docs-sync.log`, `wipe-docs-check.log`, `docs-check.txt`, `slash/docs-check.log`): run-201, run-209, run-210 and run-211 each printed `_tag: Accepted`, a receipt and a run id, and exited 0.
- 07:05:33, 07:06:02 and 07:07:30 on 2026-10-20 (scratchpad `nav-docs-check.log`, `p2-docs-check.log`, `fork-turn-docscheck.log`): three `docs:check` runs printed 12 to 16 package `PASS` lines, then failed with "All fibers interrupted without error".
- 07:11:16 (scratchpad `nav-docs-check2.log`): run-218 `failed`, "/control/LaunchFailed: The accepted run was not published as running before its driver admission budget expired". The navigate agent started a third try at 07:16:24.
- 07:06:06 and 07:07:38: the [slash commands](slash-commands.md) and [Fable review 2](fable-review-2-fixes.md) engine and hosts agents reported they couldn't read the outcome: "`smthrs runs show` needs a browser session".
- 07:08:32: Panel G was still waiting on its last `pnpm docs:check` ([pull requests](pull-request-list-and-tabs.md)).
- 07:20:20 on 2026-10-20: Panel B's `pnpm docs:check` exited 0 on the second run; the first stopped with "All fibers interrupted without error" after only `PASS` lines, and it couldn't read the run's log ([branch terminal](branch-terminal.md)).
- 07:19:35 on 2026-10-20, scratchpad `docs-check-tarballs.log`: the published-tarball half passed, "50 published package tarballs passed".
- **07:27:39 on 2026-10-20, the lead to Will:** "I also started a fix for the docs check, which agents couldn't trust: it often returned 'Accepted' without waiting for the result."
- 07:29:30, scratchpad `docs-check-3.log`: 11 `PASS` lines, then `code: command_failed`, "All fibers interrupted without error", with a hint that names an unrelated cause: "Skills are out of date: … `pnpx smthrs skills add`".
- 07:30:21: the lead's load note: the machine's load average hit 170 and full suites now take a shared lock ([dev stack hygiene](dev-stack-hygiene.md)). Whether load caused some of the interruptions isn't on record.
- 07:32:19, scratchpad `r1/out.log`: another run, 44 `PASS` lines so far.
- **Status moved from todo to in-progress** at the 07:27:39 start.
- **07:44:39 on 2026-10-20, the [navigate](navigate-flow.md) agent's report:** "`pnpm docs:check` hasn't completed in about an hour across three tries (timeout, launch failure, very slow)."
- **07:49:53 on 2026-10-20, the [Jev](agent-jev.md) agent's report:** `pnpm docs:check` "failed twice ('The body of flow docs-sync could not be loaded'); the same check passed when run directly." A third failure mode, beside "All fibers interrupted without error" and `LaunchFailed`.
- 07:44:34, the [web page flow](web-page-flow.md) agent: `docs:sync` and `docs:check` pass. 07:51:39, the [site deployment test](site-deployment-test.md) agent: `apps/site` `check:docs` exits 1 on `sync-api-docs --check` drift in `crypto.mdx` and `platform-cloudflare.mdx`, from unfinished SDK changes; not this item's.
- No report from the fix agent by 07:53.
- 07:55:10 on 2026-10-20, the lander's round 2 check (scratchpad `r2/out.log`): `smthrs flow start docs-sync --data '{"mode":"check"}' --wait` printed 50 package `PASS` lines, then `_tag: Accepted` (`run-240`). This item's defect, seen again.
- 07:56:18 to 07:59:40, on disk, best guess the fix agent's: scratchpad `Settlement.orig.ts`, `Settlement.new.ts` and `interrupt-probe.ts`; `packages/smithers/src/commands/Settlement.ts` with `test/Settlement.test.ts`, `src/cli/ControlBridge.ts` with `test/ControlBridge.test.ts`, `src/internal/LocalRuns.ts` and `src/internal/backend/Destination.ts`.
- No report by 08:07. Kept out of landing round 2 at 07:53:57 as still in flight ([land to main](land-to-main.md)).
- 08:11:44 to 08:12:11 on 2026-10-20, on disk, best guess the fix agent's: `packages/smithers/test/CatalogMount.test.ts` and `src/internal/backend/Destination.ts`.
- **About 08:15 on 2026-10-20: the Claude usage limit stopped the fix agent** ("Fix docs:check so it reports pass/fail", 15:15:38Z) with every other Claude agent, unreported. The limit reset at 10:40.
- **10:42: the lead resumed it** from where it stopped ("the docs-check fix"). No report by 10:44.

- **11:19:46 on 2026-10-20, the lead to Will: fixed. "The root cause was an engine performance bug, not the docs."**
  - **Cause:** "every Smithers CLI process checked every open run every 5 seconds, taking the database's write lock each time. The docs-check run's heartbeat queued behind those checks until its lease lapsed and the engine killed it mid-step. That's where 'All fibers interrupted' came from."
  - **Fix:** "those checks now read without the write lock, and a waiting CLI dropped from about 100% CPU to about 5%."
  - **Results:** "`--wait` always reports a pass or fail and exits accordingly, and you can read a local run's result without signing in through a browser."
  - The lead "stopped three docs checks that had been stuck for 3 to 4 hours, each burning about 70% CPU." One was the [navigate](navigate-flow.md) agent's (11:19:51).
  - "The check now gives a real answer on the current tree: it fails because the docs redirect map is out of date. The next docs sync during landing fixes that." That red is the tree's, not this item's ([land to main](land-to-main.md)).
  - On disk 11:16:00: `packages/smithers/test/Settlement.test.ts`; the earlier files are listed at 07:56 to 08:12 above. Uncommitted; it lands with the next [landing round](land-to-main.md).
  - Not on record: whether "an interrupted run names its cause" and "a failure's hint names its own cause" from the best-guess spec were done. The lock fix removes the cause of the interruptions seen here.
- **Status moved from in-progress to done** on the 11:19:46 report.

## Next

Done (11:19:46 on 2026-10-20). Left for others: a `pnpm docs:sync` refreshes `docsRedirectMap.ts`, the one red the check now reports, during [landing](land-to-main.md). A docs check now counts on its exit code.

Until 11:19 on 2026-10-20 the next step was, from 07:27 on 2026-10-20: the fix agent's report, upstream in the Smithers CLI with tests: `--wait` returns the settled outcome and exits non-zero on a failure or a failed launch; `smthrs runs show` reads a run with the CLI's own credentials; an interrupted run names its cause; a failure's hint names the real one. Until then, a docs check counts only with its `PASS` lines and exit 0 on record.

Until 07:27 on 2026-10-20 the next step was: An agent fixes it upstream in the Smithers CLI, with tests: `smthrs flow start --wait` returns the settled outcome and a non-zero exit on failure or a failed launch, and `smthrs runs show` reads a run without a browser. Until then, a docs check counts only with its `PASS` lines and exit 0 on record.

## Questions for Will

None.
