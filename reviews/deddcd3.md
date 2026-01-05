# Review: deddcd3

**Commit:** deddcd3ef537fe9ae918e02dca0af3c99d2d7041
**Message:** fix: address CLI review feedback
**Date:** 2026-01-05 21:06:30 UTC

## Feedback

`src/cli/commands/run.ts`: `parseInt` accepts partial/float inputs (`"10abc"`, `"1.5"`), so invalid values can slip through despite the “positive integer” error message. Consider `const n = Number(options.maxFrames); if (!Number.isInteger(n) || n <= 0) ...` (same for `timeout`) or a strict regex check to ensure the whole string is numeric.
