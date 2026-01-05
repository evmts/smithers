# Review: edcd1f4

**Commit:** edcd1f46cf989b2f484e0b2e15aee9d1d717a1fd
**Message:** feat: implement React reconciler and Ralph Wiggum loop
**Date:** 2026-01-05 21:34:52 UTC

## Feedback

- Duplicate rendering per frame: `executePlan` calls `root.render(element)` and then `renderPlan(element)` which creates a new reconciler root and renders again, so the logged XML can diverge from the executed tree and you pay double render cost/side effects. Consider serializing the existing `tree` from `root.render` or pass it into `renderPlan` so it doesn’t re-render. File: `src/core/execute.ts`, `src/core/render.ts`.
- Mutating props on nodes: `executePlan` overwrites `node.props.onFinished`, which breaks props immutability and will wrap the callback again on subsequent frames (leading to duplicate calls / repeated state changes). Use a local wrapper without mutating props or store a wrapped callback on a separate field and restore it. File: `src/core/execute.ts`.
- Props comparison via `JSON.stringify` is unsafe: functions get dropped and circular structures throw, so legitimate prop changes (e.g., new callbacks) won’t trigger updates. Use a shallow key/`!==` compare or always return an update payload. File: `src/reconciler/host-config.ts`.
