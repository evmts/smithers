# Smithers Examples

This directory contains working examples demonstrating Smithers framework features, from basic usage to complex multi-agent systems.

## Quick Start

Each example is a standalone `.tsx` file that can be run directly:

```bash
bun run examples/01-hello-world/agent.tsx
```

## Examples Overview

| # | Example | Concepts | Difficulty |
|---|---------|----------|------------|
| 00 | [**Feature Workflow**](./00-feature-workflow/) | Human-in-loop, POC-driven, TDD flow, Extended thinking | **Flagship** |
| 01 | [Hello World](./01-hello-world/) | Basic Claude component | Beginner |
| 02 | [Code Review](./02-code-review/) | Tools, Constraints, OutputFormat | Beginner |
| 03 | [Research Pipeline](./03-research-pipeline/) | Multi-phase, Zustand state, Ralph loop | Intermediate |
| 04 | [Parallel Research](./04-parallel-research/) | Subagent, parallel execution | Intermediate |
| 05 | [Dev Team](./05-dev-team/) | Multi-agent orchestration | Advanced |

## Learning Path

### 0. Feature Workflow - The Complete Example

**Start here if you want to see everything Smithers can do.** This flagship example demonstrates a production-grade development workflow:

```tsx
function FeatureWorkflow({ prompt }) {
  const { phase, nextPhase, setPhase } = useWorkflowStore()

  switch (phase) {
    case 'prompt-input':
      return (
        <Human message="Review feature request" onApprove={() => nextPhase()} onReject={() => setPhase('cancelled')}>
          Feature: {prompt}
        </Human>
      )

    case 'research':
      return <Claude allowedTools={['Read', 'Glob', 'Grep']} onFinished={() => nextPhase()}>Research the codebase...</Claude>

    case 'planning':
      return <Claude onFinished={(plan) => { setState({ plan }); nextPhase() }}>Create implementation plan...</Claude>

    case 'poc':
      return <Claude allowedTools={['Read', 'Write', 'Edit', 'Bash']} onFinished={() => nextPhase()}>Build POC...</Claude>

    case 'poc-analysis':
      return <Claude maxThinkingTokens={16000} onFinished={() => nextPhase()}>Deep analysis with extended thinking...</Claude>

    case 'api-impl':
      return <Claude onFinished={() => nextPhase()}>Implement types (throw not implemented)...</Claude>

    case 'test-impl':
      return <Claude onFinished={() => nextPhase()}>Write tests (should fail)...</Claude>

    case 'implementation':
      return <Claude onFinished={() => nextPhase()}>Implement until tests pass...</Claude>

    case 'done':
      return null
  }
}
```

Concepts demonstrated:
- Human-in-the-loop approval gates
- 9-phase workflow with state machine
- Extended thinking for deep analysis
- POC-driven plan refinement
- TDD flow (types → tests fail → implementation passes)

### 1. Hello World - The Basics

Start here to understand the fundamental pattern:

```tsx
import { executePlan, Claude } from 'smithers'

function HelloWorld() {
  return (
    <Claude>
      You are a friendly assistant.
    </Claude>
  )
}

await executePlan(<HelloWorld />)
```

### 2. Code Review - Tools and Structure

Learn how to give agents capabilities and structured output:

```tsx
<Claude tools={[fileSystem, grep]}>
  <Constraints>
    - Focus on security issues
  </Constraints>

  <Phase name="review">
    <Step>Read changed files</Step>
  </Phase>

  <OutputFormat schema={reviewSchema}>
    Return JSON with issues array.
  </OutputFormat>
</Claude>
```

### 3. Research Pipeline - State and Phases

Understand the Ralph Wiggum loop and state-driven re-rendering:

```tsx
const useStore = create((set) => ({
  phase: 'gather',
  nextPhase: () => set({ phase: 'analyze' }),
}))

function Pipeline() {
  const { phase, nextPhase } = useStore()

  if (phase === 'gather') {
    return <Claude onFinished={nextPhase}>Gather data</Claude>
  }
  // ... more phases
}
```

### 4. Parallel Research - Concurrent Agents

Run multiple agents in parallel with Subagent:

```tsx
function ParallelResearch({ topics }) {
  return (
    <>
      {topics.map(topic => (
        <Subagent key={topic} name={topic} parallel>
          <Claude>Research: {topic}</Claude>
        </Subagent>
      ))}
    </>
  )
}
```

### 5. Dev Team - Full Orchestration

Build complex multi-agent systems with specialized roles:

```tsx
function DevTeam({ task }) {
  const { stage } = useDevTeam()

  switch (stage) {
    case 'planning':
      return <Architect task={task} />
    case 'implementing':
      return <Developer subtask={currentSubtask} />
    case 'reviewing':
      return <Reviewer />
  }
}
```

## Key Concepts

### The Claude Component

The core building block - wraps the Claude SDK:

```tsx
<Claude
  tools={[tool1, tool2]}      // Available tools
  onFinished={(result) => {}} // Called when complete
  onError={(error) => {}}     // Called on error
>
  {/* Prompt content */}
</Claude>
```

### Semantic Components

Structure your prompts with semantic components:

- `<Persona role="...">` - Define the agent's identity
- `<Constraints>` - Rules and guidelines
- `<Phase name="...">` - Workflow phases
- `<Step>` - Individual steps within phases
- `<OutputFormat>` - Expected response structure

### The Ralph Wiggum Loop

Smithers' execution model:

1. Render JSX to XML plan
2. Execute pending Claude components
3. `onFinished` callbacks update state
4. State change triggers re-render
5. Repeat until no pending Claude components

### State Management

Use Zustand for predictable state across phases:

```tsx
import { create } from 'zustand'

const useStore = create((set) => ({
  phase: 'start',
  data: null,
  setData: (data) => set({ data }),
  nextPhase: () => set({ phase: 'next' }),
}))
```

## Running Examples

```bash
# Feature Workflow - The Flagship Example (with custom feature)
bun run examples/00-feature-workflow/agent.tsx "Add user authentication"

# Hello World
bun run examples/01-hello-world/agent.tsx

# Code Review (with custom path)
bun run examples/02-code-review/agent.tsx ./src

# Research Pipeline (with custom topic)
bun run examples/03-research-pipeline/agent.tsx "quantum computing"

# Parallel Research (with custom topics)
bun run examples/04-parallel-research/agent.tsx "AI" "ML" "NLP"

# Dev Team (with custom task)
bun run examples/05-dev-team/agent.tsx "Build a REST API"
```

## Project Structure

```
examples/
  00-feature-workflow/
    agent.tsx       # The flagship example
    README.md       # Full documentation
  01-hello-world/
    agent.tsx       # Runnable agent
    README.md       # Explanation
  02-code-review/
    agent.tsx
    README.md
  ...
```

## Additional Resources

- [SPEC.md](../SPEC.md) - Full framework specification
- [evals/](../evals/) - Test files showing all features
- [src/components/](../src/components/) - Component source code

## Contributing Examples

To add a new example:

1. Create a numbered directory: `examples/XX-name/`
2. Add `agent.tsx` with a runnable agent
3. Add `README.md` explaining the concepts
4. Update this index
