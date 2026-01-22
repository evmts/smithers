# JJ/Describe: props mismatch between docs and implementation

## Status
Closed

## Description
Docs show changeId/description props; impl uses useAgent/template

## Resolution
Updated docs to match implementation. The implementation uses:
- `id?: string` - optional operation ID for tracking
- `useAgent?: 'claude'` - use Claude to generate description from diff
- `template?: string` - template format (e.g., "conventional-commits")
- `children?: ReactNode` - optional child content

The old API (changeId/description) was never implemented. The actual implementation auto-generates descriptions from diffs with optional AI assistance, which is more useful.

Also updated JJ/Status docs to match its implementation (onDirty/onClean callbacks).

## Files
- docs/components/jj.mdx
- src/components/JJ/Describe.tsx
- src/components/JJ/Describe.test.tsx

## Tasks
- [x] Align docs and implementation
- [x] Add tests verifying deprecated props don't exist
