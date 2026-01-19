# Wire Plan Markers to Execution (Stop, Human, Persona, Constraints)

<metadata>
  <priority>P2</priority>
  <category>bugfix</category>
  <status>design-review-accounted</status>
  <dependencies>
    - src/components/Stop.tsx
    - src/components/Human.tsx
    - src/components/Claude.tsx
    - src/utils/mcp-config.ts
    - src/db/human.ts
    - src/hooks/useHuman.ts
  </dependencies>
  <docs>["docs/components/stop.mdx", "docs/components/human.mdx", "docs/components/claude.mdx"]</docs>
</metadata>

## Executive Summary

**What**: Connect plan marker components (Stop, Human, Persona, Constraints) to execution side effects - currently they only render XML without triggering actions.

**Why**: Plan markers document intent but don't execute. Stop doesn't stop, Human doesn't block, Persona/Constraints aren't applied to prompts.

**Impact**: Enables truly executable orchestration plans where markup drives behavior, not just documentation.

## Problem Statement

Many components render plan XML only and never execute side effects:

### Current Behavior (Plan-Only)

```tsx
// src/components/Stop.tsx:1-30
export function Stop(props: StopProps): ReactNode {
  return (
    <smithers-stop reason={props.reason}>
      {props.children}
    </smithers-stop>
  )
}
// ❌ No requestStop() call
// ❌ No state mutation
// ❌ Just renders XML marker

// src/components/Human.tsx:1-35
export function Human(props: HumanProps): ReactNode {
  return (
    <human message={props.message}>
      {props.children}
    </human>
  )
}
// ❌ No db.human.request() call
// ❌ No task creation to block
// ❌ Just renders XML marker
```

### Expected Behavior (Execution-Aware)

```tsx
// Stop triggers orchestration halt
<Stop reason="Work complete" />
→ Calls requestStop()
→ Ralph loop exits
→ Orchestration completes

// Human blocks until approved
<Human message="Deploy to prod?">
  <div>Changes: {files}</div>
</Human>
→ Creates db.human.request
→ Creates blocking task
→ Waits for approval
→ Continues on approve

// Persona/Constraints modify system prompt
<Claude>
  <Persona>Senior security engineer</Persona>
  <Constraints>No external dependencies</Constraints>
  Review this code for vulnerabilities
</Claude>
→ Extracts persona + constraints from children
→ Injects into system prompt
→ Removes from user prompt
```

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    <Stop>                                   │
│  useMount → requestStop(reason)                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    <Human>                                  │
│  useMount → db.human.request(...)                           │
│          → db.tasks.start('human_interaction')              │
│  useEffect → poll db.human until resolved                   │
│           → db.tasks.complete(taskId)                       │
│           → fire onApprove/onReject                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    <Claude>                                 │
│  parseChildren → extract <Persona>, <Constraints>           │
│               → merge into system prompt                    │
│               → strip markers from user prompt              │
│               → pass to agent CLI                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Decision**: Stop uses useMount to trigger
   - **Rationale**: Fire once when component enters tree
   - **Alternatives Considered**: useEffect with deps (overcomplicated), manual call (breaks declarative)

2. **Decision**: Human creates blocking task
   - **Rationale**: Ralph loop waits for all tasks to complete
   - **Alternatives Considered**: Polling (inefficient), events (complex)

3. **Decision**: Persona/Constraints are plan-only by default, opt-in extraction
   - **Rationale**: Avoid magic parsing, explicit is better
   - **Alternatives Considered**: Always extract (breaks when you want literal text)

## Implementation Plan

### Phase 1: Wire Stop Component

**Goal**: Stop component triggers requestStop on mount

**Files to Modify:**
- `src/components/Stop.tsx`

**Code Changes:**

```tsx
// BEFORE (Stop.tsx:1-30)
import type { ReactNode } from 'react'

export interface StopProps {
  reason?: string
  children?: ReactNode
  [key: string]: unknown
}

export function Stop(props: StopProps): ReactNode {
  return (
    <smithers-stop reason={props.reason}>
      {props.children}
    </smithers-stop>
  )
}

// AFTER (add execution)
import type { ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useMount } from '../reconciler/hooks.js'

export interface StopProps {
  reason?: string
  children?: ReactNode
  [key: string]: unknown
}

export function Stop(props: StopProps): ReactNode {
  const { requestStop } = useSmithers()

  useMount(() => {
    const reason = props.reason ?? 'Stop component encountered'
    requestStop(reason)
    console.log(`[Stop] Requested stop: ${reason}`)
  })

  return (
    <smithers-stop reason={props.reason}>
      {props.children}
    </smithers-stop>
  )
}
```

**Tests:**

```tsx
// src/components/Stop.test.tsx
describe('Stop component', () => {
  it('triggers requestStop on mount', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    let stopRequested = false
    const root = createSmithersRoot()

    await root.mount(
      <SmithersProvider
        db={db}
        executionId={execId}
        config={{ onStopRequested: () => { stopRequested = true } }}
      >
        <Stop reason="Test stop" />
      </SmithersProvider>
    )

    await new Promise(resolve => setTimeout(resolve, 100))

    expect(stopRequested).toBe(true)
    const stopState = db.state.get('stop_requested')
    expect(stopState).toBeTruthy()

    root.dispose()
  })
})
```

### Phase 2: Wire Human Component

**Goal**: Human creates blocking task and waits for approval

**Files to Modify:**
- `src/components/Human.tsx`
- `src/db/human.ts` (create if missing)
- `src/hooks/useHuman.ts` (create if missing)

**Code Changes:**

```tsx
// BEFORE (Human.tsx:1-35)
import type { ReactNode } from 'react'

export interface HumanProps {
  message?: string
  onApprove?: () => void
  onReject?: () => void
  children?: ReactNode
  [key: string]: unknown
}

export function Human(props: HumanProps): ReactNode {
  return (
    <human message={props.message}>
      {props.children}
    </human>
  )
}

// AFTER (add blocking interaction)
import { useRef, useEffect, type ReactNode } from 'react'
import { useSmithers } from './SmithersProvider.js'
import { useMount, useUnmount } from '../reconciler/hooks.js'
import { useQueryValue } from '../reactive-sqlite/index.js'

export interface HumanProps {
  message?: string
  onApprove?: () => void
  onReject?: () => void
  children?: ReactNode
  [key: string]: unknown
}

export function Human(props: HumanProps): ReactNode {
  const { db, reactiveDb, executionId } = useSmithers()
  const taskIdRef = useRef<string | null>(null)
  const interactionIdRef = useRef<string | null>(null)

  // Read interaction status reactively
  const { data: interactionStatus } = useQueryValue<string>(
    reactiveDb,
    interactionIdRef.current
      ? `SELECT status FROM human_interactions WHERE id = ?`
      : `SELECT 'pending' as status`,
    interactionIdRef.current ? [interactionIdRef.current] : []
  )

  useMount(() => {
    // Create blocking task
    taskIdRef.current = db.tasks.start('human_interaction', props.message)

    // Create human interaction request
    const id = crypto.randomUUID()
    interactionIdRef.current = id

    db.db.run(
      `INSERT INTO human_interactions (id, execution_id, type, prompt, status)
       VALUES (?, ?, 'confirmation', ?, 'pending')`,
      [id, executionId, props.message ?? 'User approval required']
    )

    console.log(`[Human] Awaiting user interaction: ${props.message}`)
  })

  // React to status changes
  useEffect(() => {
    if (!interactionStatus || interactionStatus === 'pending') return

    if (interactionStatus === 'approved') {
      console.log(`[Human] Approved: ${props.message}`)
      props.onApprove?.()

      if (taskIdRef.current) {
        db.tasks.complete(taskIdRef.current)
      }
    } else if (interactionStatus === 'rejected') {
      console.log(`[Human] Rejected: ${props.message}`)
      props.onReject?.()

      if (taskIdRef.current) {
        db.tasks.complete(taskIdRef.current)
      }
    }
  }, [interactionStatus, props, db])

  useUnmount(() => {
    // Cleanup if never resolved
    if (taskIdRef.current) {
      db.tasks.complete(taskIdRef.current)
    }
  })

  return (
    <human message={props.message} status={interactionStatus}>
      {props.children}
    </human>
  )
}
```

**Database Helper:**

```tsx
// src/db/human.ts
import type { Database } from 'bun:sqlite'

export interface HumanRequest {
  id: string
  execution_id: string
  type: 'confirmation' | 'text' | 'select'
  prompt: string
  options?: string
  status: 'pending' | 'approved' | 'rejected' | 'timeout'
  response?: string
}

export function createHumanHelpers(db: Database) {
  return {
    request(executionId: string, type: string, prompt: string, options?: string[]) {
      const id = crypto.randomUUID()
      db.run(
        `INSERT INTO human_interactions (id, execution_id, type, prompt, options, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [id, executionId, type, prompt, options ? JSON.stringify(options) : null]
      )
      return id
    },

    approve(id: string, response?: string) {
      db.run(
        `UPDATE human_interactions
         SET status = 'approved', response = ?, resolved_at = datetime('now')
         WHERE id = ?`,
        [response ?? null, id]
      )
    },

    reject(id: string) {
      db.run(
        `UPDATE human_interactions
         SET status = 'rejected', resolved_at = datetime('now')
         WHERE id = ?`,
        [id]
      )
    },

    getPending(executionId: string): HumanRequest[] {
      return db.query(
        `SELECT * FROM human_interactions
         WHERE execution_id = ? AND status = 'pending'
         ORDER BY created_at ASC`
      ).all(executionId) as HumanRequest[]
    },
  }
}
```

**Tests:**

```tsx
// src/components/Human.test.tsx
describe('Human component', () => {
  it('blocks orchestration until approved', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    let approved = false
    const root = createSmithersRoot()

    await root.mount(
      <SmithersProvider db={db} executionId={execId} maxIterations={1}>
        <Phase name="Test">
          <Step name="Approve">
            <Human
              message="Proceed?"
              onApprove={() => { approved = true }}
            >
              <div>Details</div>
            </Human>
          </Step>
        </Phase>
      </SmithersProvider>
    )

    // Initially pending
    const pending = db.db.query(
      'SELECT * FROM human_interactions WHERE status = "pending"'
    ).all()
    expect(pending.length).toBe(1)

    // Approve
    const interactionId = pending[0].id
    db.human.approve(interactionId)

    await new Promise(resolve => setTimeout(resolve, 500))

    expect(approved).toBe(true)

    root.dispose()
  })
})
```

### Phase 3: Persona/Constraints Extraction (Optional)

**Goal**: Extract plan markers from Claude children and apply to system prompt

**Files to Modify:**
- `src/components/Claude.tsx`
- `src/utils/prompt-parsing.ts` (create)

**Code:**

```tsx
// src/utils/prompt-parsing.ts
export interface ExtractedPromptData {
  persona?: string
  constraints?: string[]
  userPrompt: string
}

export function extractPromptMarkers(children: React.ReactNode): ExtractedPromptData {
  const childrenString = React.Children.toArray(children)
    .map(c => (typeof c === 'string' ? c : ''))
    .join('')

  // Extract <Persona>...</Persona>
  const personaMatch = childrenString.match(/<Persona>(.*?)<\/Persona>/s)
  const persona = personaMatch?.[1]?.trim()

  // Extract <Constraints>...</Constraints>
  const constraintsMatch = childrenString.match(/<Constraints>(.*?)<\/Constraints>/s)
  const constraints = constraintsMatch?.[1]?.split('\n').map(c => c.trim()).filter(Boolean)

  // Remove markers from user prompt
  let userPrompt = childrenString
    .replace(/<Persona>.*?<\/Persona>/gs, '')
    .replace(/<Constraints>.*?<\/Constraints>/gs, '')
    .trim()

  return { persona, constraints, userPrompt }
}

// Usage in Claude component
const { persona, constraints, userPrompt } = extractPromptMarkers(props.children)

const systemPrompt = [
  baseSystemPrompt,
  persona && `You are a ${persona}.`,
  constraints && `Constraints:\n${constraints.map(c => `- ${c}`).join('\n')}`,
].filter(Boolean).join('\n\n')
```

**Decision**: Leave as utility function, not automatic. Users can opt-in to this pattern.

## Acceptance Criteria

- [ ] **AC1**: Stop component calls requestStop on mount
  - Test: Verify stop_requested in state table
- [ ] **AC2**: Human component creates blocking task
  - Test: Task count increases, Ralph loop waits
- [ ] **AC3**: Human approval continues execution
  - Test: Approve interaction, step completes
- [ ] **AC4**: Human rejection fires onReject callback
  - Test: Reject interaction, callback fires
- [ ] **AC5**: Persona/Constraints extraction utility exists
  - Test: Parse example with markers, verify extraction

## Testing Strategy

### Unit Tests

```tsx
describe('Plan marker execution', () => {
  it('Stop halts orchestration', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    const root = createSmithersRoot()
    await root.mount(
      <SmithersProvider db={db} executionId={execId}>
        <Stop reason="Done" />
      </SmithersProvider>
    )

    await new Promise(resolve => setTimeout(resolve, 100))

    const stopState = db.state.get('stop_requested')
    expect(stopState).toBeTruthy()

    root.dispose()
  })

  it('Human blocks and unblocks', async () => {
    // See Phase 2 tests above
  })
})
```

### Integration Tests

```tsx
describe('Plan markers in workflow', () => {
  it('Stop after phase completion', async () => {
    const db = await createSmithersDB({ path: ':memory:' })
    const execId = await db.execution.start('test', 'test.tsx')

    const root = createSmithersRoot()
    await root.mount(
      <SmithersProvider db={db} executionId={execId}>
        <Phase name="Work">
          <Step name="Task">
            <div>Done</div>
          </Step>
        </Phase>
        <Stop reason="Phase complete" />
        <Phase name="Never Runs">
          <div>Skipped</div>
        </Phase>
      </SmithersProvider>
    )

    await new Promise(resolve => setTimeout(resolve, 2000))

    const phases = db.db.query('SELECT * FROM phases').all()
    expect(phases.length).toBe(1) // Only first phase ran

    root.dispose()
  })
})
```

### Manual Testing

1. **Scenario**: Stop in conditional
   - **Steps**:
     1. Create workflow with conditional Stop
     2. Run with condition true
     3. Verify stops early
   - **Expected**: Orchestration halts when Stop is reached

2. **Scenario**: Human approval flow
   - **Steps**:
     1. Create workflow with Human component
     2. Run orchestration
     3. Approve via CLI or TUI
     4. Verify continues
   - **Expected**: Blocks until approved, then continues

## Files Summary

| Action | File Path | Description |
|--------|-----------|-------------|
| MODIFY | `src/components/Stop.tsx` | Add requestStop on mount |
| MODIFY | `src/components/Human.tsx` | Add blocking interaction logic |
| CREATE | `src/db/human.ts` | Human interaction DB helpers |
| CREATE | `src/utils/prompt-parsing.ts` | Persona/Constraints extraction |
| CREATE | `src/components/Stop.test.tsx` | Stop execution tests |
| CREATE | `src/components/Human.test.tsx` | Human interaction tests |

## Open Questions

- [ ] **Q1**: Should Persona/Constraints extraction be automatic?
  - **Impact**: Magic vs explicit control
  - **Resolution**: Provide as utility, don't auto-apply

- [ ] **Q2**: How to handle Human timeout?
  - **Impact**: Orchestrations could hang forever
  - **Resolution**: Add optional timeout prop, default 30min

- [ ] **Q3**: Should Stop be cancellable?
  - **Impact**: Could resume after stop
  - **Resolution**: Add clearStop() method, not MVP

## References

- [Stop Component Source](../src/components/Stop.tsx)
- [Human Component Source](../src/components/Human.tsx)
- [Review: Plan Markers Not Wired](../reviews/plan-markers-not-wired.md)
- [Human Interactions Schema](../src/db/schema.sql#L449-L471)
