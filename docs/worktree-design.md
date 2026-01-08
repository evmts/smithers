---
title: Worktree Component
description: Git worktree isolation for parallel agent execution
---

# Worktree Component Design

The `<Worktree>` component enables parallel agents to work in isolated git worktrees, preventing filesystem conflicts and enabling true concurrent development workflows.

## Use Case

When multiple agents need to work on different features simultaneously, they can interfere with each other by modifying the same files. Git worktrees provide isolated working directories linked to the same repository, allowing each agent to work in its own filesystem namespace.

**Example scenario:**
```tsx
<Subagent parallel>
  <Worktree path="./worktrees/feature-a" branch="feature-a">
    <Claude>Implement authentication system</Claude>
  </Worktree>

  <Worktree path="./worktrees/feature-b" branch="feature-b">
    <Claude>Add dark mode support</Claude>
  </Worktree>
</Subagent>
```

Each agent works in its own worktree, can commit to its own branch, and won't conflict with the other agent's file modifications.

## Component API

```tsx
interface WorktreeProps {
  /** Path where the worktree will be created (relative or absolute) */
  path: string

  /**
   * Optional branch name. If the branch exists, checks it out.
   * If it doesn't exist, creates a new branch from the base ref.
   * If omitted, creates a detached HEAD worktree.
   */
  branch?: string

  /** Whether to clean up the worktree after execution (default: false) */
  cleanup?: boolean

  /** Base ref to branch from when creating a new branch (default: 'HEAD') */
  base?: string

  /** React children (Claude, ClaudeApi, or other components) */
  children: React.ReactNode
}

<Worktree
  path="./worktrees/my-feature"
  branch="my-feature"
  cleanup={true}
  base="main"
>
  <Claude>Implement the feature</Claude>
</Worktree>
```

## Git Worktree Lifecycle

### 1. Creation (Before Execution)

When the Worktree component is executed:

1. **Check if already exists**: If worktree at path already exists, skip creation (idempotent)
2. **Validate git repository**: Ensure we're in a git repository
3. **Create worktree**:
   ```bash
   # With branch (branch already exists)
   git worktree add -- <path> <branch>

   # With branch (create new branch)
   git worktree add -b <branch> -- <path> [<base>]

   # Without branch (detached HEAD at base ref)
   git worktree add -- <path> [<commit-ish>]
   ```
4. **Set execution context**: Store worktree path in React Context for child components

### 2. Execution

- All child `<Claude>` and `<ClaudeApi>` components receive the worktree path as their `cwd`
- Tools (Bash, Read, Edit, etc.) operate within the worktree directory
- Agents can commit changes to the worktree's branch

### 3. Cleanup (After Execution)

If `cleanup={true}`:
1. **Remove worktree**:
   ```bash
   git worktree remove <path>
   ```
2. **Handle uncommitted changes**:
   - Default: Fail with error if worktree has uncommitted changes
   - Option: Force removal with `--force` flag (loses changes)

## React Context Pattern

The Worktree component uses React Context to pass the `cwd` to all descendant components:

```typescript
interface WorktreeContext {
  cwd: string | null  // null = use process.cwd()
}

const WorktreeContext = React.createContext<WorktreeContext>({ cwd: null })

// In Claude executor
function executeWithClaude(node: SmithersNode, config: ExecutionConfig) {
  const context = useContext(WorktreeContext)
  const cwd = context.cwd ?? process.cwd()

  // Pass cwd to Agent SDK
  const agent = new Agent({
    cwd,
    // ... other config
  })
}
```

## Error Handling

### Worktree Creation Errors

**Not in git repository:**
```
Error: Cannot create worktree - not in a git repository
  at Worktree component (/path/to/agent.tsx:10)
```

**Path already exists (non-worktree):**
```
Error: Path './worktrees/feature-a' already exists and is not a git worktree
  at Worktree component (/path/to/agent.tsx:10)

Suggestion: Use a different path or remove the existing directory
```

**Branch already exists:**
If the branch already exists, the worktree will check out the existing branch (no error). To create a new branch instead, use a different branch name.

### Worktree Cleanup Errors

**Uncommitted changes:**
```
Error: Cannot remove worktree './worktrees/feature-a' - uncommitted changes present
  at Worktree component (/path/to/agent.tsx:10)

Suggestion: Either commit the changes, or set cleanup={false} to preserve the worktree
```

## Integration with Ralph Wiggum Loop

The Worktree component integrates seamlessly with the Ralph loop:

1. **Render Phase**: Worktree component renders to XML, contentHash includes path/branch
2. **Execution Phase**:
   - Before executing child nodes, create worktree (if needed)
   - Set WorktreeContext with the worktree path
   - Execute children (Claude/ClaudeApi) with worktree as cwd
3. **Cleanup Phase**: After child execution completes, optionally remove worktree
4. **Re-render**: If state changes, Ralph loop re-renders. Worktree creation is idempotent (won't recreate if already exists)

## Performance Considerations

- **Worktree creation is fast** (~50-100ms) but not instant
- **Parallel worktrees** can be created concurrently using `<Subagent parallel>`
- **Disk space**: Each worktree is a full working directory (not a copy of files, but still uses disk space)
- **Cleanup is important**: Without cleanup, worktrees accumulate and use disk space

## Best Practices

### When to Use Worktrees

✅ **Good use cases:**
- Parallel agents working on different features
- Testing different approaches to the same problem
- PR review agents that need isolated environments

❌ **Don't use worktrees for:**
- Sequential agents (use regular execution)
- Single-agent workflows (unnecessary overhead)
- Agents that only read files (no risk of conflicts)

### Branch Naming

Use descriptive branch names that indicate the agent's purpose:
```tsx
<Worktree path="./worktrees/auth" branch="agent/auth-implementation">
  <Claude>Implement authentication</Claude>
</Worktree>
```

### Cleanup Strategy

**For ephemeral agents** (one-time tasks):
```tsx
<Worktree path="./worktrees/experiment" cleanup={true}>
  <Claude>Try this experimental approach</Claude>
</Worktree>
```

**For persistent agents** (review, iterate):
```tsx
<Worktree path="./worktrees/feature" cleanup={false} branch="feature-branch">
  <Claude>Implement feature (can run multiple times)</Claude>
</Worktree>
```

## Example: Parallel Feature Development

```tsx
import { create } from 'zustand'

const useStore = create((set, get) => ({
  features: ['auth', 'dark-mode', 'notifications'],
  completedFeatures: [],
  markComplete: (feature) =>
    set({ completedFeatures: [...get().completedFeatures, feature] }),
}))

export default function ParallelDevelopment() {
  const features = useStore((s) => s.features)
  const completedFeatures = useStore((s) => s.completedFeatures)
  const markComplete = useStore((s) => s.markComplete)

  // Stop when all features complete
  if (completedFeatures.length === features.length) {
    return <Stop reason="All features implemented" />
  }

  return (
    <Subagent parallel>
      {features
        .filter(f => !completedFeatures.includes(f))
        .map(feature => (
          <Worktree
            key={feature}
            path={`./worktrees/${feature}`}
            branch={`feature/${feature}`}
            cleanup={false}
          >
            <Claude onFinished={() => markComplete(feature)}>
              Implement {feature} feature. When done, commit your changes
              to the current branch.
            </Claude>
          </Worktree>
        ))
      }
    </Subagent>
  )
}
```

## Implementation Notes

### Smithers Node Type

The Worktree component will have type `'worktree'` in the SmithersNode tree:

```typescript
{
  type: 'worktree',
  props: {
    path: './worktrees/feature-a',
    branch: 'feature-a',
    cleanup: false,
    base: 'main'
  },
  children: [/* Claude nodes */],
  _execution: {
    status: 'complete',
    result: { worktreePath: '/abs/path/to/worktrees/feature-a' }
  }
}
```

### Execution Result

The Worktree execution returns metadata about the created worktree:

```typescript
interface WorktreeExecutionResult {
  worktreePath: string      // Absolute path to worktree
  branch: string | null     // Branch name or null if detached
  created: boolean          // true if worktree was created, false if already existed
  cleanedUp: boolean        // true if worktree was removed after execution
}
```

### Context Provider Implementation

The Worktree component will use React Context to pass `cwd` to descendants:

```tsx
export function Worktree({ path, branch, cleanup = false, base = 'HEAD', children }: WorktreeProps) {
  // This is just the React component definition
  // The actual worktree creation happens in the executor
  const absolutePath = resolvePath(path)

  return (
    <WorktreeContext.Provider value={{ cwd: absolutePath }}>
      {children}
    </WorktreeContext.Provider>
  )
}
```

The executor (`src/core/execute.ts`) will handle the actual git operations when it encounters a `worktree` node.

## Testing Strategy

See `evals/worktree.test.ts` for comprehensive test coverage:

1. **Creation tests**: Verify worktrees are created with correct branch/path
2. **Isolation tests**: Verify agents in different worktrees don't interfere
3. **Cleanup tests**: Verify cleanup behavior with/without uncommitted changes
4. **Error tests**: Verify proper error messages for invalid scenarios
5. **Context tests**: Verify child components receive correct cwd
6. **Parallel tests**: Verify multiple worktrees can be created/used simultaneously
