# Parallel Research

Demonstrates parallel execution using Subagent. Multiple research topics are investigated concurrently by separate agents, then synthesized into a final report.

## What This Example Shows

- **Subagent** component for parallel execution boundaries
- **Multiple concurrent agents** researching different topics
- **State coordination** for tracking parallel task completion
- **Synthesis phase** that combines results from parallel agents

## The Subagent Component

`<Subagent>` creates a parallel execution boundary. All Claude components inside a Subagent can run concurrently with other Subagents:

```tsx
function TopicResearcher({ topic }) {
  return (
    <Subagent name={`researcher-${topic}`} parallel>
      <Claude onFinished={handleComplete}>
        Research: {topic}
      </Claude>
    </Subagent>
  )
}

// Multiple researchers run in parallel
function ResearchPhase({ topics }) {
  return (
    <>
      {topics.map(topic => (
        <TopicResearcher key={topic} topic={topic} />
      ))}
    </>
  )
}
```

## How Parallel Execution Works

1. **Render phase**: All components render, producing multiple Subagent nodes
2. **Execution phase**: Smithers identifies parallel Subagents and executes them concurrently
3. **Completion tracking**: Each agent updates shared state when complete
4. **Coordination**: The orchestrator waits for all parallel tasks before proceeding

```
[Frame 1] Render -> 4 parallel Subagents
          |-> Research Topic A (concurrent)
          |-> Research Topic B (concurrent)
          |-> Research Topic C (concurrent)
          |-> Research Topic D (concurrent)

[Frame 2] All complete -> Synthesize Phase
          |-> Single Claude combines results
```

## State Coordination

Zustand manages coordination between parallel agents:

```tsx
const useStore = create((set, get) => ({
  topics: [],

  updateTopic: (topic, data) =>
    set((state) => ({
      topics: state.topics.map((t) =>
        t.topic === topic ? { ...t, ...data } : t
      ),
    })),

  nextPhase: () => {
    const { phase, topics } = get()
    // Only proceed when ALL topics are complete
    if (phase === 'research') {
      const allComplete = topics.every((t) => t.status === 'complete')
      if (allComplete) {
        set({ phase: 'synthesize' })
      }
    }
  },
}))
```

## Running

```bash
# Default topics (4 AI research topics)
bun run examples/04-parallel-research/agent.tsx

# Custom topics
bun run examples/04-parallel-research/agent.tsx "Topic 1" "Topic 2" "Topic 3"
```

## Execution Flow

```
[Initialize]
  topics: [A, B, C, D] (all pending)

[Frame 1 - Parallel]
  Start: TopicResearcher for A, B, C, D (concurrent)
  Complete: A finishes first, status -> complete
  Complete: C finishes, status -> complete
  Complete: B finishes, status -> complete
  Complete: D finishes, status -> complete
  All complete -> nextPhase() -> synthesize

[Frame 2 - Sequential]
  Start: Synthesizer
  Complete: Final report generated
  -> done
```

## Subagent Properties

| Prop | Type | Description |
|------|------|-------------|
| `name` | string | Unique identifier for the subagent |
| `parallel` | boolean | Enable parallel execution (default: true) |
| `children` | ReactNode | Claude components to execute |

## Best Practices

1. **Unique names**: Give each Subagent a unique name for debugging
2. **State isolation**: Each parallel agent should only update its own portion of state
3. **Completion tracking**: Use a coordination mechanism (like `nextPhase()`) to detect when all parallel tasks complete
4. **Error handling**: Handle errors in individual agents without crashing the whole system

## Performance Considerations

- Parallel execution can significantly reduce total time for independent tasks
- Be mindful of API rate limits when running many agents concurrently
- Consider adding timeouts for long-running parallel tasks

## Next Steps

See [05-dev-team](../05-dev-team/) for a complete multi-agent system with Architect, Developer, and Reviewer roles.
