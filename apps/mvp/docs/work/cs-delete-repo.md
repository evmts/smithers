---
title: Code Storage repository deletion SDK
status: blocked
area: sdk
owner: Codex
updated: 2026-10-23
links: [../../../../packages/effect-code-storage/docs/README.md]
---

Add `CodeStorage.Client.deleteRepo` using the library catalog's
`@smthrs/effect-code-storage` entry (SDK-1). No new dependency.
Code Storage's [OpenAPI](https://code.storage/docs/openapi.json), read 2026-10-23,
declares `DELETE /api/repos/{repo_name}` with repository-scoped `repo:write`.
Return `void` when accepted; preserve missing and already-deleted responses as
typed errors. Production cleanup belongs to the deployer after landing.

Validation: the new suite first failed 13 tests because `deleteRepo` was absent.
The package now passes 140 tests (one live Code Storage test skipped), with
100% statements, branches, functions and lines. Typecheck, lint, docs sync,
docs check (51 published tarballs) and target-index generation pass.
The localhost success test verifies the JWT signature, exact scope, path,
deletion and telemetry; unhappy paths use an injected faulty HTTP layer.
Lint also required the existing `isReadLimit` helper's missing JSDoc tags.
Astra review found no issues. Fable review could not run: the default runner
was signed out and the account runner had no ready accounts. No production
Code Storage request or deployment was made.

Lander rework: rebased onto `main@origin` (`2fb8d4c1`). Complete MVP's scripted
Code Storage client with deletion, call recording and one-shot fault injection.
Two regression tests failed before the method existed and pass after it was
added, covering void success, isolation, missing repositories and failure
recovery. MVP's four typechecks and the package's check, lint and 140 tests pass;
the package retains 100% coverage on all four metrics.
The first full MVP run had nine failures in unchanged tests (timeouts, waiting
assertions and a local Electric 503); all passed in a single-worker rerun
(10 selected tests passed). The full four-worker coverage rerun finished with
100% statements, branches, functions and lines, but nine tests in eight
unchanged files failed (3,865 passed, two expected failures, ten skipped).
The full app gate remains blocked; no check or coverage threshold was
weakened. Host load reached 37 during the rerun.
Fresh Astra review could not start (reviewer thread-store error); no Fable
runner is installed in this session. No production request or push was made.
