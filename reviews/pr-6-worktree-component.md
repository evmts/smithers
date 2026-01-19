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
- [ ] Verify Phase children visibility change doesn't break existing tests
- [ ] Export git utilities from vcs/index.ts
- [ ] Consider retry mechanism for error state
