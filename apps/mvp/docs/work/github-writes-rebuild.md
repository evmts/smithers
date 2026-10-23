---
title: Reconcile GitHub writes hardening with repository audiences
status: done
area: github
owner: codex-github-writes-reconcile
updated: 2026-10-23
links: [github-write-hardening.md, ../features/home.md, ../decisions/0077-github-projection-ordering.md]
---

Rebuilt the lander's six commits (syuunq through zvwsqp) on fetched main a78c2907.
Kept decision 0077; the lander renumbered the migrations to 0048–0050 (0046–0047 went to custom domains and conversations). Catalog entries: @smthrs/integrations
for GitHub, @smthrs/flow for durable writes, @smthrs/views for home audience filtering.
No new library or runtime. No push; all installs and validation run serially on Latitude.

## Audience reconciliation (SCOPE-14)

The three newly added home tests omitted the roles repository. VibeLang's Member
fixture now resolves its role on smithersai/vibelang; the curated Member and Maintainer
fixtures resolve theirs on octocat/Spoon-Knife. Their original audience assertions stay.
The Maintainer test's expectation of privileged sections on octocat/hello-world was
wrong: SCOPE-14 permits lower views within authority, never authority on another repository.
It now verifies visitor-only sections, no View as options, refused upward switching,
and a fresh highest-authorized view when returning to Spoon-Knife.

Production HomeApi's repository fence and current main's live session/device authority
remain unchanged. The reconciliation and home documentation are folded into commit three.
The six original commit descriptions are preserved.

## Latitude proofs

- home.test.ts: 22/22 passed.
- GitHub, issues, pulls, home, database/migrations, TODO Drop and target suites:
  599 passed, seven credentialed live skips; 41 passing files, two skipped.
- Integrations coverage gate: SQLite and PostgreSQL each 868 passed, four live skips;
  combined 1,736 passed, eight skipped, 100% statements/branches/functions/lines.
  Per-backend statements/lines were 99.95%, functions 99.85%, branches 100%; the
  package's combined gate passed without threshold changes.
- App typecheck: browser, worker, infrastructure and evals projects passed (129.5s).
- App and integrations importRules: both executed and passed (16.9s).
- The initial nyc-01 typecheck was cancelled while queued for a host permit;
  the serial retry on nyc-02 supplied the passing receipt.

Focused app tests disable suite-wide coverage and make no whole-app coverage claim.
No live GitHub writes, browser E2E, or deployment. Logs: /tmp/github-writes-reconcile/.
Final commit IDs and full commands: ~/smithers-builders/github-writes-REPORT.md.
