# Test Coverage Gap: Smithers Component

## Source Files Missing Tests

| File | Lines | Complexity |
|------|-------|------------|
| `src/components/Smithers.tsx` | 312 | Very High |
| `src/components/Subagent.tsx` | 32 | Low |
| `src/components/Task.tsx` | 29 | Low |

## What Should Be Tested

### Smithers.tsx (CRITICAL)
- Props parsing and defaults
- Phase/step context integration
- DB agent registration (`db.agents.start`)
- Status transitions (pending → planning → executing → complete/error)
- `executeSmithers` invocation with correct options
- Error handling and `db.agents.fail` call
- Report generation on completion
- Callback invocations (`onFinished`, `onError`, `onProgress`, `onScriptGenerated`)
- XML element rendering with correct attributes
- `useMountedState` prevents setState after unmount
- Task lifecycle (`db.tasks.start`, `db.tasks.complete`)
- Worktree context integration

### Subagent.tsx
- Props passed to custom element
- `name` and `parallel` attribute rendering
- Children rendering

### Task.tsx
- `done` prop rendering
- Children content

## Priority

**HIGH** - Smithers.tsx is a core orchestration component with complex async flows and state management. Bugs here break subagent execution.

## Test Approach

```typescript
// Mock dependencies
const mockDb = createMockDb()
const mockWorktree = { cwd: '/test' }

// Render with providers
const { getOutput } = render(
  <SmithersProvider db={mockDb}>
    <WorktreeProvider worktree={mockWorktree}>
      <Smithers onFinished={onFinished}>
        Test task description
      </Smithers>
    </WorktreeProvider>
  </SmithersProvider>
)

// Verify agent started
expect(mockDb.agents.start).toHaveBeenCalled()
```

## Edge Cases Not Covered

- Multiple re-renders during execution
- Unmount during async operation
- `executeSmithers` timeout
- Invalid model name handling
- Missing cwd/worktree context
