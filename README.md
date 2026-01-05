# Plue

Framework for composable, reusable, evolvable AI agent prompts. 

- Write prompts in JSX/MDX 
- render to XML plans.
- Allow plan to evolve in real time as it ralphs
- Use entire TypeScript and React ecosystem

## Install

```bash
bun add plue
```

## Quick Start

Create `agent.mdx`:

```mdx
import { Claude } from 'plue'

# My Agent

<Claude>
  You are a helpful assistant. Answer the user's question concisely.
</Claude>
```

This agent.mdx file represents your entrypoint. [Ralph](https://ghuntley.com/ralph/) will act as the runtime rerunning this entrypoint file everytime.

Run it:

```bash
plue run agent.mdx
```

## Core Concepts

- **MDX entry point** - Markdown files that import JSX components
- **JSX renders to XML** - Components produce XML plans sent to the LLM
- **React state** - Standard React state drives dynamic plan updates
- **Ralph Wiggum loop** - Agent runs repeatedly on the plan until completion

## Don't write Smithers code!

Prompt the plan! Consider using your favorite coding harness like claude code to implement the plan using smithers. You can then tell claude code to sleep for 5 minutes at a time and deliver you an easy to read report of what happened every 5 minutes.

## API

### `renderPlan()`

Renders JSX to an XML plan:

```tsx
import { renderPlan } from 'plue'

const plan = await renderPlan(<MyAgent />)
```

This is what is happening when you call plue run.

### `<Claude>`

Wraps Claude Code SDK as a React Component:

```tsx
<Claude
  tools={[fileTool, searchTool]}
  onFinished={(output) => setState(output)}
  onError={(err) => handleError(err)}
>
  {/* Prompt content */}
</Claude>
```

Props pass through to Claude Code SDK. Tools auto-connect as MCP servers.

Render more JSX if you want Claude ralph subagents

```tsx
<Claude
  tools={[fileTool, searchTool]}
  onFinished={(output) => setState(output)}
  onError={(err) => handleError(err)}
>
  <Step>
     <Claude>
        Do step 1
     </Claude>
  </Step>
</Claude>
```

### `<Phase>`

Defines a phase in a multi-phase plan:

```tsx
<Phase name="research">
  <Claude>Gather information about the topic.</Claude>
</Phase>

<Phase name="synthesize">
  <Claude>Analyze and summarize findings.</Claude>
</Phase>
```

### `<Step>`

Defines a step within a phase:

```tsx
<Phase name="implementation">
  <Step>Read the existing code</Step>
  <Step>Write the new feature</Step>
  <Step>Run tests</Step>
</Phase>
```

### `RunInParallel`

Runs a series of steps in parallel.

```tsx
<Phase name="implementation">
  <RunInParallel>
    <Step>Read the existing code</Step>
    <Step>Write the new feature</Step>
  </RunInParallel>
  <Step>Run tests</Step>
</Phase>
```

### `Human`

Stops execution of the closest parent ralph until a human intervenes

```tsx
{needsHumanReview && <Human>Please review the progress so far</Human>}
```

## CLI

```bash
# Show plan and prompt for approval (Terraform-style)
plue run agent.mdx

# Skip approval, execute immediately
plue run agent.mdx --auto-approve
```

## Examples

See [examples/](./examples) for:
- `hello-world.mdx` - Basic usage
- `code-review.mdx` - Tools via MCP
- `multi-phase.mdx` - State transitions
- `multi-agent.mdx` - Nested agents
- `reusable-components.mdx` - Composition patterns

## Docs

- [Concepts](./docs/concepts.md) - Core concepts in depth
- [Components](./docs/components.md) - Full component API reference
