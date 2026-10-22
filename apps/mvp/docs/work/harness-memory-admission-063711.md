---
title: QuickJS memory admission and initialization cleanup
status: done
area: harness
owner: codex-mini-063711
updated: 2026-10-22
links: []
---

Reproduce and fix array property accounting, wide strings, initialization cleanup,
failed probes, and repeated allocation after memory refusal.
Library catalog entry: `@smthrs/harness` for bounded persistent QuickJS realms.

All five findings reproduced: nine regression cases failed against the original
code. The fixes retain refusal state, remeasure after a failed or missed probe
before admission, weigh custom array properties and conservative string bytes,
and scope runtime cleanup before configuration and context creation.

Validation: 2,477 existing tests passed before the change. Afterward, all 2,489
tests pass, with 100% statements, branches, functions and lines; three existing
tests remain skipped. Package importRules, test typechecking, source lint and
formatting pass. App typechecking passes before and after. The target index is
regenerated. E2e: not run (mini clone).

Astra review found no actionable issues. Fable is unavailable through this
session's tools and model list.
