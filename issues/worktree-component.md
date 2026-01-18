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
    - src/utils/vcs/git.ts
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

### Phase 1: Git Worktree Utilities

Add worktree management functions to `src/utils/vcs/git.ts`:

```typescript
// src/utils/vcs/git.ts

export interface WorktreeInfo {
  path: string
  branch: string
  head: string
}

/**
 * List all worktrees for the repository
 */
export async function listWorktrees(cwd?: string): Promise<WorktreeInfo[]> {
  const result = await Bun.$`git ${cwd ? ['-C', cwd] : []} worktree list --porcelain`.quiet()
  // Parse porcelain output
  return parseWorktreeList(result.stdout.toString())
}

/**
 * Add a new worktree
 */
export async function addWorktree(
  path: string,
  branch: string,
  options?: {
    base?: string
    createBranch?: boolean
    cwd?: string
  }
): Promise<void> {
  const args = ['worktree', 'add']

  if (options?.createBranch) {
    args.push('-b', branch)
  }

  args.push(path)

  if (!options?.createBranch) {
    args.push(branch)
  } else if (options.base) {
    args.push(options.base)
  }

  const gitArgs = options?.cwd ? ['-C', options.cwd, ...args] : args
  await Bun.$`git ${gitArgs}`.quiet()
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
  path: string,
  options?: { force?: boolean; cwd?: string }
): Promise<void> {
  const args = ['worktree', 'remove']
  if (options?.force) args.push('--force')
  args.push(path)

  const gitArgs = options?.cwd ? ['-C', options.cwd, ...args] : args
  await Bun.$`git ${gitArgs}`.quiet()
}

/**
 * Check if a branch exists
 */
export async function branchExists(branch: string, cwd?: string): Promise<boolean> {
  try {
    const args = cwd ? ['-C', cwd, 'rev-parse', '--verify', `refs/heads/${branch}`] :
                       ['rev-parse', '--verify', `refs/heads/${branch}`]
    await Bun.$`git ${args}`.quiet()
    return true
  } catch {
    return false
  }
}

/**
 * Check if a worktree exists at path
 */
export async function worktreeExists(path: string, cwd?: string): Promise<boolean> {
  const worktrees = await listWorktrees(cwd)
  return worktrees.some(wt => wt.path === path)
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

```typescript
// src/components/Worktree.tsx

import { useState, useRef, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { WorktreeProvider, type WorktreeContextValue } from './WorktreeProvider.js'
import { useMount, useUnmount } from '../reconciler/hooks.js'
import {
  addWorktree,
  removeWorktree,
  worktreeExists,
  branchExists,
  listWorktrees,
} from '../utils/vcs/git.js'
import path from 'node:path'

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

Modify `Claude.tsx` to use worktree context:

```typescript
// In Claude.tsx - add import
import { useWorktree } from './WorktreeProvider.js'

// In Claude function - add hook
const worktree = useWorktree()

// In executeClaudeCLI call - add cwd option
const agentResult = await executeClaudeCLI({
  prompt,
  cwd: worktree?.cwd,  // Use worktree cwd if in worktree context
  // ... rest of options
})
```

Modify `Smithers.tsx` similarly:

```typescript
// In Smithers.tsx - add import
import { useWorktree } from './WorktreeProvider.js'

// In Smithers function - add hook
const worktree = useWorktree()

// In executeSmithers call - use worktree cwd as default
const smithersResult = await executeSmithers({
  task,
  cwd: props.cwd ?? worktree?.cwd,  // Props override worktree context
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

- [ ] `Worktree` component creates git worktree on mount if it doesn't exist
- [ ] `Worktree` component reuses existing worktree if path already exists
- [ ] `Worktree` creates branch from base ref if branch doesn't exist
- [ ] `WorktreeContext` provides `cwd`, `branch`, and `isWorktree` to children
- [ ] `useWorktree()` hook returns context value or `null`
- [ ] `Claude` component uses worktree `cwd` when in worktree context
- [ ] `Smithers` component uses worktree `cwd` when in worktree context
- [ ] `cleanup` prop removes worktree on unmount (only if component created it)
- [ ] Nested worktrees correctly shadow parent context
- [ ] Explicit `cwd` prop overrides worktree context
- [ ] Error states render error element without crashing
- [ ] Git worktree utilities (`addWorktree`, `removeWorktree`, etc.) work correctly
- [ ] Components exported from `src/components/index.ts`

</section>

---

<section name="testing-strategy">

## Testing Strategy

### Unit Tests

```typescript
// src/components/Worktree.test.tsx
import { test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { Worktree } from './Worktree'
import { renderToStaticMarkup } from '../reconciler/serialize'

test('creates worktree on mount', async () => {
  // Mock git commands
  // Verify addWorktree called with correct args
})

test('reuses existing worktree', async () => {
  // Mock worktreeExists to return true
  // Verify addWorktree NOT called
})

test('cleans up worktree on unmount when cleanup=true', async () => {
  // Verify removeWorktree called
})

test('does not clean up if cleanup=false', async () => {
  // Verify removeWorktree NOT called
})

test('provides context to children', async () => {
  // Render with Claude child
  // Verify Claude receives correct cwd
})
```

### Integration Tests

```typescript
// Create actual worktree, run agent, verify isolation
test('agents operate in worktree directory', async () => {
  // 1. Create worktree
  // 2. Run Claude that creates a file
  // 3. Verify file exists in worktree, not main repo
  // 4. Clean up
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

## Summary

The `<Worktree>` component provides a declarative way to isolate agent execution into git worktrees. Through React context propagation, all nested components automatically operate in the worktree's directory without requiring explicit configuration. This enables parallel branch execution, safe experimentation, and clean phase isolation while maintaining backward compatibility with existing Smithers components.
