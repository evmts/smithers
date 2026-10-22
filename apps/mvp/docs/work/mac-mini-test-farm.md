---
title: Mac mini test farm
status: in-progress
area: infra
owner: test-farm setup agent; lead coordinates suite use
updated: 2026-10-21 23:14 PDT
links: [second-build-machine.md, dev-stack-hygiene.md, e2e-suite-and-gifs.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 23:14 PDT

**What:** Isolate each test slot’s database.

**Why:** Shared restart counters and sandbox run IDs must not collide between concurrent test slots.

**Current state:** At 23:07 the lead traces the apparent branch-terminal hang to four mini slots sharing one database while counting restarts independently. A Codex job is assigning one database per slot and changing the farm only while no tests run. Earlier runner recovery remains valid; slot isolation is unfinished.

**Next step:** Finish the idle-farm database split and prove concurrent slots cannot reuse sandbox run IDs.

**Open questions for Will:** None newly required.

Evidence: user text and lead replies extracted by script from session 6253ecf2, approximately 21:14–23:14 PDT; tool payloads and automated notifications excluded. The supplied continuation transcript path is absent; recent continuation-era replies are in the original file. Rulings and queue answers take precedence over older docs and surviving briefs. Wiped scratch files are not missing work. Product receipts are lead-reported; this refresh validates the site build. Codex curates documentation and retains execution ownership.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 20:47 PDT

**What:** Provide isolated Mac mini test execution.

**Why:** Run browser journeys away from the MacBook.

**Current state:** Rebuild report confirms node v26.5.0, one real landing e2e pass, exit 17 propagation and cancellation 143 with released locks. The lead confirms runner availability at 20:38. SIGKILL/network loss may leave companion locks; documented recovery still applies.

**Next step:** Resume remote suites with MINI-RUN.md; do not confuse test availability with Claude background login.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead replies, 18:46–20:46 PDT, session 6253ecf2; current rulings and queue answers prevail. Runner results are recovered report receipts. Codex curates this update; existing implementation ownership is retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 20:34 PDT

**What:** Provide browser-test capacity through the shared mini-run wrapper.

**Why:** Keep browser suites and recordings off the MacBook.

**Current state:** The reboot interrupted the local wrapper, not the surviving remote farm. The rebuilt MINI-RUN.md and mini-run-rebuild-report.md record Node v26.5.0 exit 0 and a real start-app landing e2e: 1 passed, exit 0, from the Flows workspace. Explicit failure returns 17; cancellation returns 143 and releases locks/stops the tracked process. This clears the earlier offline/setup blocker; it does not certify every app journey.

**Next step:** Use the recovered wrapper for model-free browser tests; verify owner/process liveness before clearing any lock left by SIGKILL or network loss.

**Open questions for Will:** None.

Evidence: lead text replies script-filtered from session 6253ecf2, approximately 18:34–20:34 PDT, and recovered briefs where named. Automated notifications and tool content are excluded. Current rulings and queue answers prevail over older plans. Existing implementation ownership is retained; Codex curates the tracker. Product results are reported evidence, not tests rerun by this refresh.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 15:54 PDT

**What:** Provide browser test and recording capacity.

**Why:** Real browser proofs need an available execution host.

**Current state:** At 15:50 the lead confirms the mini is offline and tells every agent to run suites on Latitude, with browser e2e locally only when needed. No large downloads, installs or container-image pushes while Will uses phone data.

**Next step:** Wait for mini availability; use Latitude suites and necessary local browser checks within the bandwidth constraint.

**Open questions for Will:** None newly identified; unresolved questions in the retained history remain open.

Evidence: script-filtered lead text replies in session 6253ecf2, latest approximately two hours through 15:53 PDT. Automated notifications, tool content and compaction summaries excluded. Rulings and queue answers prevail over historical briefs. Implementation ownership retained; Codex maintains these notes. Product receipts are lead-reported; this refresh verifies the site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20, 23:04 PDT

**What:** Provide serialized capacity for real browser suites and recordings.

**Why:** Shared load and startup failures have blocked feature proof.

**Current state:** The lead lifted the test pause at 23:01. At 23:02 thirteen builders were resumed with mini e2e allowed from 23:18, one run at a time; at 23:03 the Effect home builder is waiting for that slot. This is active farm coordination, not proof that every waiting suite passed. Earlier startup failures remain historical evidence.

**Next step:** Run the queued serialized journeys and retain fresh mini startup and suite receipts. Keep Cloudflare sandbox-runtime proof separate.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, 21:03–23:03 PDT; synthetic notifications and tool blocks excluded. Current rulings and queue answers (latest 19:38 PDT) prevail over historical briefs/designs. Execution ownership is retained; Codex tracker curator reconciles documentation only. Product receipts are lead-reported; this pass verifies the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 21:54 PDT

**What:** Keep the Mac mini farm ready for browser suites and recordings.

**Why:** Heavy tests need reliable capacity.

**Current state:** At 21:46 the lead reports the QuickJS default build avoids startup WebAssembly loading. At 21:51 the shared dev server restarted cleanly; no explicit fresh mini startup and waiting-suite receipt is reported. The earlier mini failure remains unresolved evidence, so status stays blocked. Cloudflare local-runtime sandbox proof is also pending.

**Next step:** Obtain a clean mini server start and rerun the waiting recordings; retain the bundled sandbox runtime proof separately.

**Open questions for Will:** None.

Evidence: script-filtered user text and lead replies from session 6253ecf2, approximately 19:54–21:54 PDT; compaction summaries, tool blocks and relayed agent messages excluded. Current rulings and queue answers take precedence over historical briefs, decisions and proposals. Execution ownership retained; reconciliation by Codex tracker curator. Product receipts are reported evidence; tracker validation is the maintainer-site build.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 21:34 PDT

**What:** Keep the four-slot Mac mini test farm usable for suites and recordings.

**Why:** Heavy checks need reliable capacity away from the shared MacBook.

**Current state:** The lead corrected the recovery claim at 21:24 and again at 21:33 PDT: Node loading improved, but API-server packaging still cannot read the WebAssembly file and the mini dev server cannot start. The coding-factory owner is fixing it. The earlier 21:16 passing journey does not establish a recovered farm.

**Next step:** Obtain clean dev-server startup and API bundling receipts on both mini and MacBook, then rerun the waiting suites. The HTTP/2 owner uses the MacBook meanwhile; the Effect-home owner also awaits its heavy-test lock.

**Open questions for Will:** None.

Evidence: script-filtered human text and lead assistant replies from session 6253ecf2, approximately 19:34–21:34 PDT; rulings, queue answers through 19:38, shared feature/host/panel briefs and designs, decisions through 0021, proposals, TODOs and rules. Execution ownership retained; reconciled by Codex tracker curator. Product checks are reported evidence; this pass validates the maintainer-site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 21:25 PDT

**What:** Keep the four-slot Mac mini test farm usable for suites and recordings.

**Why:** Heavy checks need reliable capacity away from the shared MacBook.

**Current state:** At 21:18 PDT the lead reports the coding-factory owner moved WebAssembly loading inside the Cloudflare worker layer and a mini slash-commands run passed around 21:16. Four waiting owners were told to rerun. This supersedes the 20:57 startup blocker in the lead updates; one passing journey does not establish that every waiting suite works. The live test database may receive the owner’s latest migration; shared dev stays at 0028 until landing.

**Next step:** Collect fresh startup, bundling and browser receipts from all waiting owners, including the Effect home, branch recordings and sweep. If a fresh run still fails, retain its failure and reopen the blocker. Keep dependency edits and the lockfile synchronized.

**Open questions for Will:** None.

Evidence: script-filtered user-typed text and lead assistant replies from the last approximately two transcript hours; current rulings, queue answers through 19:38 PDT, shared feature/host/panel briefs and designs, decisions through 0021, proposals, TODOs and rules. Completion checks are reported evidence, not rerun by this tracker. Execution ownership retained; reconciliation by Codex tracker curator.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 20:57 PDT

**What:** Keep the four-slot Mac mini test farm usable for independent suites and recordings.

**Why:** Heavy checks and browser evidence need reliable capacity away from the shared MacBook.

**Current state:** The lead regenerated the lockfile at 20:27 PDT after a package edit broke strict installation; installs recovered. At 20:57 tests are blocked again: the dev server cannot start because the coding-factory sandbox path loads a WebAssembly module Node cannot read. The lead assigned that fix to the factory owner. Earlier farm setup and parity receipts remain valid history, not current availability.

**Next step:** Fix the Node/WebAssembly boundary, prove the dev server starts, then rerun queued browser journeys. Preserve the lockfile with every dependency edit and report actual suite results.

**Open questions for Will:** None.

Evidence: script-filtered human messages and lead text replies from session 6253ecf2, approximately 18:57–20:57 PDT; current rulings and queue answers, decisions through 0021, proposals and shared briefs/designs. Transport details additionally use its final builder report. Product checks are reported evidence; this pass runs the maintainer-site build. Execution ownership retained.

## Earlier tracker history (retained)

## Current specification — 2026-10-20, 16:44 PDT

**What:** Run independent unit and browser suites on the local-network Mac mini through mini-run.

**Why:** Reduce the MacBook shared test-lock bottleneck without copying secrets.

**Current state:** At 16:41 PDT the lead reported the farm running with four slots and working-tree transfers in 2–5 seconds. Both machines passed 1,720 tests and failed the same three; this is parity, not a green app suite. effect-electric took 3.6 s on the mini versus 15.7 s locally; app units took 270 s versus 356 s plus lock waits. These are reported timings, not a reproduced benchmark. Browser suites without live models run there and only passing recordings return. The first cold-run start-page failures were setup failures; MacBook replacements pass.

**Next step:** Use the farm for independent suites; keep live-model/GitHub, shared-dev-server, docs:check and jj-history checks on the MacBook. Track the three shared test failures with their owners.

**Open questions for Will:** None; Will authorized the compute. The old org remains stopped.

Evidence: user-typed text and lead text replies extracted by script for 21:43–23:43 UTC from session 6253ecf2; rulings and queue answers override older briefs. Product receipts above are reported by the lead; this tracker ran only the site build.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 16:35 PDT

**What:** Run independent suites on the local-network mini with an isolated browser-test stack.

**Why:** Will offered compute to reduce shared-lock contention.

**Current state:** Setup remains in progress. At 16:29 the lead reported start-app/landing and start-app/sync-down-at-boot recordings failed at 16:25, possibly during the mini’s first trial. The lead asked whether this is setup or product failure; neither cause nor a successful farm receipt is established.

**Next step:** Reproduce the two failures and prove real unit/browser runs, secret exclusion, isolation and copied recordings before moving suites.

**Open questions for Will:** None; access is authorized.

Evidence: lead text replies extracted by script from the session’s latest two hours through 23:34:16 UTC; current rulings and queue answers take precedence over older designs. Reported product-test receipts only; this tracker ran no product tests.

## Prior tracker record (retained)


## What

Run independent suites on the local-network Mac mini with a mini-run command and its own Postgres, Electric and dev server. Copy the current working tree, including uncommitted edits but no secrets; reinstall on lockfile changes, stream results and return recordings. The lead proposes up to four concurrent users.

## Why

The MacBook's shared test lock serializes about 15 agents. Will offered the Mac mini's compute at 15:51 PDT. This is test capacity, not restarting the retired agent org or a self-hosted product install.

## Current state

At 15:52 PDT the lead reported setup underway on a 14-core mini with 64 GiB RAM and 110 GiB free. No successful remote suite or browser-stack receipt was reported. The old org stays stopped.

## Next step

Prove mini-run with real unit and browser suites, isolated simultaneous runs, returned recordings and secret exclusion. Move independent suites only after those receipts; keep shared-server, model-key and live GitHub tests under the existing lock.

## Open questions for Will

None. Compute access is authorized; concurrency and copying are lead proposals to validate.

## History

2026-10-20 15:51–15:52 PDT: Will offered access and the lead assigned test-farm setup. Evidence is extracted human/lead text from session 6253ecf2; this tracker ran no remote commands.
