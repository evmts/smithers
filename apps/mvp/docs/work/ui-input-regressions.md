---
title: UI composition, dispatch and conditional form regressions
status: done
area: ui
owner: codex-mini-068767
updated: 2026-10-21
links: [../../../../packages/smithers/ui/docs/guides/complete-slash-commands.md]
---

Fix the three confirmed findings in `@smthrs/ui`: IME confirmation must keep
the ref picker open, synchronous dispatch failures must not dispatch twice,
and `FormHints.requires` must mark derived fields required. Use the catalog's
Render UI entry (`@smthrs/ui`), with regression tests in that package.

Fixed all three findings with regressions. Conditional requirements take
precedence over a field hint that relaxes schema requiredness. Dispatch
exceptions propagate to the caller without a fallback dispatch.

Validation (Node 26.5.0, Bun 1.4.2; frozen offline install):

- `bun test tests/ref-picker.test.tsx tests/run-command.test.ts tests/flow-form.test.ts`:
  unchanged source: 24 passed, 8 failed for the reported behaviors; fixed
  source: 32 passed, 0 failed.
- `pnpm --filter @smthrs/ui test`: 2,569 passed, 0 failed.
- `pnpm --filter @smthrs/ui check`: passed.
- `pnpm exec smithers-build test '//packages/smithers/ui:importRules'`:
  `ok: true`, 1 ran, 0 failed.
- E2E (Playwright): not run (mini clone).
