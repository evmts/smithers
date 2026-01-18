# Broken Build Orchestration Pattern

**Status:** design-idea
**Priority:** P2
**Created:** 2026-01-18

## Problem

When multiple agents are working concurrently and one encounters a broken build/failing tests:
- All agents should detect the broken build state
- Only ONE agent should attempt to fix it (idempotent fix trigger)
- Other agents should wait (e.g., 5 minutes) for the fix to complete
- Prevents duplicate/conflicting fix attempts

## Use Case

Current scenario:
1. Agent A modifies code, commits trigger precommit hook failure
2. Agent B also tries to commit, encounters same failure
3. Both agents attempt to fix the same issue → wasted work/conflicts

Desired scenario:
1. Agent A encounters broken build, claims "fixer" role
2. Agent B encounters broken build, sees someone is fixing, waits 5 min
3. Agent A fixes issue, releases lock
4. Agent B retries commit successfully

## Design Considerations

### Coordination Mechanism
- Use SQLite DB table to track build state + fixer lock
- Table: `build_state` with columns:
  - `id` (singleton row)
  - `status` ('passing' | 'broken' | 'fixing')
  - `fixer_agent_id` (which agent claimed fix role)
  - `broken_since` (timestamp)
  - `last_check` (timestamp)

### Agent Behavior
```
on_precommit_failure():
  state = db.build_state.get()

  if state.status == 'passing':
    # First to detect breakage
    db.build_state.update({
      status: 'fixing',
      fixer_agent_id: my_id,
      broken_since: now()
    })
    attempt_fix()

  elif state.status == 'fixing':
    if state.fixer_agent_id == my_id:
      # I'm already fixing it
      attempt_fix()
    else:
      # Someone else is fixing
      wait(5 minutes)
      retry_commit()

  elif state.status == 'broken':
    # Broken but no one fixing (stale?)
    claim_fixer_role()
    attempt_fix()
```

### Hook Integration

Add to `useCommit` or similar:
```tsx
const commitWithBuildRetry = async (message: string) => {
  try {
    await git.commit(message)
  } catch (precommitError) {
    const buildState = await db.buildState.handleBrokenBuild()

    if (buildState.shouldFix) {
      // I'm the fixer
      await spawnFixAgent()
      await git.commit(message) // retry
    } else {
      // Wait for someone else to fix
      await sleep(5 * 60 * 1000)
      await git.commit(message) // retry
    }
  }
}
```

## Implementation Tasks

1. Create `build_state` table in SQLite schema
2. Implement `buildState` module with:
   - `handleBrokenBuild()` - claims fixer role or waits
   - `markFixed()` - releases lock when fix succeeds
   - `cleanup()` - handle stale locks (timeout after 15min)
3. Create `useCommitWithRetry` hook that wraps git operations
4. Add `/fix-build` skill that agents can invoke
5. Integration tests with multiple concurrent agents

## Benefits

- Eliminates duplicate fix work
- Clear coordination between concurrent agents
- Demonstrates Smithers' multi-agent orchestration capabilities
- Useful pattern for other shared resource conflicts

## Related Patterns

- Distributed lock with timeout
- Leader election
- Circuit breaker (build is "open" when broken)

## Example Smithers Usage

This showcases:
- SQLite for coordination state
- Hook-based reactive behavior
- Skill invocation from hooks
- Multi-agent cooperation
- Idempotent operations
