---
title: Effect-native workflows-as-code authoring API
status: designing
area: design
owner: Opus, Fable, Codex Sol and Codex Astra design panel; merger combines, Will reviews
updated: 2026-10-20 23:55 PDT
links: [../rulings.md, flow-authoring.md, ci-cd-parity.md, vibelang-generated-docs.md]
---

## Tracker reconciliation — 2026-10-20 23:55 PDT

**What:** Design the Effect-native workflow and PACKAGE.ts API with explicit file dependencies and hermetic execution.

**Why:** Will rejected the short merged proposal as insufficient to judge (FLOW-9).

**Current state:** At 23:51 Will requested a substantial four-model design covering the Bazel model, existing PACKAGE.ts input/dependency passing, declared sandbox resources and thin abstractions. At 23:53 the lead reports independent Opus, Fable, Codex Sol and Codex Astra designs underway. The earlier two-model proposal is retained history, not an approved API.

**Next step:** Merge all four designs into a detailed document: implemented/needs-change/missing inventory, at least eight today-versus-proposed examples, migration/deletions, and justified orchestration primitives. Obtain Will’s review before building.

**Open questions for Will:** Review the merged design when ready; earlier three-choice queue item is superseded by the requested redesign. Every recommendation needs a confidence score.

Evidence: last two session hours of user-typed text and lead replies extracted with a JSONL script (notifications and tool content excluded), through 23:54 PDT; queue answers through 23:51; current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Product receipts are lead-reported; tracker validation is the maintainer-site build. Prior history and execution ownership retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:44 PDT

**What:** Design one Effect-native authoring API for package targets, repository flows and shared plugins.

**Why:** Recover the old API’s readability while keeping Effect explicit (FLOW-9).

**Current state:** At 23:38 the lead reports the merged Opus/Sol proposal ready at ../proposals/flows-as-code-api.md. It proposes Flow.gen, PACKAGE.ts targets, .smithers/FACTORY.ts trigger declarations and versioned organization plugins. Nothing is implemented. At 23:39 the current PACKAGE.ts comparison is being corrected before review.

**Next step:** Retain accurate A/B examples and obtain Will’s three decisions before implementation or the VibeLang generator migration.

**Open questions for Will:** Queue 994: build bodies once (75%); codemod all 122 PACKAGE.ts files (55%); triggers only in FACTORY.ts/plugins (70%). Overall confidence 55%; accurate side-by-side examples support the low-confidence choice.

Evidence: user-typed text and lead text replies extracted by script from session 6253ecf2, approximately 21:44–23:44 PDT; queue answers through 23:38:44, current rulings, decisions, proposals, TODOs, rules and shared briefs/designs. Synthetic notifications and tool content excluded. Later rulings supersede retained history. Product receipts are lead-reported; this tracker validates the maintainer-site build. Execution ownership retained; documentation reconciled by Codex tracker curator.

## Earlier tracker history (retained)


**What:** Design one Effect-native authoring API over @smthrs/flow for PACKAGE.ts targets, repository .smithers flows and shared flow repositories, inspired by Alchemy.

**Why:** Will’s 23:16 queue ruling FLOW-9 rejects a one-off docs generator and asks to recover the old API’s ergonomics without hiding Effect.

**Current state:** Lead started independent Opus/Sol research at 23:17; proposal destination is docs/proposals/flows-as-code-api.md, not yet present in this pass. At 23:25 the designer resumed and received the old JSX createSmithers findings. This is research only; no implementation approval or completed merged proposal. Existing Flow.make and PACKAGE.ts contracts remain current.

**Next step:** Merge the designs with discovery/trigger rules, migration, and four examples: VibeLang docs generation as a PACKAGE.ts target, Smithers CI, cron, and plugin flow. Queue the proposal with confidence scores before the deferred VibeLang rework.

**Open questions for Will:** At most three in the completed proposal, each with a recommended default, confidence percentage, reason, and what would raise confidence below 60%. None needs asking before research completes.

Evidence: script-filtered lead replies through 23:25 PDT, Will’s 23:16 queue answer, FLOW-9 and FLOWS-AS-CODE-BRIEF.md. Historical designs yield to current rulings. No product validation performed by tracker.
