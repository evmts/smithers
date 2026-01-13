# Research Pipeline

A multi-phase research agent using SolidJS Store for state management. Demonstrates the "Ralph Wiggum loop" pattern.

## What This Example Shows

- **Multi-phase workflows** with distinct gather, analyze, and report phases
- **SolidJS Store state management** for tracking progress and data between phases
- **The Ralph Wiggum loop** - automatic re-rendering and re-execution as state changes
- **Phase transitions** via callbacks (`onFinished`)
- **Data flow** between phases through shared state

## The Ralph Wiggum Loop

Named after the Simpsons character who keeps doing something until it works, the Ralph Wiggum loop is Smithers' execution model:

1. Render the JSX component to an XML plan
2. Execute any pending `<Claude>` components
3. When `onFinished` fires, it updates SolidJS signals/stores
4. State changes trigger a re-render via fine-grained reactivity, producing a new plan
5. Repeat until no more `<Claude>` components need execution

```
Initial Render -> Execute Claude -> State Change -> Re-render -> Execute Claude -> ...
```

## State Management with SolidJS Store

```tsx
import { createStore } from 'solid-js/store'

const [store, setStore] = createStore({
  phase: 'gather',
  sources: [],
  analysis: null,
})

const actions = {
  setSources: (sources) => setStore('sources', sources),
  setAnalysis: (analysis) => setStore('analysis', analysis),
  nextPhase: () => {
    const transitions = { gather: 'analyze', analyze: 'report', report: 'done' }
    setStore('phase', transitions[store.phase])
  },
}
```

## Phase Components

Each phase is a separate component that:
1. Reads current state from the store
2. Renders a Claude component with phase-specific instructions
3. Updates state in `onFinished` callback
4. Triggers transition to next phase

```tsx
function GatherPhase({ topic }) {
  return (
    <Claude
      tools={[webSearchTool]}
      onFinished={(result) => {
        actions.setSources(result.sources)
        actions.nextPhase() // Move to 'analyze'
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

The main component switches between phases based on state. Note the return of a closure `() => ...` to ensure reactivity:

```tsx
function ResearchPipeline({ topic }) {
  return () => {
    switch (store.phase) {
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

## Why SolidJS?

Smithers uses SolidJS over React for state management because:

1. **Fine-grained reactivity** - Updates only what changes, no full VDOM re-renders
2. **No stale closures** - Signals always return current value
3. **Performance** - Efficient execution loop
4. **Simple API** - `createSignal` and `createStore` cover most use cases without complex providers

## Next Steps

See [04-parallel-research](../04-parallel-research/) to learn about parallel execution with Subagent.