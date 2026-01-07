# Review: ab68abf

**Commit:** ab68abf691bf6d7d55fb7999190ac3f69fafc767
**Message:** docs: Complete TUI Phase 1 research documentation
**Date:** 2026-01-07 17:44:49 UTC

## Feedback

- docs/tui-research.md: The “Live Streaming Output (Hybrid Approach)” example recreates the interval on every update because the effect depends on `lines`, which will leak timers and accelerate updates; set the interval once (`[]`) and use a ref or functional `setLines` to update without re-subscribing.
- docs/tui-research.md: The same example uses both React state and imperative `TextRenderable` updates for the same data, causing unnecessary re-renders; either drop the state entirely and drive the renderable imperatively, or keep state and remove the imperative updates so it’s a single source of truth.
