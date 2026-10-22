---
title: "UI safety and interaction regressions (468582)"
status: done
area: sdk
owner: Codex mini UI bugfix agent
updated: 2026-10-21
links: [../../../../packages/smithers/ui/README.md]
---

Reproduce the five supplied UI findings with package unit tests, fix only reproduced bugs, and commit once without pushing. Uses the library catalog's `@smthrs/ui` entry for shared UI and collaborator carets. No new library or feature.


Fixed breadcrumb URL filtering, explicit slotted button types, IME arrow handling, and quoted duplicates masking unquoted flags. Breadcrumbs reuse `safeHref`; Slot retains child prop precedence; composition exits before arrow handling. Argument validation compares exposed flag/binding tokens with the builder's output without the field, preserving independent flags. Regenerated the committed presentation bundle through `node scripts/build-views.mjs` because it includes Button.

The resize finding was not reproduced and its code is unchanged: happy-dom has no layout engine and its ResizeObserver observe/unobserve/disconnect methods are unimplemented. Reproducing real resize delivery would require the browser tests excluded from this mini-clone task; no replacement observer or fabricated measurements were introduced.

Validation in `packages/smithers/ui`, with Node 26.5.0 and `~/.bun/bin` on PATH:

- `pnpm install --frozen-lockfile --offline` stopped on missing offline metadata for `@anthropic-ai/sdk`; the authorized retry `pnpm install --frozen-lockfile` succeeded.
- Before production edits: `bun test tests/breadcrumbs.test.tsx tests/button-as-child.test.tsx tests/command-palette.test.tsx tests/flow-form.test.ts`: 43 passed, 12 failed. Failures covered unsafe anchors and untrimmed URLs, discarded button/reset types and actual accidental submission, intercepted composing arrows, and accepted unquoted flag-bearing values beside quoted duplicates.
- After production edits, the identical command: 55 passed, 0 failed.
- `pnpm test`: initially caught the stale generated bundle; after regenerating it, 2,575 passed, 0 failed across 179 files.
- `pnpm check`: passed.
- E2e: not run (mini clone).

No new dependency, flow, background action, or logging of user values was added. This work stays on its own mini bookmark without pushing or moving main.
