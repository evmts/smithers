---
title: Register the missing effect-key fault
status: done
area: sdk
owner: Codex GPT-6.1 Sol (mini/fault-sweep)
updated: 2026-10-21
links:
  - packages/smithers/flows/flow/src/Fault.ts
  - packages/smithers/agent/test/Fault.sweep.test.ts
---

Register `EffectKeyUnavailable` as an invariant `bug` using the library catalog's
`@smthrs/flow` entry and its existing Fault registry. Prove the agent fault sweep
and the flow suite pass, retaining a regression for the class and stable tag.

Added the error to the existing invariant-refusal registrations. The regression
asserts the stable tag as well as the class because unregistered errors also
default to `bug`. Published a patch changeset and updated the package reference
and generated site projections.

Validation (Node 26.5.0, frozen pnpm install):

- Before the fix, the flow regression failed with `tag: "unregistered"`; the
  agent sweep failed with exactly the missing `EffectKeyUnavailable` tag.
  Initial cold sweep runs hit the unchanged 30-second timeout; the transform
  cache allowed the sweep to finish without changing that timeout.
- `pnpm --filter @smthrs/agent exec vitest run test/Fault.sweep.test.ts --coverage.enabled=false --maxWorkers=1 --fsModuleCache`:
  10 tests passed. This selected-file check does not claim full agent coverage.
- `pnpm --filter @smthrs/flow exec vitest run --maxWorkers=2`: 69 files,
  913 tests passed; statements, branches, functions and lines each 100%.
- `pnpm --filter @smthrs/flow exec tsc -p tsconfig.test.json --noEmit`: passed.
- Focused dprint check passed. Astra review: no findings. Fable review was not
  run: no Fable executable or tool is available in this session.
- `pnpm docs:sync` regenerated the site projections, then failed at its durable
  flow host because the clone lacks the native `smithers-jj-export` helper.
  Full agent suite, production and end-to-end tests were not run for this
  registry-only fix. Nothing was pushed.
