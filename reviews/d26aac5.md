# Review: d26aac5

**Commit:** d26aac5a422bda3ed2b7b9d178dfd871a3a126fd
**Message:** ✅ test(edge-cases): add comprehensive edge case test coverage
**Date:** 2026-01-06 01:37:45 UTC

## Feedback

- `evals/edge-cases.test.tsx:315` The “maxFrames prevents infinite loops” test doesn’t actually assert the limit (comment says 3, code uses 10, and it only checks `result` is defined). This will pass even if `executePlan` ignores `maxFrames`. Make it assert the error or `frames <= maxFrames` with a small limit.
- `docs/README.md:20` still references `phase-step.mdx` and `prompt-structure.mdx`, which were removed/renamed in this commit. Update the tree list to `phase.mdx`, `step.mdx`, and the new `persona/constraints/output-format` pages.
