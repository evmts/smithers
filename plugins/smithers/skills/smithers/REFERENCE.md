# Smithers Framework API Reference

Complete API documentation for all Smithers components and utilities.

## Core Components

### Ralph

The loop controller component. Manages remount cycles for iterative workflows.

```tsx
<Ralph maxIterations={10} onIteration={(i) => console.log(i)}>
  {children}
</Ralph>
```

#### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `maxIterations` | `number` | Yes | - | Maximum number of loop iterations |
| `onIteration` | `(iteration: number) => void` | No | - | Callback fired on each iteration |
| `children` | `JSX.Element` | No | - | Child components to render |

#### Behavior

1. Renders children
2. Monitors for task completion via context
3. When all tasks complete, increments key to force remount
4. Repeats until no more tasks or `maxIterations` reached

#### Example

```tsx
<Ralph maxIterations={5} onIteration={(i) => console.log(`Iteration ${i}`)}>
  <Claude onFinished={() => setPhase('next')}>
    Do work
  </Claude>
</Ralph>
```

---

### Claude

Self-executing agent component. Executes on mount using Claude Agent SDK.

```tsx
<Claude
  model="sonnet"
  maxTurns={10}
  tools={['bash', 'grep']}
  systemPrompt="You are a helpful assistant"
  onFinished={(result) => console.log(result)}
  onError={(error) => console.error(error)}
  validate={async (result) => result.success === true}
>
  Your prompt here
</Claude>
```

#### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `children` | `JSX.Element` | Yes | - | The prompt text |
| `model` | `'sonnet' \| 'opus' \| 'haiku'` | No | `'sonnet'` | Claude model to use |
| `maxTurns` | `number` | No | - | Maximum conversation turns |
| `tools` | `string[]` | No | - | Tools to enable |
| `systemPrompt` | `string` | No | - | System message |
| `onFinished` | `(result: unknown) => void` | No | - | Called when execution completes |
| `onError` | `(error: Error) => void` | No | - | Called on error |
| `validate` | `(result: unknown) => Promise<boolean>` | No | - | Optional validation function |

#### Lifecycle

1. **Mount** - Component mounts
2. **Execute** - Async execution begins
3. **Validate** (optional) - Result is validated
4. **Complete** - `onFinished` or `onError` called
5. **Context** - Notifies Ralph of completion

#### Status

The component tracks execution status internally:
- `pending` - Initial state
- `running` - Execution in progress
- `complete` - Execution succeeded
- `error` - Execution failed

#### Example

```tsx
<Claude
  model="opus"
  maxTurns={5}
  onFinished={(result) => {
    console.log('Success:', result)
    setPhase('next')
  }}
  onError={(error) => {
    console.error('Failed:', error)
    setPhase('error')
  }}
  validate={async (result) => {
    // Ensure tests pass
    return result.tests_passing === true
  }}
>
  Implement the user authentication system
</Claude>
```

---

### Phase

Sequential workflow phase with automatic state management. Phases execute in declaration order.

```tsx
<Phase name="Research" onStart={() => {}} onComplete={() => {}}>
  {children}
</Phase>
```

#### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Phase name (must be unique) |
| `children` | `JSX.Element` | No | - | Child components (only rendered when active) |
| `skipIf` | `() => boolean` | No | - | Skip this phase if condition returns true |
| `onStart` | `() => void` | No | - | Callback when phase becomes active |
| `onComplete` | `() => void` | No | - | Callback when phase completes |

#### Behavior

1. All phases are always rendered in the plan output (visible structure)
2. Only the active phase renders its children (executes work)
3. When a phase's children complete, it automatically advances to the next phase
4. Phase state is persisted to SQLite via PhaseRegistry

#### Important: Unconditional Rendering

**Always render phases unconditionally.** The Phase component manages its own active state internally.

```tsx
// CORRECT - Render all phases unconditionally
<Ralph>
  <Phase name="Research">...</Phase>
  <Phase name="Implementation">...</Phase>
  <Phase name="Testing">...</Phase>
</Ralph>

// WRONG - Don't use conditional rendering for phases
<Ralph>
  {phase === 'research' && <Phase name="Research">...</Phase>}
  {phase === 'implementation' && <Phase name="Implementation">...</Phase>}
</Ralph>
```

#### Example

```tsx
<Ralph maxIterations={5}>
  <Phase name="Setup" onStart={() => console.log('Starting setup')}>
    <Claude>Initialize configuration</Claude>
  </Phase>

  <Phase name="Implementation">
    <Claude>Write code</Claude>
    <Claude>Add tests</Claude>
  </Phase>

  <Phase name="Optional" skipIf={() => process.env.SKIP_REVIEW === 'true'}>
    <Claude>Review the implementation</Claude>
  </Phase>
</Ralph>
```

---

### Step

Semantic step component for fine-grained workflow organization.

```tsx
<Step name="Configuration">
  {children}
</Step>
```

#### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | No | - | Step name |
| `children` | `JSX.Element` | No | - | Child components |

#### Purpose

Steps provide finer-grained organization than phases. Use for:
- Sub-tasks within a phase
- Detailed workflow steps
- Nested organization

#### Example

```tsx
<Phase name="Testing">
  <Step name="Unit Tests">
    <Claude>Run unit tests</Claude>
  </Step>

  <Step name="Integration Tests">
    <Claude>Run integration tests</Claude>
  </Step>
</Phase>
```

---

## State Management

### Automatic Phase State (PhaseRegistry)

Phase state is managed automatically by PhaseRegistry. You don't need to track phase state manually.

```tsx
// Phase state is automatic - no useState needed for phases
function Workflow() {
  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph maxIterations={10}>
        <Phase name="Start">
          <Claude>Start task</Claude>
        </Phase>
        <Phase name="Next">
          <Claude>Next task (auto-starts when Start completes)</Claude>
        </Phase>
      </Ralph>
    </SmithersProvider>
  )
}
```

### Database State (db.state)

For custom data that needs to persist across phases, use db.state.

#### Basic Usage

```tsx
import { createSmithersDB } from 'smithers-orchestrator/db'

// Initialize database
const db = await createSmithersDB({ path: '.smithers/db' })

// Store data in callbacks
<Claude
  onFinished={async (result) => {
    // Persist custom data to SQLite
    await db.state.set('researchFindings', result)
  }}
>
  Research the topic
</Claude>
```

#### TypeScript

```tsx
// State is typed via db.state generic
const data = await db.state.get<MyDataType>('data')

// Or with default value
const findings = await db.state.get('findings', [])
```

#### Access Outside Components

```tsx
// Get current state
const findings = await db.state.get('researchFindings')

// Update state
await db.state.set('status', 'processing')

// Get state history
const history = await db.state.history('status')
```

---

## Context API

### RalphContext

Used internally by Ralph and Claude components for task tracking.

```tsx
import { RalphContext } from 'smithers-orchestrator'

interface RalphContextType {
  registerTask: () => void
  completeTask: () => void
}
```

#### Usage (Advanced)

Typically you don't need to use this directly, but it's available for custom components:

```tsx
import { useContext, useEffect } from 'react'
import { RalphContext } from 'smithers-orchestrator'

function CustomAgent() {
  const ralph = useContext(RalphContext)

  useEffect(() => {
    ralph?.registerTask()

    // Do work...

    ralph?.completeTask()
  }, [])

  return <agent>Custom agent</agent>
}
```

---

## Type Definitions

### SmithersNode

The internal tree node structure.

```tsx
interface SmithersNode {
  type: string
  props: Record<string, unknown>
  children: SmithersNode[]
  parent: SmithersNode | null
  key?: string | number
  _execution?: ExecutionState
}
```

### ExecutionState

Tracks execution status.

```tsx
interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown
  error?: Error
  contentHash?: string
}
```

---

## Utility Functions

### serialize()

Serialize a SmithersNode tree to XML.

```tsx
import { serialize } from 'smithers-orchestrator/core'

const xml = serialize(node)
console.log(xml)
```

#### Output Format

```xml
<ralph maxIterations="3">
  <phase name="Setup">
    <claude model="sonnet">
      Initialize the system
    </claude>
  </phase>
</ralph>
```

---

## JSX Intrinsic Elements

TypeScript definitions for custom elements.

```tsx
// These are automatically recognized in .tsx files

<claude model="sonnet">Prompt</claude>
<ralph maxIterations={10}>...</ralph>
<phase name="Research">...</phase>
<step name="Config">...</step>
<persona role="engineer">...</persona>
<constraints>...</constraints>
```

All custom elements support:
- `children` prop
- `key` prop (for Ralph Wiggum loop)
- Custom props via `[key: string]: unknown`

---

## Patterns

### Sequential Workflow Pattern (Recommended)

**Always use unconditional phase rendering.** Phases auto-sequence when one completes.

```tsx
export default function Workflow() {
  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph maxIterations={5}>
        {/* All phases rendered unconditionally */}
        <Phase name="Task 1">
          <Claude>First task</Claude>
        </Phase>
        <Phase name="Task 2">
          <Claude>Second task (starts when Task 1 completes)</Claude>
        </Phase>
        <Phase name="Task 3">
          <Claude>Third task (starts when Task 2 completes)</Claude>
        </Phase>
      </Ralph>
    </SmithersProvider>
  )
}
```

### Conditional Phase Skipping

Use `skipIf` to conditionally skip phases based on runtime conditions.

```tsx
<Ralph maxIterations={5}>
  <Phase name="Build">
    <Claude>Build the project</Claude>
  </Phase>

  <Phase name="Deploy to Staging" skipIf={() => process.env.SKIP_STAGING === 'true'}>
    <Claude>Deploy to staging environment</Claude>
  </Phase>

  <Phase name="Deploy to Production">
    <Claude>Deploy to production</Claude>
  </Phase>
</Ralph>
```

### Parallel Execution Pattern

Use `<Parallel>` component for concurrent step execution within a phase.

```tsx
<Phase name="Build">
  <Parallel>
    <Step name="Frontend">
      <Claude>Build frontend assets</Claude>
    </Step>
    <Step name="Backend">
      <Claude>Build backend services</Claude>
    </Step>
    <Step name="Database">
      <Claude>Run database migrations</Claude>
    </Step>
  </Parallel>
</Phase>
```

### Error Handling Pattern

Use `onError` callbacks for error handling within the sequential flow.

```tsx
<Ralph maxIterations={5}>
  <Phase name="Implementation">
    <Claude
      onError={(error) => {
        console.error('Implementation failed:', error)
        // Error is logged, phase will retry or skip based on configuration
      }}
    >
      Implement the feature
    </Claude>
  </Phase>

  <Phase name="Testing">
    <Claude
      validate={async (result) => {
        // Return false to retry
        return result.includes('PASS')
      }}
    >
      Run tests and verify all pass
    </Claude>
  </Phase>
</Ralph>
```

### Callbacks for Audit Trail

Use `onStart`, `onComplete`, and `onFinished` for logging and side effects.

```tsx
<Ralph maxIterations={5}>
  <Phase
    name="Research"
    onStart={() => console.log('Research phase started')}
    onComplete={() => console.log('Research phase completed')}
  >
    <Claude
      onFinished={(result) => {
        // Store result for later phases
        db.state.set('researchFindings', result)
      }}
    >
      Research the topic
    </Claude>
  </Phase>

  <Phase name="Implementation">
    <Claude>
      Implement based on research findings stored in database.
    </Claude>
  </Phase>
</Ralph>
```

---

## Performance Considerations

### Iteration Timing

Ralph checks for task completion every 10ms by default. For very fast tasks, there's minimal overhead.

### State Updates

React state updates are batched automatically. Use `db.state.set()` to persist state to SQLite for session resumability.

### Memory

Each SmithersNode maintains parent/child references. For very large trees (1000+ nodes), consider breaking into smaller workflows.

---

## Debugging

### Enable Verbose Logging

```tsx
<Ralph
  maxIterations={10}
  onIteration={async (i) => {
    console.log(`[Ralph] Iteration ${i}`)
    const phase = await db.state.get('phase')
    console.log('[Ralph] Current phase:', phase)
  }}
>
  {/* workflow */}
</Ralph>
```

### Track Task Completion

```tsx
<Claude
  onFinished={(result) => {
    console.log('[Claude] Finished:', result)
    setPhase('next')
  }}
  onError={(error) => {
    console.error('[Claude] Error:', error)
  }}
>
  Task
</Claude>
```

### Inspect Tree Structure

```tsx
import { createSmithersRoot } from 'smithers-orchestrator'

const root = createSmithersRoot()
root.mount(() => <MyWorkflow />)

// Inspect tree
console.log(JSON.stringify(root.getTree(), null, 2))

// Serialize to XML
console.log(root.toXML())
```

---

## Migration Guide

### From Traditional Orchestration

**Before:**
```typescript
const plan = [
  { agent: 'researcher', prompt: 'Research topic' },
  { agent: 'implementer', prompt: 'Implement solution' },
  { agent: 'tester', prompt: 'Test implementation' },
]

for (const step of plan) {
  await executeAgent(step)
}
```

**After:**
```tsx
<Ralph maxIterations={3}>
  <Phase name="Research">
    <Claude>Research topic</Claude>
  </Phase>
  <Phase name="Implementation">
    <Claude>Implement solution</Claude>
  </Phase>
  <Phase name="Testing">
    <Claude>Test implementation</Claude>
  </Phase>
</Ralph>
```

**Benefits:**
- Declarative vs imperative
- Type-safe JSX
- Built-in error handling
- Automatic phase sequencing
- Visual plan representation (all phases visible)
- No manual state management for phase transitions

### From Conditional Phase Rendering

**Before (deprecated pattern):**
```tsx
const [phase, setPhase] = useState('research')

<Ralph>
  {phase === 'research' && <Phase name="Research">...</Phase>}
  {phase === 'implement' && <Phase name="Implementation">...</Phase>}
</Ralph>
```

**After (recommended):**
```tsx
<Ralph>
  <Phase name="Research">...</Phase>
  <Phase name="Implementation">...</Phase>
</Ralph>
```

**Why the change:**
- Plan output shows all phases regardless of current state
- Phase component internally tracks active/completed/pending
- No risk of forgetting to add conditional branches
- Simpler, more declarative code

---

## Best Practices

1. **Render phases unconditionally** - Let PhaseRegistry manage active state
2. **Always set maxIterations** - Prevent infinite loops
3. **Use skipIf for conditional phases** - Not conditional rendering
4. **Handle errors** - Provide onError callbacks for logging/recovery
5. **Validate when needed** - Use validate prop for quality checks
6. **Organize with Phase/Step** - Improve readability and structure
7. **Use db.state for custom data** - Persist data needed across phases
8. **Use callbacks for audit trails** - onStart, onComplete, onFinished
9. **Test workflows** - Create test runs with mock executors

---

## Further Reading

- [Smithers Architecture](../../../ARCHITECTURE.md)
- [Testing Guide](../../../TESTING.md)
- [TypeScript Configuration](../../../TYPESCRIPT.md)
- [Integration Guide](../../../INTEGRATION.md)
