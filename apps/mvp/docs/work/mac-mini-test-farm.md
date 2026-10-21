---
title: Mac mini test farm
status: done
area: infra
owner: test-farm setup agent; lead coordinates suite use
updated: 2026-10-20
links: [second-build-machine.md, dev-stack-hygiene.md, e2e-suite-and-gifs.md, ../rulings.md]
---

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
