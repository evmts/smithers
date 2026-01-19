# PR #6 Review: Worktree Component

**PR:** issue/worktree-component
**Status:** Approve with comments

---

## Summary

Implements `<Worktree>` component for isolated git worktree execution:
- `Worktree.tsx` - Main component with lifecycle management
- `WorktreeProvider.tsx` - Context for cwd propagation
- `PhaseContext.tsx` / `StepContext.tsx` - Execution gating
- Git utilities in `src/utils/vcs/git.ts`
- Integration with Claude.tsx and Smithers.tsx

## Positive

1. **Follows issue spec** - All acceptance criteria addressed
2. **Clean context propagation** - `useWorktree()` hook provides cwd to children
3. **Proper cleanup** - `createdWorktreeRef` tracks ownership for safe cleanup
4. **Phase/Step gating** - Execution properly gated by phase and step activity
5. **Tests included** - Interface tests in `Worktree.test.tsx`

## Issues

### 1. State Management Via SQLite
Uses `useQueryValue` + `db.state.set` for component state:
```typescript
const { data: storedState } = useQueryValue<string>(...)
setState = (nextState) => smithers.db.state.set(stateKey, nextState, 'worktree')
```
This is correct per CLAUDE.md "NO useState" rule but adds DB writes for transient UI state. Consider if this worktree state truly needs persistence.

### 2. Phase Children Always Render
Changed Phase.tsx to always render children (gated by context):
```tsx
<PhaseContext.Provider value={{ isActive }}>
  {props.children}
</PhaseContext.Provider>
```
This changes XML output - inactive phases now show children. Verify this doesn't break existing workflows expecting children to be hidden.

### 3. Missing Git Utilities Export
`src/utils/vcs/index.ts` needs to export new worktree functions:
```typescript
export { addWorktree, removeWorktree, worktreeExists, branchExists } from './git.js'
```

### 4. Error State UX
Error state shows error message but no retry mechanism. Consider adding `onRetry` callback for better UX.

## Verdict

**APPROVE** - Well-implemented feature. Minor issues are non-blocking for merge.

---

## Action Items
- [x] Verify Phase children visibility change doesn't break existing tests - **RESOLVED**: Phase.tsx L146 only renders children when `isActive`
- [x] Export git utilities from vcs/index.ts - **RESOLVED**: All 4 functions exported at L32-35
- [ ] Consider retry mechanism for error state - **STILL OPEN**

## Status: PARTIALLY RESOLVED

**Verified 2025-01-18**

| Issue | Status |
|-------|--------|
| #1 State Management (SQLite) | ✅ As designed per CLAUDE.md |
| #2 Phase Children Always Render | ✅ Fixed - children only render when `isActive` |
| #3 Missing Git Utilities Export | ✅ Fixed - all 4 functions exported |
| #4 Error State UX (no retry) | ❌ Still missing (verified 2026-01-18) |

## Debugging Plan (Issue #4: Missing Retry Mechanism)

### Files to Investigate
- `src/components/Worktree.tsx` (L106-112) - error state rendering, no retry
- `src/components/SmithersProvider.tsx` - db.state access patterns

### Grep Patterns
```bash
# Find retry patterns in other components
grep -r "onRetry\|retry" src/components/
# Find error handling patterns
grep -r "status.*error" src/components/
```

### Proposed Fix
1. Add `onRetry?: () => void` prop to `WorktreeProps`
2. Add retry button/mechanism in error state JSX
3. Reset state to 'pending' and re-run mount logic on retry
4. Example:
```tsx
if (state.status === 'error') {
  return (
    <worktree branch={props.branch} status="error" error={state.error}>
      {state.error ?? 'Failed to set up worktree'}
      {props.onRetry && <retry onClick={props.onRetry} />}
    </worktree>
  )
}
```
