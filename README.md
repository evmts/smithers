# Plue

React-based framework for composable, reusable AI agent prompts. Write prompts in JSX/MDX, render to XML plans, execute with Claude.

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

Run it:

```bash
plue run agent.mdx
```

## Core Concepts

- **MDX entry point** - Markdown files that import JSX components
- **JSX renders to XML** - Components produce XML plans sent to the LLM
- **React state** - Standard React state drives dynamic plan updates
- **Ralph Wiggum loop** - Agent runs repeatedly on the plan until completion

## API

### `renderPlan()`

Renders JSX to an XML plan:

```tsx
import { renderPlan } from 'plue'

const plan = await renderPlan(<MyAgent />)
```

### `<Claude>`

Wraps Claude Code SDK:

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
