---
title: Eval input boundary fixes
status: done
area: sdk
owner: codex
updated: 2026-10-22
links: []
---

Fix six confirmed eval boundary bugs with regression tests. Uses the library catalog's @smthrs/evals and @smthrs/scorers entries; no new dependencies.

Validation on Latitude: all six findings reproduced in nine failing cases before fixes; 259 tests pass after fixes with 100% coverage. Package and apps/mvp typechecks pass. The requested package importRules target is absent (unknown_label); no new imports or dependencies were added. Existing Eval.run/Eval.case spans remain in place.
