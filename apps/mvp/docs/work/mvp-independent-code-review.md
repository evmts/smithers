---
title: Independent MVP code review
status: done
area: app
owner: Codex independent review 2026-10-21
updated: 2026-10-21
links: [../features/repo.md, ../state.md, ../../../../docs/libraries.md]
---

Reviewed the committed MVP against its current rulings, using `apps/app` only to understand the old runtime and recovery model. This pass was isolated from active review and repair owners.

Two defects were reproduced on the committed code and fixed: the 256 KiB generated manifest limit measured UTF-16 characters instead of UTF-8 bytes, and header marker text in ordinary code or prose incorrectly marked a file generated. Astra review found CRLF/trailing-space and ambiguous-prefix cases; those were fixed and covered. Fable's final review found no actionable issue. The pure detection code needs no new library; the existing `@smthrs/effect-tanstack-db` catalog entry remains the repository-view state boundary.

Validation: 38 focused tests pass across manifest detection, generated links and repository rendering; `detect.ts` has 100% statements, branches, functions and lines. The full app typecheck reports four errors outside this change, in pull-request and run files being worked by other owners. No changed file appears in those diagnostics.
