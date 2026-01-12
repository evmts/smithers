# Smithers Components

JSX components for building AI agent prompts. Each component renders to an element in the internal SmithersNode tree, which is then serialized to XML for Claude execution.

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Component Types                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Execution Components                              │    │
│  │                                                                      │    │
│  │  <Claude>        - Main execution unit, sends to Claude API         │    │
│  │  <Subagent>      - Parallel execution boundary                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Semantic Components                               │    │
│  │                                                                      │    │
│  │  <Persona>       - Define agent role and expertise                  │    │
│  │  <Constraints>   - Behavioral boundaries                            │    │
│  │  <OutputFormat>  - Expected output structure                        │    │
│  │  <Phase>         - Logical phase grouping                           │    │
│  │  <Step>          - Individual task step                             │    │
│  │  <Task>          - Trackable task with completion state             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Control Flow Components                           │    │
│  │                                                                      │    │
│  │  <Stop>          - Signal to halt execution                         │    │
│  │  <Human>         - Pause for human approval                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Execution Components

### `<Claude>`

The primary execution component. Everything inside becomes the prompt sent to the Claude API.

```tsx
<Claude
  tools={[searchTool, fileTool]}
  onFinished={(result) => setState(result)}
  onError={(error) => handleError(error)}
  system="You are a helpful assistant"
  mcpServers={[filesystemServer]}
  maxToolIterations={10}
  stream={true}
  onStream={(chunk) => console.log(chunk)}
>
  {/* Prompt content */}
</Claude>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `tools` | `Tool[]` | Tools available to Claude |
| `onFinished` | `(output: unknown) => void` | Called when execution completes |
| `onError` | `(error: Error) => void` | Called on execution error |
| `system` | `string` | System prompt override |
| `mcpServers` | `MCPServerConfig[]` | MCP servers to connect |
| `maxToolIterations` | `number` | Max tool loop iterations (default: 10) |
| `stream` | `boolean` | Enable streaming mode |
| `onStream` | `(chunk: StreamChunk) => void` | Streaming chunk callback |
| `retries` | `number` | API retry count (default: 3) |
| `toolRetry` | `ToolRetryOptions` | Tool retry configuration |

### `<Subagent>`

Creates a parallel execution boundary. Multiple Subagent siblings execute concurrently.

```tsx
<Subagent name="researcher" parallel>
  <Claude onFinished={handleResearch}>
    Research the topic...
  </Claude>
</Subagent>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `name` | `string` | Identifier for logs |
| `parallel` | `boolean` | Run concurrently (default: true) |

## Semantic Components

### `<Persona>`

Define the agent's role and expertise. Extracted as the system message.

```tsx
<Persona role="Security Expert">
  You have 10 years of experience in application security.
  You focus on OWASP Top 10 vulnerabilities.
</Persona>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `role` | `string` | The persona's role name |

### `<Constraints>`

Set behavioral boundaries and rules for the agent.

```tsx
<Constraints>
  - Always explain your reasoning
  - Never modify production data
  - Ask for clarification when uncertain
</Constraints>
```

### `<OutputFormat>`

Specify the expected response structure.

```tsx
<OutputFormat schema={{
  type: 'object',
  properties: {
    summary: { type: 'string' },
    issues: { type: 'array' }
  }
}}>
  Return valid JSON matching the schema.
</OutputFormat>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `schema` | `object` | JSON Schema for output validation |

### `<Phase>`

Group steps into logical phases.

```tsx
<Phase name="analysis" completed={analysisComplete}>
  <Step>Read the code</Step>
  <Step>Identify patterns</Step>
</Phase>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `name` | `string` | Phase identifier |
| `completed` | `boolean` | Mark phase as complete (skipped) |

### `<Step>`

Individual task step within a phase.

```tsx
<Step completed={stepDone}>
  Extract key findings from the data
</Step>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `completed` | `boolean` | Mark step as complete (skipped) |

### `<Task>`

Trackable task with completion state.

```tsx
<Task done={taskComplete}>
  Write the implementation
</Task>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `done` | `boolean` | Task completion status |

## Control Flow Components

### `<Stop>`

Signal the Ralph Wiggum loop to halt execution.

```tsx
function Agent() {
  const { isComplete } = useStore()

  return (
    <>
      <Claude onFinished={doWork}>...</Claude>
      {isComplete && <Stop reason="All tasks completed" />}
    </>
  )
}
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `reason` | `string` | Optional reason for stopping |

### `<Human>`

Pause execution for human approval.

```tsx
<Human
  message="Review changes before deploy"
  onApprove={() => setApproved(true)}
  onReject={() => setRejected(true)}
>
  The following files will be modified:
  - src/auth.ts
  - src/api.ts
</Human>
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `message` | `string` | Message to display to user |
| `onApprove` | `() => void` | Called when user approves |
| `onReject` | `() => void` | Called when user rejects |

## Rendering Flow

```
   JSX Component              Internal Type           XML Output
        │                          │                      │
        ▼                          ▼                      ▼
┌─────────────────┐        ┌─────────────┐       ┌───────────────────┐
│ <Claude>        │  ───▶  │ 'claude'    │  ───▶ │ <claude>          │
│ <Persona>       │        │ 'persona'   │       │ <persona>         │
│ <Constraints>   │        │ 'constraints'│      │ <constraints>     │
│ <Phase>         │        │ 'phase'     │       │ <phase>           │
│ <Step>          │        │ 'step'      │       │ <step>            │
│ <Stop>          │        │ 'stop'      │       │ <stop>            │
│ <Human>         │        │ 'human'     │       │ <human>           │
└─────────────────┘        └─────────────┘       └───────────────────┘
```

## Implementation

All components are simple wrappers around `createElement`:

```typescript
export function Claude(props: ClaudeProps): ReactElement {
  return createElement('claude', props)
}

export function Phase(props: PhaseProps): ReactElement {
  return createElement('phase', props)
}
```

The host config in the reconciler handles creating `SmithersNode` instances from these element types.

## Composition Patterns

### Reusable Personas

```tsx
function SecurityExpert({ children }) {
  return (
    <Persona role="Security Expert">
      You have 10 years of application security experience.
      {children}
    </Persona>
  )
}

// Usage
<Claude>
  <SecurityExpert />
  Review this code for vulnerabilities.
</Claude>
```

### Reusable Output Formats

```tsx
function JSONResponse({ schema }) {
  return (
    <OutputFormat schema={schema}>
      Return valid JSON. No markdown, no explanation.
    </OutputFormat>
  )
}
```

### Phase-based Workflows

```tsx
function ReviewWorkflow({ code }) {
  const [phase, setPhase] = useState('analyze')

  if (phase === 'analyze') {
    return (
      <Claude onFinished={() => setPhase('report')}>
        <Phase name="analyze">
          <Step>Read the code</Step>
          <Step>Identify issues</Step>
        </Phase>
      </Claude>
    )
  }

  return (
    <Claude>
      <Phase name="report">
        Generate the final report
      </Phase>
    </Claude>
  )
}
```
