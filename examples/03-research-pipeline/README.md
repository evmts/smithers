# Research Pipeline

A multi-phase research agent using Zustand for state management. Demonstrates the "Ralph Wiggum loop" pattern.

## What This Example Shows

- **Multi-phase workflows** with distinct gather, analyze, and report phases
- **Zustand state management** for tracking progress and data between phases
- **The Ralph Wiggum loop** - automatic re-rendering and re-execution as state changes
- **Phase transitions** via callbacks (`onFinished`)
- **Data flow** between phases through shared state

## The Ralph Wiggum Loop

Named after the Simpsons character who keeps doing something until it works, the Ralph Wiggum loop is Smithers' execution model:

1. Render the JSX component to an XML plan
2. Execute any pending `<Claude>` components
3. When `onFinished` fires, it may update state (Zustand/React)
4. State changes trigger a re-render, producing a new plan
5. Repeat until no more `<Claude>` components need execution

```
Initial Render -> Execute Claude -> State Change -> Re-render -> Execute Claude -> ...
```

## State Management with Zustand

```tsx
import { create } from 'zustand'

const useResearchStore = create<ResearchState>((set, get) => ({
  phase: 'gather',
  sources: [],
  analysis: null,

  setSources: (sources) => set({ sources }),
  setAnalysis: (analysis) => set({ analysis }),
  nextPhase: () => {
    const transitions = { gather: 'analyze', analyze: 'report', report: 'done' }
    set({ phase: transitions[get().phase] })
  },
}))
```

## Phase Components

Each phase is a separate component that:
1. Reads current state from Zustand
2. Renders a Claude component with phase-specific instructions
3. Updates state in `onFinished` callback
4. Triggers transition to next phase

```tsx
function GatherPhase({ topic }) {
  const { setSources, nextPhase } = useResearchStore()

  return (
    <Claude
      tools={[webSearchTool]}
      onFinished={(result) => {
        setSources(result.sources)
        nextPhase() // Move to 'analyze'
      }}
    >
      <Phase name="gather">
        <Step>Search for sources about: {topic}</Step>
      </Phase>
    </Claude>
  )
}
```

## The Orchestrator

The main component switches between phases based on state:

```tsx
function ResearchPipeline({ topic }) {
  const { phase } = useResearchStore()

  switch (phase) {
    case 'gather':
      return <GatherPhase topic={topic} />
    case 'analyze':
      return <AnalyzePhase />
    case 'report':
      return <ReportPhase topic={topic} />
    case 'done':
      return null // Loop ends when no Claude components
  }
}
```

## Running

```bash
# Default topic
bun run examples/03-research-pipeline/agent.tsx

# Custom topic
bun run examples/03-research-pipeline/agent.tsx "quantum computing applications"
```

## Execution Flow

```
[Frame 1] Phase: gather
  - Claude searches for sources
  - onFinished: setSources([...]), nextPhase()
  - State: { phase: 'analyze', sources: [...] }

[Frame 2] Phase: analyze
  - Claude analyzes sources
  - onFinished: setAnalysis({...}), nextPhase()
  - State: { phase: 'report', analysis: {...} }

[Frame 3] Phase: report
  - Claude writes report
  - onFinished: setReport('...'), nextPhase()
  - State: { phase: 'done', report: '...' }

[Frame 4] Phase: done
  - No Claude components, loop ends
```

## Why Zustand?

Smithers recommends Zustand over `useState` for multi-phase agents:

1. **External state** - Zustand stores state outside React, making it accessible from `onFinished` callbacks
2. **Predictable updates** - Direct mutations via actions, no batching surprises
3. **Debugging** - Easy to inspect full state at any point
4. **Testability** - Can reset/mock store state in tests

## Next Steps

See [04-parallel-research](../04-parallel-research/) to learn about parallel execution with Subagent.
