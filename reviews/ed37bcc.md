# Review: ed37bcc

**Commit:** 19fe6f15301fa7c98c67a1bb0e6fb03684b4d7aa
**Message:** fix: implement async rendering with React 19 reconciler
**Date:** 2026-01-05 23:38:08 UTC

## Feedback

- `src/core/execute.ts:103-128` mutates `node.props.onFinished` in-place and never restores it; if props are unchanged in subsequent renders, wrappers stack each render and can grow unbounded. Track callback state without mutating props or restore the original after `executeNode`.
- `src/reconciler/index.ts:100-106` and `src/core/execute.ts:167-175` use `setImmediate`, which is undefined in browsers/Bun and will throw. Add a fallback (e.g., `queueMicrotask`/`Promise.resolve().then` plus `setTimeout(0)`).
- `debug-state.tsx:29-30` calls `root.render` without `await`; `render` now returns `Promise<PluNode>`, so `serialize(tree1)` receives a Promise and will fail.
