# Cleanup Errors Only Warned in Worktree

## File

- [src/components/Worktree.tsx](file:///Users/williamcory/smithers/src/components/Worktree.tsx#L87-L89)

## Issue Description

Worktree cleanup failures are only logged as warnings:

```typescript
} catch (err) {
  console.warn('[Worktree] Could not remove worktree:', err)
}
```

While this may be intentional (cleanup is best-effort), failed worktree cleanup can:
- Leave orphaned worktrees consuming disk space
- Cause branch conflicts on subsequent runs
- Leave locked resources

## Suggested Fix

Consider tracking cleanup failures in database or exposing via callback:

```typescript
} catch (err) {
  const errorMsg = err instanceof Error ? err.message : String(err)
  console.warn('[Worktree] Could not remove worktree:', errorMsg)
  
  // Option: Track for later cleanup
  smithers.db.state.set(`worktree-cleanup-failed:${state.path}`, {
    path: state.path,
    branch: props.branch,
    error: errorMsg,
    timestamp: Date.now(),
  })
}
```

Or add an `onCleanupError` callback:

```typescript
export interface WorktreeProps {
  // ...
  onCleanupError?: (error: Error) => void
}
```
