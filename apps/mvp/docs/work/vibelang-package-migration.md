---
title: Migrate Smithers Effect code to VibeLang, one package at a time
status: in-progress
area: sdk
owner: VibeLang migration session; lander excludes unpublished links
updated: 2026-10-20
links: [../rulings.md, vibelang-0-0-2-publish.md, second-build-machine.md]
---

## Current specification — 2026-10-20, 17:34 PDT

**What:** Migrate Effect code one package at a time and pause for review.

**Why:** Will authorized a first-package migration with test/build tooling preserved.

**Current state:** At 17:24 the lead reports @smthrs/fs migration present in the shared checkout for review and execution. It references local ~/effectscript folders and cannot land until VibeLang is published on npm. No full-package passing suite or review receipt is reported.

**Next step:** Keep the migration off main while local links remain. Obtain first-package tests and review, publish the required language artifacts at the authorized end of that work, replace local links and verify a clean-machine install.

**Open questions for Will:** Review the first fully migrated package before proceeding.

Evidence: queue answers through 2026-10-21 00:34:14 UTC; script-filtered human text and lead replies from the latest two transcript hours through 00:33:48 UTC; current rulings, decisions, proposals, TODOs, rules and shared briefs. Latest answers supersede older blockers. Product tests are reported evidence; this tracker runs the maintainer-site build only.

## Earlier tracker history (retained)

## What

Migrate all Effect code and tooling package by package to the Effect.ts VibeLang at `~/effectscript`, linked from disk with `npm link`. Start with the core build and test suite; support LSP and VS Code tooling as the migration requires it.

## Why

Will’s 14:00 request, recorded as OTHER-1, asks for a real migration and expects language upgrades along the way. The old chat conversion feature is a separate workstream.

## Current state

Will authorized an active first-package goal and required a pause for his review after one package is fully migrated. No named package completion, passing migration suite or review receipt appears in the lead’s extracted updates through 15:23:55 PDT. The request is authorized; the available tracker evidence does not establish an implementation start.

## Next step

Collect the migration session’s selected-package and test receipts. Fix language/toolchain gaps, preserve every test, finish one package, then pause for Will’s review. Publish at the end, as OTHER-2 requires; 0.0.2 publication is not a prerequisite.

## Open questions for Will

Review the first fully migrated package before proceeding to the next.

## History

2026-10-20 14:00–14:05 PDT: Will requested all Effect code migrated using the latest local language, with tests passing, language fixes as needed and tooling support. Source: rulings OTHER-1 and OTHER-2.
