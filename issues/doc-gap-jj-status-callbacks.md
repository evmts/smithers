# JJ/Status: callback mismatch between docs and implementation

## Status
Closed

## Description
Docs show onStatus callback; impl uses onDirty/onClean

## Resolution
Issue was stale - docs and implementation are already aligned.
- Docs (jj.mdx lines 77-79) show `onDirty`/`onClean` callbacks
- Implementation (Status.tsx lines 11-12) uses `onDirty`/`onClean` callbacks
- Tests verify both callbacks work correctly

## Files
- docs/components/jj.mdx
- src/components/JJ/Status.tsx
- src/components/JJ/Status.test.tsx

## Tasks
- [x] Align docs and implementation
