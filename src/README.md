# Smithers Source Code

The source code for Smithers - a React-based framework for authoring composable AI agent prompts using JSX.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Smithers Architecture                               │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                              User Code                                   │   │
│   │                                                                          │   │
│   │    function MyAgent() {                                                  │   │
│   │      const [phase, setPhase] = useState('start')                        │   │
│   │      return (                                                            │   │
│   │        <Claude onFinished={() => setPhase('done')}>                     │   │
│   │          <Persona role="Expert">...</Persona>                           │   │
│   │          Do the task                                                    │   │
│   │        </Claude>                                                        │   │
│   │      )                                                                  │   │
│   │    }                                                                    │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                       │                                          │
│                                       ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                           Components Layer                               │   │
│   │                          (src/components/)                               │   │
│   │                                                                          │   │
│   │   Claude • Subagent • Phase • Step • Persona • Constraints • OutputFormat│   │
│   │                          Stop • Human • Task                             │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                       │                                          │
│                                       ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                           Reconciler Layer                               │   │
│   │                          (src/reconciler/)                               │   │
│   │                                                                          │   │
│   │   React Reconciler  ──▶  SmithersNode Tree  ──▶  XML Serialization       │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                       │                                          │
│                                       ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                            Core Layer                                    │   │
│   │                            (src/core/)                                   │   │
│   │                                                                          │   │
│   │   renderPlan() ──▶ executePlan() ──▶ Ralph Wiggum Loop ──▶ Claude API   │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                       │                                          │
│                          ┌────────────┴────────────┐                            │
│                          ▼                         ▼                            │
│   ┌────────────────────────────────┐  ┌────────────────────────────────┐       │
│   │          MCP Layer             │  │          CLI Layer             │       │
│   │         (src/mcp/)             │  │         (src/cli/)             │       │
│   │                                │  │                                │       │
│   │   MCPManager • Tool Discovery  │  │   Commands • Loader • Config   │       │
│   │   Stdio/HTTP Transports        │  │   TSX/MDX File Loading         │       │
│   └────────────────────────────────┘  └────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── index.ts              # Main entry point (exports public API)
│
├── reconciler/           # Custom React reconciler
│   ├── host-config.ts    # React reconciler host config
│   └── index.ts          # createSmithersRoot() export
│
├── core/                 # Core execution engine
│   ├── types.ts          # TypeScript interfaces
│   ├── render.ts         # renderPlan(), serialize()
│   ├── execute.ts        # executePlan(), Ralph Wiggum loop
│   └── claude-executor.ts # Claude API integration
│
├── components/           # JSX components
│   └── index.ts          # Claude, Subagent, Phase, etc.
│
├── mcp/                  # Model Context Protocol
│   ├── manager.ts        # MCPManager class
│   ├── presets.ts        # Pre-configured servers
│   ├── types.ts          # MCP types
│   └── index.ts          # Exports
│
└── cli/                  # Command-line interface
    ├── index.ts          # CLI entry point
    ├── loader.ts         # TSX/MDX file loading
    ├── config.ts         # Configuration loading
    ├── display.ts        # Terminal output
    └── commands/         # Individual commands
        ├── run.ts        # smithers run
        ├── plan.ts       # smithers plan
        └── init.ts       # smithers init
```

## The Ralph Wiggum Loop

The core execution model:

```
     ┌──────────────────────────────────────────────────────────────────────┐
     │                                                                      │
     │  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐            │
     │  │   Render    │ ──▶ │  Serialize  │ ──▶ │   Execute   │            │
     │  │   JSX       │     │   to XML    │     │   Claude    │            │
     │  └─────────────┘     └─────────────┘     └──────┬──────┘            │
     │         ▲                                       │                    │
     │         │                                       ▼                    │
     │         │                              ┌─────────────┐               │
     │         │                              │  onFinished │               │
     │         │                              │  callback   │               │
     │         │                              └──────┬──────┘               │
     │         │                                     │                      │
     │         │                                     ▼                      │
     │         │                              ┌─────────────┐               │
     │         └──────────────────────────────│   State     │               │
     │                                        │   Update    │               │
     │                                        └─────────────┘               │
     │                                                                      │
     │    Loop continues until no more pending <Claude> nodes              │
     └──────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
   JSX Element              SmithersNode Tree              XML Plan
       │                           │                          │
       ▼                           ▼                          ▼
┌─────────────┐           ┌─────────────────┐         ┌─────────────┐
│ <Claude>    │           │ ROOT            │         │ <claude>    │
│   <Persona> │  ──────▶  │   └─ claude     │ ──────▶ │   <persona> │
│     Expert  │           │       └─ persona│         │     Expert  │
│   </Persona>│           │           └─TEXT│         │   </persona>│
│ </Claude>   │           │                 │         │ </claude>   │
└─────────────┘           └─────────────────┘         └─────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ Execute with    │
                          │ Claude API      │
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ "Hello! I'm an  │
                          │  expert..."     │
                          └─────────────────┘
```

## Key Concepts

### SmithersNode

The internal tree representation:

```typescript
interface SmithersNode {
  type: string                      // 'claude', 'phase', 'persona', etc.
  props: Record<string, unknown>    // Component props
  children: SmithersNode[]          // Child nodes
  parent: SmithersNode | null       // Parent reference
  _execution?: ExecutionState       // Execution tracking
}
```

### ExecutionState

Tracks node execution status:

```typescript
interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown                  // Claude response
  error?: Error                     // Error if failed
  contentHash?: string              // For change detection
}
```

### Tool

Tool definitions for Claude:

```typescript
interface Tool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  execute?: (input: unknown) => Promise<unknown>
}
```

## See Also

Each subdirectory has its own README with detailed documentation:

- [reconciler/README.md](./reconciler/README.md) - React reconciler details
- [core/README.md](./core/README.md) - Execution engine
- [components/README.md](./components/README.md) - Component reference
- [mcp/README.md](./mcp/README.md) - MCP integration
- [cli/README.md](./cli/README.md) - CLI documentation
