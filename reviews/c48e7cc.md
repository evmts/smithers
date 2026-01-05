# Review: c48e7cc

**Commit:** c3e9d13a2b9bcc2e5889187f6f42d100effca131
**Message:** feat: implement React reconciler and Ralph Wiggum loop
**Date:** 2026-01-05 23:38:24 UTC

## Feedback

- Double render + mismatched plan: `executePlan` renders via `root.render(element)` then calls `renderPlan(element)` which creates a new root and re-renders, so the XML plan can diverge from the executed tree and you pay double side effects per frame. Suggest serializing the existing `tree` from `root.render` (or pass it into `renderPlan`) to avoid a second render. File: `src/core/execute.ts`, `src/core/render.ts`.
- Props mutation & callback wrapping: `executePlan` overwrites `node.props.onFinished`, which breaks props immutability and will wrap repeatedly across frames (leading to duplicate callbacks). Keep a wrapper map keyed by node or store a separate field, and restore the original callback after execution. File: `src/core/execute.ts`.
- Unsafe props diffing: `prepareUpdate` uses `JSON.stringify` to compare props, which drops functions and throws on circular structures, so updates can be skipped or crash. Use a shallow key compare or always return an update payload. File: `src/reconciler/host-config.ts`.
