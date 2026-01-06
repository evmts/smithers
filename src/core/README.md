# Smithers Core

The core module contains the fundamental building blocks of Smithers: types, rendering, and execution. This is where the "Ralph Wiggum Loop" lives.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Smithers Core                                      │
│                                                                               │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐   │
│  │   types.ts  │   │  render.ts  │   │ execute.ts  │   │claude-executor.ts│  │
│  │             │   │             │   │             │   │                  │   │
│  │ Interfaces  │◄──│ Serialize   │◄──│ Ralph Loop  │──▶│ Claude API       │   │
│  │ & Types     │   │ & Render    │   │             │   │ Integration      │   │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Files

### `types.ts` - Core Type Definitions

All TypeScript interfaces and types used throughout Smithers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Types                                       │
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │    SmithersNode       │    │  ExecutionState  │    │     Tool         │   │
│  │                  │    │                  │    │                  │   │
│  │  type: string    │    │  status: enum    │    │  name: string    │   │
│  │  props: {}       │    │  result?: any    │    │  description     │   │
│  │  children: []    │    │  error?: Error   │    │  input_schema    │   │
│  │  parent: node    │    │  contentHash?    │    │  execute?: fn    │   │
│  │  _execution?     │    │                  │    │                  │   │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘   │
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │  ClaudeProps     │    │ ExecuteOptions   │    │ ExecutionResult  │   │
│  │                  │    │                  │    │                  │   │
│  │  tools?: Tool[]  │    │  maxFrames?      │    │  output: any     │   │
│  │  onFinished?: fn │    │  timeout?        │    │  frames: number  │   │
│  │  onError?: fn    │    │  mockMode?       │    │  totalDuration   │   │
│  │  system?: string │    │  onPlan?: fn     │    │  history: []     │   │
│  │  mcpServers?     │    │  onFrame?: fn    │    │  mcpServers?     │   │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key types:**
- `SmithersNode` - The internal tree node representation
- `ExecutionState` - Tracks node execution status
- `ClaudeProps`, `SubagentProps`, etc. - Component prop types
- `ExecuteOptions` - Configuration for `executePlan()`
- `Tool` - Tool definition for Claude

### `render.ts` - Rendering & Serialization

Converts React elements to SmithersNode trees and serializes to XML:

```
            React Element                      XML Plan
                  │                                │
                  ▼                                ▼
    ┌─────────────────────────┐    ┌─────────────────────────┐
    │   <Claude>              │    │   <claude>              │
    │     <Persona role="X">  │    │     <persona role="X">  │
    │       Expert            │    │       Expert            │
    │     </Persona>          │ ─▶ │     </persona>          │
    │     Do the task         │    │     Do the task         │
    │   </Claude>             │    │   </claude>             │
    └─────────────────────────┘    └─────────────────────────┘
```

**Functions:**
- `createRoot()` - Create a new reconciler root
- `renderPlan(element)` - Render element and serialize to XML
- `serialize(node)` - Convert SmithersNode tree to XML string

### `execute.ts` - The Ralph Wiggum Loop

The execution engine that runs the agent through multiple render-execute cycles:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Ralph Wiggum Loop                                   │
│                                                                               │
│    Frame 1              Frame 2              Frame 3              Done        │
│   ┌──────┐             ┌──────┐             ┌──────┐                          │
│   │Render│             │Render│             │Render│                          │
│   └──┬───┘             └──┬───┘             └──┬───┘                          │
│      │                    │                    │                              │
│      ▼                    ▼                    ▼                              │
│   ┌──────┐             ┌──────┐             ┌──────┐                          │
│   │Serial│             │Serial│             │Serial│                          │
│   │ize   │             │ize   │             │ize   │                          │
│   └──┬───┘             └──┬───┘             └──┬───┘                          │
│      │                    │                    │                              │
│      ▼                    ▼                    ▼                              │
│   ┌──────┐             ┌──────┐             ┌──────┐                          │
│   │ Find │             │ Find │             │ Find │                          │
│   │Pend- │             │Pend- │             │Pend- │                          │
│   │ ing  │             │ ing  │             │ ing  │                          │
│   └──┬───┘             └──┬───┘             └──┬───┘                          │
│      │ 2 nodes            │ 1 node            │ 0 nodes                       │
│      ▼                    ▼                    ▼                              │
│   ┌──────┐             ┌──────┐             ┌──────┐                          │
│   │Exec  │──callback──▶│Exec  │──callback──▶│ EXIT │                          │
│   │ute   │  (setState) │ute   │  (setState) │      │                          │
│   └──────┘             └──────┘             └──────┘                          │
│                                                                               │
│   State: phase='research'  State: phase='analyze'  State: phase='done'       │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key functions:**
- `executePlan(element, options)` - Run the Ralph loop
- `findPendingExecutables(tree)` - Find nodes ready for execution
- `findStopNode(tree)` - Check for `<Stop>` component
- `findHumanNode(tree)` - Check for `<Human>` component
- `executeNode(node, ...)` - Execute a single claude/subagent node

**Execution state tracking:**
```
            Node first seen           After execution
          ┌─────────────────┐       ┌─────────────────┐
          │ _execution:     │       │ _execution:     │
          │   undefined     │  ──▶  │   status: 'complete'
          │                 │       │   result: '...'  │
          │                 │       │   contentHash    │
          └─────────────────┘       └─────────────────┘
```

### `claude-executor.ts` - Claude API Integration

Handles the actual Claude API calls with full agentic loop support:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Claude Executor                                      │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                        Agentic Tool Loop                                │  │
│  │                                                                         │  │
│  │    User Message         Claude Response        Tool Execution           │  │
│  │   ┌───────────┐        ┌───────────────┐      ┌───────────────┐        │  │
│  │   │  Prompt   │  ───▶  │ Text + Tool   │ ───▶ │ Execute Tools │        │  │
│  │   │           │        │    Calls      │      │ with Retry    │        │  │
│  │   └───────────┘        └───────────────┘      └───────┬───────┘        │  │
│  │                               ▲                        │               │  │
│  │                               │                        │               │  │
│  │                               └────────────────────────┘               │  │
│  │                              (Loop until stop_reason='end_turn')       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  Features:                                                                    │
│  - Rate limit handling with exponential backoff                              │
│  - Tool retry with configurable options                                      │
│  - Streaming support                                                         │
│  - System message extraction from <Persona>                                  │
│  - Enhanced error context                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key functions:**
- `executeWithClaude(node, config, tools)` - Execute via Claude API
- `createExecutionError(message, options)` - Create detailed error
- `getNodePath(node)` - Get path string for error context

**Configuration:**
```typescript
interface ClaudeConfig {
  apiKey?: string       // Defaults to ANTHROPIC_API_KEY
  model?: string        // Defaults to claude-sonnet-4-5-20250929
  maxTokens?: number    // Defaults to 8192
}
```

## Execution Flow

```
executePlan(<MyAgent />)
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. Create reconciler root                                                   │
│     const root = createRoot()                                               │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. Render element (React reconciliation)                                    │
│     const tree = await root.render(<MyAgent />)                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. Check for Stop/Human nodes                                              │
│     if (findStopNode(tree)) break                                           │
│     if (findHumanNode(tree)) await promptUser()                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. Find pending executables                                                │
│     const pending = findPendingExecutables(tree)                            │
│     // Returns nodes where _execution is undefined or 'pending'             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. Execute nodes                                                           │
│     - Claude nodes: sequential                                              │
│     - Subagent nodes: parallel                                              │
│     await executeNode(node, mcpManager, callback)                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  6. Handle callbacks                                                        │
│     onFinished() -> state changes -> triggers re-render                     │
│     Loop back to step 2                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  7. Return results                                                          │
│     { output, frames, totalDuration, history, mcpServers }                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Mock Mode

For testing without API calls:

```typescript
// Enable mock mode
process.env.SMITHERS_MOCK_MODE = 'true'

// Or via node prop
<Claude _mockMode={true}>...</Claude>
```

Mock mode returns intelligent responses based on prompt content:
- Detects JSON output format requests
- Returns appropriate mock data structures
- Simulates failures for prompts containing "fail intentionally"

## Content Hash Change Detection

The execution loop uses content hashing to detect when a node needs re-execution:

```typescript
// Node is re-executed if:
// 1. _execution is undefined
// 2. _execution.status is 'pending'
// 3. Content hash has changed (props or children modified)

const hash = computeContentHash(node)
// Hash includes: type, non-function props, children text
```

This allows the Ralph loop to skip already-executed nodes and only run nodes whose content has changed since last execution.
