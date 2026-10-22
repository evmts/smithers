---
title: Artifact lease and inventory safety
status: done
area: sdk
owner: codex-mini-artifacts-896666
updated: 2026-10-21
links: []
---

Fixed all eight supplied artifact storage findings, using the library catalog's
`@smthrs/artifacts` entry and existing Effect filesystem services.

- Missing or foreign backup markers interrupt the copy and fail its caller.
- Failed heartbeats stop the copy; an independent deadline follows the last
  marker refresh, including acquisition and gate cleanup time.
- Fanout listing refusals fail inventory; disappeared fanouts remain harmless.
- Release and reclamation share an exclusive claim for the same generation.
  Neither can replace or delete a new owner's lock inside the other's check.
- File lease ownership loss interrupts the protected effect and fails its caller.
- A vanished verified blob reaches the atomic rewrite fallback, while present
  replacements and symlinks still fail the path guard.
- Scratch cleanup excludes active locks and mutation claims. It still reclaims
  old payload temps and stale-owner tombstones.

Mutation claims fail closed and are never automatically reaped. A stalled
claimant could still resume its mutation; host recovery must first stop all
possible holders. Lock generations without abandoned claims retain stale-owner
recovery. The coordination guide documents this availability tradeoff.

Validation on Node 26.5.0 after `pnpm install --frozen-lockfile --offline`:

- Regression A/B: the same 13 selected cases failed against original production
  source at `@-`, then all 13 passed against the fixed source (15 other cases
  excluded by the filter). The original files were restored temporarily only
  for this comparison; fixed files were restored before all final checks.
- `pnpm --dir packages/smithers/flows/artifacts exec vitest run`: 415 passed,
  16 files; 100% statements, branches, functions and lines.
- `pnpm --dir packages/smithers/flows/artifacts exec tsc -p tsconfig.test.json --noEmit`: passed.
- `pnpm --dir packages/smithers/flows/artifacts run lint`: passed.
- `pnpm exec smithers-build test '//packages/smithers/flows/artifacts:importRules'`: passed.
  Added the missing standard SDK rules targets and regenerated the target index.
- Codex Astra review: corrected the deadline's gate-cleanup timing gap, added
  both regressions, and received a final review with no material findings.
- E2e: not run (mini clone).
