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

Semantic grouping component for workflow organization.

```tsx
<Phase name="Research">
  {children}
</Phase>
```

#### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | `string` | No | - | Phase name for identification |
| `children` | `JSX.Element` | No | - | Child components |

#### Purpose

Phases provide semantic structure to workflows. They:
- Group related agents
- Improve plan readability
- Help with XML serialization
- Provide logical organization

#### Example

```tsx
<Phase name="Setup">
  <Claude>Initialize configuration</Claude>
  <Claude>Verify environment</Claude>
</Phase>

<Phase name="Implementation">
  <Claude>Write code</Claude>
  <Claude>Add tests</Claude>
</Phase>
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

### Database State (db.state)

Smithers uses SQLite for persistent state management, enabling session resumability.

#### Basic Usage

```tsx
import { useState } from 'react'
import { createSmithersDB } from 'smithers-orchestrator/db'

// Initialize database
const db = await createSmithersDB({ path: '.smithers/db' })

// In component - use React state + db.state for persistence
function Workflow() {
  const [phase, setPhase] = useState('start')
  const [data, setData] = useState(null)

  const updatePhase = async (newPhase: string) => {
    setPhase(newPhase)
    await db.state.set('phase', newPhase) // Persist to SQLite
  }

  const updateData = async (newData: unknown) => {
    setData(newData)
    await db.state.set('data', newData)
  }

  // ...
}
```

#### TypeScript

```tsx
// State is typed via db.state generic
const phase = await db.state.get<string>('phase')
const data = await db.state.get<MyDataType>('data')

// Or with default value
const phase = await db.state.get('phase', 'start')
```

#### Usage in Components

```tsx
function Workflow() {
  const [phase, setPhase] = useState('start')

  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph maxIterations={10}>
        {phase === 'start' && (
          <Claude onFinished={async () => {
            setPhase('next')
            await db.state.set('phase', 'next')
          }}>
            Start task
          </Claude>
        )}
      </Ralph>
    </SmithersProvider>
  )
}
```

#### Access Outside Components

```tsx
// Get current state
const currentPhase = await db.state.get('phase')

// Update state
await db.state.set('phase', 'new-phase')

// Get state history
const history = await db.state.history('phase')
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

### Sequential Workflow Pattern

```tsx
import { useState } from 'react'

export default function Workflow() {
  const [phase, setPhase] = useState('step1')

  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph maxIterations={5}>
        {phase === 'step1' && (
          <Claude onFinished={async () => {
            setPhase('step2')
            await db.state.set('phase', 'step2')
          }}>Task 1</Claude>
        )}
        {phase === 'step2' && (
          <Claude onFinished={async () => {
            setPhase('step3')
            await db.state.set('phase', 'step3')
          }}>Task 2</Claude>
        )}
        {phase === 'step3' && (
          <Claude onFinished={async () => {
            setPhase('done')
            await db.state.set('phase', 'done')
          }}>Task 3</Claude>
        )}
      </Ralph>
    </SmithersProvider>
  )
}
```

### Conditional Branch Pattern

```tsx
<Claude onFinished={(result) => {
  if (result.success) {
    setPhase('success-path')
  } else {
    setPhase('retry-path')
  }
}}>
  Attempt task
</Claude>
```

### Parallel Execution Pattern

```tsx
<Phase name="Parallel Work">
  <Claude onFinished={() => incrementComplete()}>Task 1</Claude>
  <Claude onFinished={() => incrementComplete()}>Task 2</Claude>
  <Claude onFinished={() => incrementComplete()}>Task 3</Claude>
</Phase>
```

### Data Flow Pattern

```tsx
import { useState } from 'react'

function DataWorkflow() {
  const [phase, setPhase] = useState('research')
  const [researchData, setResearchData] = useState(null)
  const [implementationResult, setImplementationResult] = useState(null)

  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph maxIterations={5}>
        {/* Phase 1: Collect data */}
        {phase === 'research' && (
          <Claude onFinished={async (result) => {
            setResearchData(result)
            await db.state.set('researchData', result)
            setPhase('implement')
            await db.state.set('phase', 'implement')
          }}>
            Research the topic
          </Claude>
        )}

        {/* Phase 2: Use collected data */}
        {phase === 'implement' && (
          <Claude onFinished={async (result) => {
            setImplementationResult(result)
            await db.state.set('implementationResult', result)
            setPhase('done')
            await db.state.set('phase', 'done')
          }}>
            Implement using research: {JSON.stringify(researchData)}
          </Claude>
        )}
      </Ralph>
    </SmithersProvider>
  )
}
```

### Error Recovery Pattern

```tsx
import { useState } from 'react'

function RetryWorkflow() {
  const [phase, setPhase] = useState('attempt')
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Ralph maxIterations={10}>
        {phase === 'attempt' && (
          <Claude
            onFinished={async () => {
              setPhase('success')
              await db.state.set('phase', 'success')
            }}
            onError={async (error) => {
              if (retryCount < maxRetries) {
                setRetryCount(retryCount + 1)
                await db.state.set('retryCount', retryCount + 1)
                // Phase stays 'attempt' to retry
              } else {
                setPhase('failed')
                await db.state.set('phase', 'failed')
              }
            }}
          >
            Attempt task
          </Claude>
        )}
      </Ralph>
    </SmithersProvider>
  )
}
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
  {phase === 'research' && (
    <Claude onFinished={() => setPhase('implement')}>
      Research topic
    </Claude>
  )}
  {phase === 'implement' && (
    <Claude onFinished={() => setPhase('test')}>
      Implement solution
    </Claude>
  )}
  {phase === 'test' && (
    <Claude onFinished={() => setPhase('done')}>
      Test implementation
    </Claude>
  )}
</Ralph>
```

**Benefits:**
- Declarative vs imperative
- Type-safe JSX
- Built-in error handling
- Automatic remount loop
- Visual plan representation

---

## Best Practices

1. **Always set maxIterations** - Prevent infinite loops
2. **Use terminal states** - Ensure workflows can complete
3. **Handle errors** - Always provide onError callbacks
4. **Validate when needed** - Use validate prop for quality checks
5. **Organize with Phase/Step** - Improve readability
6. **Use React useState with db.state** - Persist critical state to SQLite
7. **Test workflows** - Create test runs with mock executors
8. **Document phases** - Add comments explaining workflow logic

---

## Further Reading

- [Smithers Architecture](../../../ARCHITECTURE.md)
- [Testing Guide](../../../TESTING.md)
- [TypeScript Configuration](../../../TYPESCRIPT.md)
- [Integration Guide](../../../INTEGRATION.md)
