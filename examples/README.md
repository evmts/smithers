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
| 03 | [Research Pipeline](./03-research-pipeline/) | Multi-phase, SolidJS store, Ralph loop | Intermediate |
| 04 | [Parallel Research](./04-parallel-research/) | Subagent, parallel execution | Intermediate |
| 05 | [Dev Team](./05-dev-team/) | Multi-agent orchestration | Advanced |
| 06 | [File Processor](./06-file-processor/) | File operations, multi-phase transforms | Intermediate |
| 07 | [Git Helper](./07-git-helper/) | Git operations with Bash tool | Intermediate |
| 08 | [Test Generator](./08-test-generator/) | Code analysis, test generation, OutputFormat | Intermediate |
| 09 | [Parallel Worktrees](./09-parallel-worktrees/) | Git worktrees, isolated parallel execution | Advanced |
| 10 | [MCP Integration](./10-mcp-integration/) | MCP servers, external tools | Advanced |
| 11 | [Rate-Limited Batch](./11-rate-limited-batch/) | ClaudeProvider, rate limiting, usage tracking | Advanced |

## Learning Path

### 0. Feature Workflow - The Complete Example

**Start here if you want to see everything Smithers can do.** This flagship example demonstrates a production-grade development workflow using SolidJS stores:

```tsx
import { createStore } from 'solid-js/store'

function FeatureWorkflow(props) {
  const [state, setState] = createStore({
    phase: 'prompt-input',
    plan: null,
    refinedPlan: null
  })

  return () => {
    switch (state.phase) {
      case 'prompt-input':
        return (
          <Human message="Review feature request" 
                 onApprove={() => setState('phase', 'research')} 
                 onReject={() => setState('phase', 'cancelled')}>
            Feature: {props.prompt}
          </Human>
        )

      case 'research':
        return <Claude allowedTools={['Read', 'Glob', 'Grep']} 
                       onFinished={() => setState('phase', 'planning')}>Research the codebase...</Claude>

      case 'planning':
        return <Claude onFinished={(plan) => setState({ plan, phase: 'plan-review' })}>Create implementation plan...</Claude>

      case 'plan-review':
        return (
          <Human message="Review plan" 
                 onApprove={() => setState('phase', 'poc')} 
                 onReject={() => setState('phase', 'planning')}>
            {JSON.stringify(state.plan, null, 2)}
          </Human>
        )

      // ... other phases (poc, poc-analysis, refined-review, api-impl, etc.)

      case 'done':
        return null
    }
  }
}
```

Concepts demonstrated:
- Human-in-the-loop approval gates
- 12-phase workflow with state machine
- Extended thinking for deep analysis
- POC-driven plan refinement
- TDD flow (types → tests fail → implementation passes)

### 1. Hello World - The Basics

Start here to understand the fundamental pattern:

```tsx
import { executePlan, Claude } from '@evmts/smithers'

function HelloWorld() {
  return (
    <Claude>
      You are a friendly assistant.
    </Claude>
  )
}

await executePlan(() => <HelloWorld />)
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

Understand the Ralph Wiggum loop and state-driven re-rendering with Signals:

```tsx
import { createSignal } from 'solid-js'

function Pipeline() {
  const [phase, setPhase] = createSignal('gather')

  return () => {
    if (phase() === 'gather') {
      return <Claude onFinished={() => setPhase('analyze')}>Gather data</Claude>
    }
    // ... more phases
  }
}
```

### 4. Parallel Research - Concurrent Agents

Run multiple agents in parallel with Subagent:

```tsx
function ParallelResearch(props) {
  return (
    <>
      {props.topics.map(topic => (
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
function DevTeam(props) {
  const [stage, setStage] = createSignal('planning')
  // ... state setup

  return () => {
    switch (stage()) {
      case 'planning':
        return <Architect task={props.task} />
      case 'implementing':
        return <Developer subtask={currentSubtask()} />
      case 'reviewing':
        return <Reviewer />
    }
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

Use SolidJS Signals or Stores for predictable state across phases:

```tsx
import { createSignal } from 'solid-js'

const [phase, setPhase] = createSignal('start')
const [data, setData] = createSignal(null)
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

# File Processor (with custom pattern and output)
bun run examples/06-file-processor/agent.tsx "**/*.md" "./processed"

# Git Helper (with operation)
bun run examples/07-git-helper/agent.tsx status

# Test Generator (with source file and framework)
bun run examples/08-test-generator/agent.tsx src/utils/math.ts bun

# Parallel Worktrees (with multiple features)
bun run examples/09-parallel-worktrees/agent.tsx "Add dark mode" "Fix mobile layout"

# MCP Integration (with demo type)
bun run examples/10-mcp-integration/agent.tsx filesystem

# Rate-Limited Batch (with input and output paths)
bun run examples/11-rate-limited-batch/agent.tsx ./items.txt ./results
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