# Human: onApprove prop mismatch

## Status
Closed

## Description
Docs show onApprove prop; impl uses onFinished

## Resolution
Issue was stale - docs and implementation are already aligned.
- Docs (error-handling.mdx line 100) use `onApprove` callback
- Implementation (Human.tsx line 27) defines `onApprove?: () => void`
- Also supports `onReject?: () => void` for rejection handling
- Tests verify both callbacks work correctly

## Files
- docs/guides/error-handling.mdx
- src/components/Human.tsx
- src/components/Human.test.tsx

## Tasks
- [x] Align docs and implementation
