---
title: "CI parity: write-only GitHub commit statuses"
status: in-progress
area: sdk
owner: Opus dogfooding builder assigned by lead
updated: 2026-10-21 21:10 PDT
links: [../rulings.md, ../proposals/ci-cd-parity.md, ci-parity-required-checks.md, ci-parity-github-writes.md, no-github-actions.md]
---

## Tracker reconciliation — 2026-10-21 21:10 PDT

**What:** Publish durable Smithers run results as GitHub commit statuses.

**Why:** Required checks need real receipts.

**Current state:** Will accepts question:app-commit-statuses-permission at 20:58; the lead confirms this clears that blocker and forwards the answer. Deployment and real write proof remain unreported.

**Next step:** Deploy and verify statuses against an actual hosted run.

**Open questions for Will:** None; permission answer is settled.

Evidence: script-filtered user text and lead replies, 19:06–21:06 PDT; current rulings and queue answers through 21:06; surviving briefs and reports. Product results are reported receipts, not rerun here. Implementation ownership retained; Codex curates documentation. Wiped scratch files are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 11:54 PDT

**What:** Publish durable check results as smithers/<name> commit statuses.

**Why:** Hosted dogfooding needs visible checks without GitHub Actions.

**Current state:** At 11:49 the lead reports implementation built and handed to the lander: check start publishes pending and completion publishes its result. Production status writes are recorded as refused until the GitHub App permission changes. No landing or successful production publication receipt is reported.

**Next step:** Land the implementation, verify exact-commit results and recovery, then prove status publication on the dogfood PR after the installation permission is granted.

**Open questions for Will:** Queue item 970: grant Commit statuses Read and write and accept the installation update. No grant receipt is recorded.

Evidence: script-filtered user text and lead replies from session 6253ecf2, approximately 09:54–11:54 PDT; current rulings and queue answers take precedence over historical briefs, decisions, proposals, TODOs and rules. Product results are lead-reported; this tracker validates the site build only. Existing implementation ownership is retained; Codex curates documentation.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 11:24 PDT

**What:** Publish durable flow outcomes as smithers/<flow> GitHub commit statuses on the tested commit.

**Why:** Hosted dogfooding needs checks visible to branch protection without GitHub Actions.

**Current state:** At 11:19 commit statuses are an explicit missing dogfood dependency, assigned with repo check definitions and isolated Node check sandboxes to the dogfood builder. GH-10 authorizes status writes, but the GitHub App permission update is still requested. No working status-publication receipt exists.

**Next step:** Implement and test exact-commit pending/terminal statuses through SDK durable actions; verify failure recovery and stale-head isolation, then prove on the dogfood PR after installation permission is granted.

**Open questions for Will:** Existing request: set Commit statuses to Read and write on the Smithers GitHub App and accept installation updates. Product authorization is settled; provider permission completion is not reported.

Evidence: script-filtered human messages and lead text replies, 09:26–11:24 PDT, session 6253ecf2; current rulings and queue answers supersede historical briefs, designs, decisions, proposals, TODOs and rules. Engineering receipts are lead-reported; this refresh validates the site build only. Existing implementation ownership is retained; Codex curates documentation.

## Earlier tracker history (retained)


**What:** Publish durable Smithers flow outcomes as GitHub commit statuses named `smithers/<flow>` on the exact tested commit.

**Why:** GitHub branch protection must be able to require Smithers checks without reading or displaying GitHub Actions (GH-10). The [dogfood loop](dogfood-loop.md)'s step 4 reports our CI this way.

**Current state:** Built, 2026-10-21 11:45, in the dogfood workspace ([pull requests](../features/pulls.md#commit-statuses)):
- `@smthrs/integrations` gains `GitHub.Statuses.create` (write-only; 20 tests on a real socket, 100%).
- `checks/Run` reports each check `pending` as it starts (best effort) and its result from `runs` in a durable `checks/Report` step after the scripts and after the review, as the App with a token minted for `statuses: write` only.
- Refusals (no permission, no App, an unknown commit) are recorded once and never retried; outages and lost answers are retried.
- `docs/rules.md`'s `github.no-actions` and its Jev rule allow this one write.

**Blocked on:** the production App lacks "Commit statuses: Read and write" (the prod-flows panel's live check, 2026-10-21: Issues, Contents and Pull requests write, Metadata read). Until Will grants it and the smithersai installation accepts it, production records each status `refused` and the checks still run. The lead asked Will on 2026-10-21 about 11:25.

**Next step:** Once the permission is granted, run a TODO on production and read `smithers/<name>` on its head through GitHub's combined status as a person would. Requiring a check on `main` is [required checks](ci-parity-required-checks.md).

**Open questions for Will:** None beyond the permission the lead asked for.

## History

2026-10-20 23:44 PDT: added by the Codex tracker curator from the lead's text and Will's queue answer (GH-10, 23:36:55).

2026-10-21 11:45 PDT: built by the dogfood-loop builder; production waits on the App permission.
