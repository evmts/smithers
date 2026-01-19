# Missing Documentation: Parallel Component

## Issue
`src/components/Parallel.tsx` exists but there's no `docs/components/parallel.mdx`.

The component is referenced in:
- `docs/components/worktree.mdx` (line 354, 381, 469)
- `docs/components/command.mdx` (line 150, 479)

These link to `/components/parallel.mdx` which doesn't exist.

## Suggested Fix
Create `docs/components/parallel.mdx` documenting the Parallel component, or add it to mint.json navigation after creating.
