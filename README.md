# Smithers

Build AI agents with Solid.js - Declarative JSX for Claude orchestration.

## Installation

```bash
bun add smithers
```

## Quick Start

```tsx
import { createSignal } from 'smithers/solid'
import { Claude, Phase } from 'smithers/components'
import { createSmithersRoot, executePlan, serialize } from 'smithers'

function MyAgent() {
  const [done, setDone] = createSignal(false)

  return !done()
    ? <Claude onFinished={() => setDone(true)}>
        Research AI agents
      </Claude>
    : <Claude>Write a summary</Claude>
}

// Render and execute
const root = createSmithersRoot()
root.mount(MyAgent)

console.log(serialize(root.getTree()))

await executePlan(root.getTree())
root.dispose()
```

## Exports

- `smithers` - Main exports (core + components)
- `smithers/core` - Execution engine only
- `smithers/solid` - Solid.js renderer + primitives
- `smithers/components` - JSX components
- `smithers/debug` - Observability utilities

## License

MIT
