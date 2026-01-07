---
title: Worktree Design
description: Design notes for Worktree component behavior and lifecycle
---

# Worktree Component Design

## Overview

The `<Worktree>` component enables parallel agent isolation by running agents in git worktrees. This allows multiple agents to work on different features simultaneously without filesystem conflicts.

## Use Case

**Primary Use Case**: Parallel feature development by multiple agents

```tsx
import { Worktree, Claude } from 'smithers'

function ParallelFeatures() {
  return (
    <>
      <Worktree path="./worktrees/feature-a" branch="feature-a">
        <Claude>Implement authentication feature</Claude>
      </Worktree>

      <Worktree path="./worktrees/feature-b" branch="feature-b">
        <Claude>Add user profile page</Claude>
      </Worktree>
    </>
  )
}
```

Each agent works in an isolated filesystem, preventing conflicts when multiple agents modify the same files.

## Component API

```typescript
interface WorktreeProps {
  /** Path where the worktree will be created */
  path: string

  /** Optional branch name. If provided, creates a new branch */
  branch?: string

  /** Whether to clean up worktree after execution (default: true) */
  cleanup?: boolean

  /** Optional base branch to create new branch from (default: current branch) */
  baseBranch?: string

  /** React children (typically Claude/ClaudeApi components) */
  children: React.ReactNode
}
```

## Git Worktree Lifecycle

### 1. Creation

**New Branch**:
```bash
git worktree add <path> -b <branch>
```

**Existing Branch**:
```bash
git worktree add <path> <branch>
```

**No Branch (detached HEAD)**:
```bash
git worktree add <path>
```

### 2. Execution

- All child `<Claude>` and `<ClaudeApi>` components execute with `cwd` set to worktree path
- Agent's file operations (Read, Edit, Write, Bash) operate within worktree filesystem
- Worktree path passed through React context to child components

### 3. Cleanup

**On Success** (cleanup=true):
```bash
git worktree remove <path>
```

**On Error** (cleanup=true):
```bash
git worktree remove <path> --force
```

**Preserve Worktree** (cleanup=false):
- Worktree remains on disk for manual inspection/merging

## Implementation Details

### Context Propagation

Worktree component uses React Context to propagate working directory to child components:

```typescript
interface WorktreeContext {
  cwd: string
  worktreePath: string
  branch?: string
}

const WorktreeContext = React.createContext<WorktreeContext | null>(null)
```

Child `<Claude>` components check context and pass `cwd` to Claude executor:

```typescript
const worktreeCtx = React.useContext(WorktreeContext)
const executorOptions = {
  ...otherOptions,
  cwd: worktreeCtx?.cwd ?? process.cwd()
}
```

### Error Handling

**Worktree Already Exists**:
- Check if path exists and is a git worktree
- If worktree exists with different branch, error
- If worktree exists with same branch, reuse it

**Not in Git Repository**:
- Throw error: "Worktree component requires a git repository"
- Check: `git rev-parse --git-dir` succeeds

**Branch Conflicts**:
- If branch already checked out in another worktree, error
- Git prevents same branch in multiple worktrees

**Cleanup Failures**:
- If worktree has uncommitted changes and cleanup=true, warn and force remove
- If worktree locked, attempt to unlock before removal

### Integration with Ralph Loop

Worktree creation/cleanup happens at specific points in execution:

1. **Before First Frame**: Create worktree when Worktree node first encountered
2. **During Execution**: All child nodes execute with worktree cwd
3. **After Completion**: Cleanup worktree if cleanup=true

Worktree lifecycle tracked in `_execution` metadata:

```typescript
interface WorktreeExecutionState extends ExecutionState {
  worktreeCreated: boolean
  worktreePath: string
  branch?: string
}
```

## Execution Flow

```
┌─────────────────────────────────────┐
│ executePlan() starts                │
└───────────┬─────────────────────────┘
            │
            v
┌─────────────────────────────────────┐
│ Walk tree, find Worktree nodes      │
└───────────┬─────────────────────────┘
            │
            v
┌─────────────────────────────────────┐
│ Execute Worktree node:              │
│ 1. Run git worktree add             │
│ 2. Store path in _execution         │
│ 3. Set WorktreeContext              │
└───────────┬─────────────────────────┘
            │
            v
┌─────────────────────────────────────┐
│ Execute child Claude nodes with cwd │
└───────────┬─────────────────────────┘
            │
            v
┌─────────────────────────────────────┐
│ Children complete                   │
└───────────┬─────────────────────────┘
            │
            v
┌─────────────────────────────────────┐
│ Cleanup: git worktree remove        │
└─────────────────────────────────────┘
```

## Parallel Execution

When used with `<Subagent parallel={true}>`, multiple worktrees can be active simultaneously:

```tsx
<Subagent parallel={true}>
  <Worktree path="./worktrees/feature-a" branch="feature-a">
    <Claude>Implement feature A</Claude>
  </Worktree>

  <Worktree path="./worktrees/feature-b" branch="feature-b">
    <Claude>Implement feature B</Claude>
  </Worktree>
</Subagent>
```

Each worktree has isolated filesystem:
- No conflicts when agents modify same files
- Each agent can commit independently
- Branches can be merged back to main after completion

## Testing Strategy

### Unit Tests

1. **Worktree Creation**:
   - Creates worktree at specified path
   - Creates new branch if specified
   - Uses existing branch if it exists
   - Errors if not in git repo
   - Errors if path already exists (non-worktree)

2. **Worktree Execution**:
   - Child Claude components run in worktree cwd
   - Multiple agents in same worktree work correctly
   - Worktree context passed through React context

3. **Worktree Cleanup**:
   - cleanup=true removes worktree on completion
   - cleanup=false preserves worktree
   - Cleanup handles uncommitted changes
   - Cleanup errors don't crash execution

4. **Parallel Worktrees**:
   - Multiple Worktree components run in parallel
   - Each worktree has isolated filesystem
   - No conflicts between parallel worktree agents

### Integration Tests

1. **Full Feature Workflow**:
   - Create worktree → implement feature → commit → cleanup
   - Verify branch created and committed correctly

2. **Error Recovery**:
   - Agent fails mid-execution, worktree still cleaned up
   - Worktree preserved when cleanup=false

## Security Considerations

### Path Safety

- Validate worktree path is within project directory
- Prevent path traversal attacks (../../etc/passwd)
- Check path doesn't conflict with .git directory

### Git Safety

- Never run destructive git commands (reset --hard, etc.) unless explicitly requested
- Preserve uncommitted changes when possible
- Warn before force-removing worktrees with changes

## Performance Considerations

### Worktree Creation Overhead

- Creating worktree takes ~100-500ms depending on repo size
- Consider reusing worktrees across multiple runs
- Cleanup async where possible (don't block execution)

### Disk Space

- Each worktree is a full working tree (not a clone)
- Large repos with many worktrees can consume significant disk space
- Consider cleanup strategies for long-running agents

## Future Enhancements

### Worktree Pooling

Create pool of reusable worktrees to avoid creation overhead:

```tsx
<WorktreePool size={5} baseDir="./worktrees">
  <Subagent parallel={true}>
    {tasks.map(task => (
      <Claude key={task.id}>{task.prompt}</Claude>
    ))}
  </Subagent>
</WorktreePool>
```

### Automatic Merging

Auto-merge successful feature branches:

```tsx
<Worktree path="./worktrees/feature-a" branch="feature-a" autoMerge={true}>
  <Claude>Implement feature A</Claude>
</Worktree>
```

### Worktree Monitoring

Real-time status of all active worktrees:

```tsx
<WorktreeMonitor>
  {worktrees => (
    <div>
      {worktrees.map(wt => (
        <div key={wt.path}>
          {wt.branch}: {wt.status}
        </div>
      ))}
    </div>
  )}
</WorktreeMonitor>
```
