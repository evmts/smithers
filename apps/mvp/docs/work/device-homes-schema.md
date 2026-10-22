---
title: Version bounded device home schemas
status: done
area: device
owner: codex
updated: 2026-10-21
links:
  - ../decisions/0021-local-first-migrations.md
---

Use the library catalog’s device migration entry, `@smthrs/effect-tanstack-db`.
Freeze homes v2 and curated-homes v1 before 3fc7fba8332d; append homes v3 and
curated-homes v2 with identity migrations. The migration runner validates the
new bounds and discards and counts incompatible cache rows, as these stores declare.

Latitude: schemas, upgrade and migrations suites passed (21 tests); app importRules passed.
