# 0084 — Safe branch failure diagnostics

2026-10-23. Implements the production defect brief's observability requirement.

`branch.track` retains a Forge failure's typed tag, code, HTTP status when
available, and call stage: `default_branch`, `create_ref` or `refs_read`.
`forge.createBranch` records the same diagnostics in its failure log and span.
Only these typed fields cross the error translation; raw errors, response text,
branch names, URLs and credentials never do. HTTP response codes stay unchanged.

Library catalog: `@smthrs/effect-code-storage` supplies git reads and branch writes.
The production cause still requires authenticated API reproduction; this change
makes that failure diagnosable without guessing a fix or widening permissions.
