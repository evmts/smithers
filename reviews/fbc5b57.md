# Review: fbc5b57

**Commit:** fbc5b576f029b5ba646b55b328089684b68aa7b0
**Message:** 🐛 fix: prevent infinite prompting for Human nodes without callbacks
**Date:** 2026-01-06 00:34:06 UTC

## Feedback

In `src/core/execute.ts`, `findHumanNode` always returns the first Human node in the tree. With the new `approvedHumanNodes` skip logic, if that first node is approved but remains in the tree (no `onApprove`), you never scan for a later Human node in the same tree. That means subsequent Human nodes can be silently skipped and the loop can finish without prompting them. Consider changing the scan to return the first *unapproved* Human node (e.g., pass `approvedHumanNodes` into the walk) and compute `hasUnapprovedHuman` based on that.

Suggested test: a persistent Human node (no `onApprove`) followed by another Human node; verify the second still prompts after the first is approved.
