---
title: Plan validation and diff regressions
status: done
area: SDK plan
owner: codex-plan-175685
updated: 2026-10-21
links: []
---

Reproduce seven reported plan findings in an isolated workspace. Use the library catalog's @smthrs/plan entry; no new dependencies.

Latitude baseline: four regression tests failed for the reported reasons; schema-value redaction probe passed. Fixes share branch/catch construction bounds, omit invalid plan/flow values, bound diagnostic node ids, and attribute reference changes by upstream id independently of diff pairing. The package's 1,848 tests and TypeScript checks passed on Latitude.

Not changed: schema messages did not retain the rejected version or boundary mode in probes; defineProperty on a null-prototype digest record has no reproduced behavioral failure; priority validation happens during construction before graph ids exist, so an offending graph reference cannot be asserted through this API.

Final Latitude receipt: 28 files / 1,848 tests passed with 100% statement, branch, function and line coverage; package lint and TypeScript checks passed. Four findings fixed; three not reproduced as behavioral failures.
