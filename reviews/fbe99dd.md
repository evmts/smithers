# Review: fbe99dd

**Commit:** fbe99dde010b0a2516bd0532ab6d4d2c9526c400
**Message:** docs: Fix Node.js JSON import assertion version compatibility info
**Date:** 2026-01-08 02:55:42 UTC

## Feedback

The statement “`assert` is deprecated but still works” looks inaccurate; Node’s import attributes (`with`) are newer, but `assert` is not formally deprecated in Node 20.x/21.x docs. Consider rephrasing to “legacy/older syntax” and, if you want to mention deprecation, cite the exact Node version or doc reference.
