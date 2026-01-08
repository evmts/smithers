# Hello World

The simplest possible Smithers agent demonstrating basic usage.

## What This Example Shows

- Basic `<Claude>` component usage
- How to write a simple system prompt
- Running an agent with `executePlan`

## The Code

```tsx
import { executePlan, Claude } from '@evmts/smithers'

function HelloWorld() {
  return (
    <Claude>
      You are a friendly AI assistant named Smithers. Say hello and introduce
      yourself in one sentence. Be warm and welcoming.
    </Claude>
  )
}

const result = await executePlan(<HelloWorld />)
console.log(result.output)
```

## Running

```bash
bun run examples/01-hello-world/agent.tsx
```

## What Happens

1. The JSX component renders to an XML plan
2. Smithers shows the plan and prompts for approval
3. Claude executes with the provided prompt
4. The response is returned in `result.output`

## Key Concepts

### The Claude Component

`<Claude>` is the core component that represents an AI agent. Its children become the system prompt / instructions for Claude.

### Execution

`executePlan()` takes a JSX element, renders it to XML, and executes it with Claude. It returns an `ExecutionResult` containing:

- `output` - The agent's response
- `frames` - Number of execution cycles
- `totalDuration` - Time in milliseconds
- `history` - Detailed frame-by-frame results

## Next Steps

See [02-code-review](../02-code-review/) to learn about tools and structured output.
