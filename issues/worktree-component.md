# Worktree Component for Isolated Agent Execution

<metadata>
  <priority>medium</priority>
  <category>feature</category>
  <estimated-effort>1-2 days</estimated-effort>
  <dependencies>
    - src/components/SmithersProvider.tsx
    - src/components/Claude.tsx
    - src/components/Smithers.tsx
    - src/components/agents/claude-cli/executor.ts
    - src/components/agents/types/agents.ts
    - src/utils/vcs/git.ts
    - src/utils/vcs/types.ts
  </dependencies>
</metadata>

---

## Executive Summary

Create a `<Worktree>` component that automatically provisions git worktrees and ensures all nested agent components (children, grandchildren, etc.) operate within that worktree's directory. This enables parallel execution on different branches and isolation between workflow phases.

---

<section name="problem-statement">

## Problem Statement

### Current State

Agents in Smithers currently operate in the process's current working directory. There's no built-in way to:

1. **Run agents in parallel on different branches** - All agents share the same working directory
2. **Isolate changes between workflow phases** - Changes from one phase affect subsequent phases
3. **Work on experimental changes safely** - No automatic sandboxing mechanism
4. **Clean up after failed experiments** - Manual intervention required

**Key Files:**
- `/Users/williamcory/smithers2/src/components/agents/claude-cli/executor.ts` - `cwd` option exists but isn't surfaced
- `/Users/williamcory/smithers2/src/components/Claude.tsx` - Doesn't accept or propagate `cwd`
- `/Users/williamcory/smithers2/src/utils/vcs/git.ts` - No worktree support

### Current Limitations

```tsx
// Today: Both agents operate in the same directory
<Phase name="Feature A">
  <Claude>Implement feature A</Claude>
</Phase>
<Phase name="Feature B">
  <Claude>Implement feature B</Claude>  {/* Sees Feature A's changes */}
</Phase>
```

```tsx
// Desired: Agents operate in isolated worktrees
<Worktree branch="feature-a">
  <Claude>Implement feature A</Claude>  {/* Isolated to feature-a worktree */}
</Worktree>
<Worktree branch="feature-b">
  <Claude>Implement feature B</Claude>  {/* Isolated to feature-b worktree */}
</Worktree>
```

</section>

---

<section name="proposed-solution">

## Proposed Solution: `<Worktree>` Component

### Component API

```tsx
interface WorktreeProps {
  /**
   * Branch name for the worktree.
   * If the branch doesn't exist, it will be created from `base`.
   */
  branch: string

  /**
   * Base ref to create the branch from (if branch doesn't exist).
   * @default 'HEAD'
   */
  base?: string

  /**
   * Explicit path for the worktree directory.
   * @default `.worktrees/${branch}`
   */
  path?: string

  /**
   * Whether to automatically remove the worktree on unmount.
   * @default false
   */
  cleanup?: boolean

  /**
   * Children components (agents, phases, etc.)
   */
  children: ReactNode

  /**
   * Callback when worktree is ready
   */
  onReady?: (worktreePath: string) => void

  /**
   * Callback on error
   */
  onError?: (error: Error) => void
}
```

### Usage Examples

**Basic Usage:**
```tsx
<Worktree branch="feature-auth">
  <Claude>Implement user authentication</Claude>
</Worktree>
```

**Parallel Execution on Different Branches:**
```tsx
<>
  <Worktree branch="feature-a" cleanup>
    <Phase name="Feature A">
      <Claude>Implement feature A</Claude>
    </Phase>
  </Worktree>

  <Worktree branch="feature-b" cleanup>
    <Phase name="Feature B">
      <Claude>Implement feature B</Claude>
    </Phase>
  </Worktree>
</>
```

**With Nested Smithers Subagent:**
```tsx
<Worktree branch="experiment" base="main">
  <Smithers plannerModel="opus">
    Plan and implement a complex feature
  </Smithers>
</Worktree>
```

**Explicit Path:**
```tsx
<Worktree branch="hotfix" path="/tmp/hotfix-worktree">
  <Claude>Fix the critical bug</Claude>
</Worktree>
```

### Context Propagation

Create a new `WorktreeContext` that provides the working directory override:

```tsx
// src/components/WorktreeProvider.tsx

interface WorktreeContextValue {
  /**
   * The working directory path for this worktree
   */
  cwd: string

  /**
   * Branch name
   */
  branch: string

  /**
   * Whether this is a worktree (vs main repo)
   */
  isWorktree: true
}

const WorktreeContext = createContext<WorktreeContextValue | null>(null)

export function useWorktree(): WorktreeContextValue | null {
  return useContext(WorktreeContext)
}
```

### How Children Receive the Override

Agents check for `WorktreeContext` and use its `cwd` if available:

```tsx
// In Claude.tsx (modified)

export function Claude(props: ClaudeProps): ReactNode {
  const { db, executionId, isStopRequested } = useSmithers()
  const worktree = useWorktree()  // NEW: Get worktree context

  // ... existing code ...

  const result = await executeClaudeCLI({
    prompt,
    cwd: props.cwd ?? worktree?.cwd,  // NEW: Use worktree cwd if available
    // ... rest of options
  })
}
```

</section>

---

<section name="implementation-plan">

## Implementation Plan

### Phase 0: Add Types to VCS Types

First, add worktree types to `src/utils/vcs/types.ts`:

```typescript
// Add to src/utils/vcs/types.ts

/**
 * Information about a git worktree
 */
export interface WorktreeInfo {
  /** Absolute path to the worktree directory */
  path: string
  /** Branch name (null for detached HEAD) */
  branch: string | null
  /** Commit hash at HEAD */
  head: string
  /** Whether the worktree is locked */
  locked?: boolean
  /** Whether the worktree can be pruned */
  prunable?: boolean
}
```

### Phase 1: Git Worktree Utilities

Add worktree management functions to `src/utils/vcs/git.ts`:

```typescript
// src/utils/vcs/git.ts

import * as path from 'node:path'
import type { WorktreeInfo } from './types.js'

/**
 * Parse git worktree list --porcelain output
 */
function parseWorktreeList(output: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = []
  let current: Partial<WorktreeInfo> = {}

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      // Start of new worktree entry
      if (current.path) {
        worktrees.push(current as WorktreeInfo)
      }
      current = { path: line.slice(9) }
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5)
    } else if (line.startsWith('branch ')) {
      // Extract branch name from refs/heads/...
      current.branch = line.slice(7).replace('refs/heads/', '')
    } else if (line === 'detached') {
      current.branch = null
    } else if (line === 'locked') {
      current.locked = true
    } else if (line === 'prunable') {
      current.prunable = true
    }
  }

  // Don't forget the last entry
  if (current.path) {
    worktrees.push(current as WorktreeInfo)
  }

  return worktrees
}

/**
 * List all worktrees for the repository
 */
export async function listWorktrees(cwd?: string): Promise<WorktreeInfo[]> {
  const args = cwd
    ? ['-C', cwd, 'worktree', 'list', '--porcelain']
    : ['worktree', 'list', '--porcelain']
  const result = await Bun.$`git ${args}`.quiet()
  return parseWorktreeList(result.stdout.toString())
}

/**
 * Add a new worktree
 */
export async function addWorktree(
  worktreePath: string,
  branch: string,
  options?: {
    base?: string
    createBranch?: boolean
    cwd?: string
  }
): Promise<void> {
  const args: string[] = []

  if (options?.cwd) {
    args.push('-C', options.cwd)
  }

  args.push('worktree', 'add')

  if (options?.createBranch) {
    args.push('-b', branch)
  }

  args.push(worktreePath)

  if (!options?.createBranch) {
    args.push(branch)
  } else if (options.base) {
    args.push(options.base)
  }

  await Bun.$`git ${args}`.quiet()
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
  worktreePath: string,
  options?: { force?: boolean; cwd?: string }
): Promise<void> {
  const args: string[] = []

  if (options?.cwd) {
    args.push('-C', options.cwd)
  }

  args.push('worktree', 'remove')

  if (options?.force) {
    args.push('--force')
  }

  args.push(worktreePath)

  await Bun.$`git ${args}`.quiet()
}

/**
 * Check if a branch exists
 */
export async function branchExists(branch: string, cwd?: string): Promise<boolean> {
  try {
    const args = cwd
      ? ['-C', cwd, 'rev-parse', '--verify', `refs/heads/${branch}`]
      : ['rev-parse', '--verify', `refs/heads/${branch}`]
    await Bun.$`git ${args}`.quiet()
    return true
  } catch {
    return false
  }
}

/**
 * Check if a worktree exists at path
 * Uses path.resolve() to normalize paths before comparison
 */
export async function worktreeExists(worktreePath: string, cwd?: string): Promise<boolean> {
  const worktrees = await listWorktrees(cwd)
  const normalizedPath = path.resolve(worktreePath)
  return worktrees.some(wt => path.resolve(wt.path) === normalizedPath)
}
```

### Phase 2: WorktreeContext

Create the context provider:

```typescript
// src/components/WorktreeProvider.tsx

import { createContext, useContext, type ReactNode } from 'react'

export interface WorktreeContextValue {
  cwd: string
  branch: string
  isWorktree: true
}

const WorktreeContext = createContext<WorktreeContextValue | null>(null)

export function useWorktree(): WorktreeContextValue | null {
  return useContext(WorktreeContext)
}

export function WorktreeProvider(props: {
  value: WorktreeContextValue
  children: ReactNode
}): ReactNode {
  return (
    <WorktreeContext.Provider value={props.value}>
      {props.children}
    </WorktreeContext.Provider>
  )
}
```

### Phase 3: Worktree Component

Create the main component:

> **Design Decision: Ralph Iteration Behavior**
>
> The `Worktree` component uses `useMount` (runs once on mount) rather than
> `useEffectOnValueChange(ralphCount, ...)` (runs on each Ralph iteration).
> This means **worktrees persist across Ralph iterations** - they are created
> once and reused. This is intentional because:
> 1. Worktree creation is expensive (git operations, disk I/O)
> 2. Most use cases want agents to iterate on changes within the same worktree
> 3. If per-iteration worktrees are needed, use dynamic branch names:
>    `<Worktree branch={\`iteration-${ralphCount}\`}>`

```typescript
// src/components/Worktree.tsx

import { useState, useRef, type ReactNode } from 'react'
import * as path from 'node:path'
import { useSmithers } from './SmithersProvider.js'
import { WorktreeProvider, type WorktreeContextValue } from './WorktreeProvider.js'
import { useMount, useUnmount } from '../reconciler/hooks.js'
import {
  addWorktree,
  removeWorktree,
  worktreeExists,
  branchExists,
} from '../utils/vcs/git.js'

export interface WorktreeProps {
  branch: string
  base?: string
  path?: string
  cleanup?: boolean
  children: ReactNode
  onReady?: (worktreePath: string) => void
  onError?: (error: Error) => void
}

export function Worktree(props: WorktreeProps): ReactNode {
  const { db } = useSmithers()
  const [status, setStatus] = useState<'pending' | 'ready' | 'error'>('pending')
  const [worktreePath, setWorktreePath] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const createdWorktreeRef = useRef(false)
  const taskIdRef = useRef<string | null>(null)

  useMount(() => {
    ;(async () => {
      taskIdRef.current = db.tasks.start('worktree', props.branch)

      try {
        // Determine worktree path
        const wtPath = props.path ?? path.join(process.cwd(), '.worktrees', props.branch)
        const absolutePath = path.resolve(wtPath)

        // Check if worktree already exists
        const exists = await worktreeExists(absolutePath)

        if (!exists) {
          // Check if branch exists
          const hasBranch = await branchExists(props.branch)

          // Create the worktree
          await addWorktree(absolutePath, props.branch, {
            base: props.base ?? 'HEAD',
            createBranch: !hasBranch,
          })

          createdWorktreeRef.current = true
          console.log(`[Worktree] Created worktree at ${absolutePath} for branch ${props.branch}`)
        } else {
          console.log(`[Worktree] Using existing worktree at ${absolutePath}`)
        }

        setWorktreePath(absolutePath)
        setStatus('ready')
        props.onReady?.(absolutePath)
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        console.error(`[Worktree] Error setting up worktree:`, errorObj)
        setError(errorObj)
        setStatus('error')
        props.onError?.(errorObj)
      }
    })()
  })

  useUnmount(() => {
    ;(async () => {
      // Clean up worktree if requested and we created it
      if (props.cleanup && createdWorktreeRef.current && worktreePath) {
        try {
          await removeWorktree(worktreePath, { force: true })
          console.log(`[Worktree] Removed worktree at ${worktreePath}`)
        } catch (err) {
          console.warn(`[Worktree] Could not remove worktree:`, err)
        }
      }

      if (taskIdRef.current) {
        db.tasks.complete(taskIdRef.current)
      }
    })()
  })

  // Don't render children until worktree is ready
  if (status === 'pending') {
    return (
      <worktree branch={props.branch} status="pending">
        Setting up worktree...
      </worktree>
    )
  }

  if (status === 'error') {
    return (
      <worktree branch={props.branch} status="error" error={error?.message}>
        {error?.message}
      </worktree>
    )
  }

  const contextValue: WorktreeContextValue = {
    cwd: worktreePath!,
    branch: props.branch,
    isWorktree: true,
  }

  return (
    <worktree branch={props.branch} path={worktreePath} status="ready">
      <WorktreeProvider value={contextValue}>
        {props.children}
      </WorktreeProvider>
    </worktree>
  )
}
```

### Phase 4: Update Agent Components

#### 4a. Add `cwd` prop to `ClaudeProps`

First, add the `cwd` property to `ClaudeProps` in `src/components/agents/types/agents.ts`:

```typescript
// In src/components/agents/types/agents.ts - add to ClaudeProps interface

export interface ClaudeProps<TSchema extends z.ZodType = z.ZodType> extends BaseAgentProps {
  // ... existing props ...

  /**
   * Working directory for agent execution.
   * If inside a <Worktree>, this defaults to the worktree's cwd.
   * Explicit cwd prop takes precedence over worktree context.
   */
  cwd?: string
}
```

#### 4b. Modify `Claude.tsx` to use worktree context

```typescript
// In Claude.tsx - add import
import { useWorktree } from './WorktreeProvider.js'

// In Claude function - add hook
const worktree = useWorktree()

// In executeClaudeCLI call - add cwd option (props override context)
const agentResult = await executeClaudeCLI({
  prompt,
  cwd: props.cwd ?? worktree?.cwd,  // Explicit prop > worktree context > undefined
  // ... rest of options
})
```

#### 4c. Modify `Smithers.tsx` similarly

`SmithersProps` already has `cwd?: string`, so just add the worktree hook:

```typescript
// In Smithers.tsx - add import
import { useWorktree } from './WorktreeProvider.js'

// In Smithers function - add hook
const worktree = useWorktree()

// In executeSmithers call - use worktree cwd as default (props already supported)
const smithersResult = await executeSmithers({
  task,
  cwd: props.cwd ?? worktree?.cwd,  // Explicit prop > worktree context > undefined
  // ... rest of options
})
```

### Phase 5: Export and Documentation

Add exports to `src/components/index.ts`:

```typescript
export { Worktree, type WorktreeProps } from './Worktree.js'
export { useWorktree, WorktreeProvider, type WorktreeContextValue } from './WorktreeProvider.js'
```

</section>

---

<section name="benefits">

## Benefits

### 1. Parallel Branch Execution

Run multiple agents on different branches simultaneously without conflicts:

```tsx
// Both execute in parallel, isolated from each other
<Worktree branch="feature-a">
  <Claude>Implement feature A</Claude>
</Worktree>
<Worktree branch="feature-b">
  <Claude>Implement feature B</Claude>
</Worktree>
```

### 2. Safe Experimentation

Experiment without affecting the main working directory:

```tsx
<Worktree branch="experiment" cleanup>
  <Claude>Try a risky refactoring</Claude>
  {/* Worktree deleted on unmount if cleanup=true */}
</Worktree>
```

### 3. Clean Phase Isolation

Each phase can work on a clean state:

```tsx
<Ralph>
  <Worktree branch={`iteration-${iteration}`}>
    <Phase name="Implement">
      <Claude>Implement the feature</Claude>
    </Phase>
  </Worktree>
</Ralph>
```

### 4. Transparent to Children

Child components don't need to know about worktrees - context propagation handles it:

```tsx
<Worktree branch="feature">
  {/* All these operate in the worktree automatically */}
  <Phase name="Plan">
    <Claude>Plan the implementation</Claude>
  </Phase>
  <Step name="Implement">
    <Claude>Write the code</Claude>
  </Step>
  <Smithers>
    Complex nested orchestration
  </Smithers>
</Worktree>
```

### 5. Composable with Existing Components

Works seamlessly with existing Smithers components:

```tsx
<Orchestration timeout={60000}>
  <Worktree branch="main-work">
    <Ralph maxIterations={3}>
      <Phase name="Code">
        <Claude model="sonnet">Implement feature</Claude>
      </Phase>
    </Ralph>
  </Worktree>
</Orchestration>
```

</section>

---

<section name="edge-cases">

## Edge Cases and Error Handling

### 1. Worktree Already Exists

If the worktree path already exists, reuse it instead of failing:

```typescript
const exists = await worktreeExists(absolutePath)
if (!exists) {
  await addWorktree(...)
} else {
  console.log(`[Worktree] Using existing worktree at ${absolutePath}`)
}
```

### 2. Branch Already Exists

If the branch exists, don't try to create it:

```typescript
const hasBranch = await branchExists(props.branch)
await addWorktree(absolutePath, props.branch, {
  createBranch: !hasBranch,  // Only create if doesn't exist
})
```

### 3. Cleanup Failures

If cleanup fails (e.g., uncommitted changes), log a warning but don't throw:

```typescript
if (props.cleanup && createdWorktreeRef.current) {
  try {
    await removeWorktree(worktreePath, { force: true })
  } catch (err) {
    console.warn(`[Worktree] Could not remove worktree:`, err)
    // Don't rethrow - component is unmounting anyway
  }
}
```

### 4. Nested Worktrees

Inner worktree context shadows outer:

```tsx
<Worktree branch="outer">
  <Worktree branch="inner">
    {/* Uses inner worktree's cwd */}
    <Claude>...</Claude>
  </Worktree>
</Worktree>
```

### 5. Explicit cwd Override

Props always take precedence over context:

```tsx
<Worktree branch="feature">
  {/* Uses /explicit/path, not worktree cwd */}
  <Smithers cwd="/explicit/path">...</Smithers>
</Worktree>
```

</section>

---

<section name="acceptance-criteria">

## Acceptance Criteria

### Types & Interfaces
- [ ] `WorktreeInfo` type added to `src/utils/vcs/types.ts`
- [ ] `cwd?: string` prop added to `ClaudeProps` interface

### Git Utilities
- [ ] `listWorktrees()` parses porcelain output correctly
- [ ] `addWorktree()` creates worktree with optional branch creation
- [ ] `removeWorktree()` removes worktree with optional force flag
- [ ] `branchExists()` checks if branch exists
- [ ] `worktreeExists()` normalizes paths before comparison

### Worktree Component
- [ ] `Worktree` component creates git worktree on mount if it doesn't exist
- [ ] `Worktree` component reuses existing worktree if path already exists
- [ ] `Worktree` creates branch from base ref if branch doesn't exist
- [ ] `Worktree` persists across Ralph iterations (doesn't recreate on each iteration)
- [ ] `cleanup` prop removes worktree on unmount (only if component created it)
- [ ] Error states render error element without crashing

### Context Propagation
- [ ] `WorktreeContext` provides `cwd`, `branch`, and `isWorktree` to children
- [ ] `useWorktree()` hook returns context value or `null`
- [ ] Nested worktrees correctly shadow parent context

### Agent Integration
- [ ] `Claude` component uses worktree `cwd` when in worktree context
- [ ] `Claude` component allows explicit `cwd` prop to override worktree context
- [ ] `Smithers` component uses worktree `cwd` when in worktree context
- [ ] `Smithers` component allows explicit `cwd` prop to override worktree context

### Exports
- [ ] `Worktree`, `WorktreeProps` exported from `src/components/index.ts`
- [ ] `useWorktree`, `WorktreeProvider`, `WorktreeContextValue` exported
- [ ] `WorktreeInfo` exported from `src/utils/vcs/index.ts`

</section>

---

<section name="testing-strategy">

## Testing Strategy

### Unit Tests: Git Utilities

```typescript
// src/utils/vcs/git.test.ts
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import * as path from 'node:path'

describe('parseWorktreeList', () => {
  test('parses single worktree', () => {
    const output = `worktree /path/to/repo
HEAD abc123
branch refs/heads/main
`
    // Verify parsing
  })

  test('parses detached HEAD worktree', () => {
    const output = `worktree /path/to/worktree
HEAD def456
detached
`
    // Verify branch is null
  })

  test('parses multiple worktrees', () => {
    // ...
  })
})

describe('worktreeExists', () => {
  test('normalizes paths before comparison', async () => {
    // Mock listWorktrees to return paths
    // Test that relative vs absolute paths match correctly
  })
})
```

### Unit Tests: Worktree Component

```typescript
// src/components/Worktree.test.tsx
import { describe, test, expect, mock } from 'bun:test'
import { Worktree } from './Worktree'
import { renderToStaticMarkup } from '../reconciler/serialize'

describe('Worktree component', () => {
  test('creates worktree on mount', async () => {
    // Mock git commands
    // Verify addWorktree called with correct args
  })

  test('reuses existing worktree', async () => {
    // Mock worktreeExists to return true
    // Verify addWorktree NOT called
  })

  test('cleans up worktree on unmount when cleanup=true', async () => {
    // Verify removeWorktree called with force: true
  })

  test('does not clean up if cleanup=false', async () => {
    // Verify removeWorktree NOT called
  })

  test('does not clean up worktrees it did not create', async () => {
    // Mock worktreeExists to return true (pre-existing)
    // Unmount with cleanup=true
    // Verify removeWorktree NOT called
  })

  test('renders pending state while setting up', async () => {
    // Verify renders <worktree status="pending">
  })

  test('renders error state on failure', async () => {
    // Mock addWorktree to throw
    // Verify renders <worktree status="error">
  })

  test('calls onReady when worktree is ready', async () => {
    const onReady = mock(() => {})
    // Render and wait
    // Verify onReady called with path
  })

  test('calls onError on failure', async () => {
    const onError = mock(() => {})
    // Mock failure
    // Verify onError called
  })
})

describe('WorktreeContext', () => {
  test('provides context to children', async () => {
    // Render with useWorktree consumer
    // Verify receives { cwd, branch, isWorktree: true }
  })

  test('nested worktrees shadow parent context', async () => {
    // Render nested Worktrees
    // Inner child should see inner worktree's cwd
  })
})
```

### Integration Tests

```typescript
// src/components/Worktree.integration.test.tsx
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

describe('Worktree integration', () => {
  const testDir = path.join(process.cwd(), '.test-worktrees')

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  test('agents operate in worktree directory', async () => {
    // 1. Create actual worktree using component
    // 2. Run Claude that creates a file (mocked to just write)
    // 3. Verify file exists in worktree, not main repo
    // 4. Cleanup removes worktree
  })

  test('explicit cwd prop overrides worktree context', async () => {
    // Render Claude with explicit cwd inside Worktree
    // Verify Claude uses explicit cwd, not worktree cwd
  })
})
```

</section>

---

<section name="future-considerations">

## Future Considerations

### 1. Worktree Pool

Pre-create a pool of worktrees for faster execution:

```tsx
<WorktreePool size={3} baseRef="main">
  <Worktree fromPool>
    <Claude>...</Claude>
  </Worktree>
</WorktreePool>
```

### 2. Automatic Merge Back

Option to merge worktree changes back to a target branch:

```tsx
<Worktree branch="feature" mergeOnComplete="main">
  <Claude>Implement feature</Claude>
</Worktree>
```

### 3. Worktree Status in Database

Track worktree lifecycle in the Smithers database for observability.

### 4. Remote Worktrees

Support for worktrees on remote machines via SSH.

</section>

---

<section name="implementation-notes">

## Implementation Notes

### Key Gotchas

1. **Bun.$ array interpolation**: When passing arrays to `Bun.$`, build the complete args array first rather than conditionally interpolating. The template literal interpolation handles arrays by spreading them into the command.

2. **Path normalization**: Always use `path.resolve()` when comparing paths from git output with user-provided paths. Git may return absolute paths differently than `path.join()` produces.

3. **React Strict Mode**: The `useMount` hook should handle strict mode's double invocation. Verify the ref pattern (`createdWorktreeRef`) prevents double worktree creation.

4. **Async cleanup**: The `useUnmount` callback runs synchronously, but worktree removal is async. The cleanup is fire-and-forget by design - if cleanup fails, it logs a warning but doesn't block unmount.

5. **ClaudeProps changes**: Adding `cwd` to `ClaudeProps` is a non-breaking change since it's optional. Existing code will continue to work.

### Files Modified

| File | Change |
|------|--------|
| `src/utils/vcs/types.ts` | Add `WorktreeInfo` interface |
| `src/utils/vcs/git.ts` | Add worktree utilities |
| `src/utils/vcs/index.ts` | Export new utilities and types |
| `src/components/agents/types/agents.ts` | Add `cwd` to `ClaudeProps` |
| `src/components/WorktreeProvider.tsx` | NEW - Context provider |
| `src/components/Worktree.tsx` | NEW - Main component |
| `src/components/Claude.tsx` | Add `useWorktree()` hook, pass `cwd` |
| `src/components/Smithers.tsx` | Add `useWorktree()` hook |
| `src/components/index.ts` | Export new components |

</section>

---

## Summary

The `<Worktree>` component provides a declarative way to isolate agent execution into git worktrees. Through React context propagation, all nested components automatically operate in the worktree's directory without requiring explicit configuration. This enables parallel branch execution, safe experimentation, and clean phase isolation while maintaining backward compatibility with existing Smithers components.

Key design decisions:
- **Worktrees persist across Ralph iterations** - Created once on mount, not recreated per iteration
- **Explicit `cwd` prop overrides context** - Maintains flexibility for edge cases
- **Cleanup is opt-in and best-effort** - Only removes worktrees the component created, logs warnings on failure
- **Path normalization** - Uses `path.resolve()` to handle different path representations
