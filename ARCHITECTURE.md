# Smithers Architecture

Smithers is a framework for composable AI agents using Solid.js fine-grained reactivity.

## Core Architectural Principle

**Components execute themselves via `onMount`, not via external orchestrators.**

State changes (via Solid signals) trigger re-renders, which trigger re-execution. This is the **"Ralph Wiggum loop"** pattern.

## The Ralph Wiggum Loop

Named after the Simpsons character, this pattern is deceptively simple:

1. Component mounts and executes its logic in `onMount()`
2. When you want the component to re-execute, change its `key` prop
3. Solid sees the key changed, unmounts the old component, mounts a new one
4. The new component's `onMount()` fires, executing the logic again

```tsx
function Agent(props) {
  onMount(() => {
    // Agent executes itself on mount
    performAgentTask()
  })

  return <task>{props.children}</task>
}

function App() {
  const [resetKey, setResetKey] = createSignal(0)

  // Trigger re-execution by changing the key
  setResetKey(k => k + 1)

  return <Agent key={resetKey()} name="my-agent" />
}
```

## Data Structure

### SmithersNode

The core tree structure that represents agent plans:

```typescript
interface SmithersNode {
  type: string                    // Component type ('task', 'agent', etc.)
  props: Record<string, unknown>  // Component props
  children: SmithersNode[]        // Child nodes
  parent: SmithersNode | null     // Parent reference
  key?: string | number           // Key for reconciliation (Ralph Wiggum loop)
  _execution?: ExecutionState     // Runtime execution state
}
```

**Key features:**
- Plain object structure (not DOM nodes)
- Serializable to XML for display/approval
- Supports fine-grained reactivity via Solid's reconciliation
- `key` prop enables forced re-execution

## Universal Renderer

Smithers uses Solid.js's universal renderer to convert JSX → SmithersNode tree.

The renderer implements these methods:
- `createElement(type)` - Create element nodes
- `createTextNode(text)` - Create text nodes
- `setProperty(node, name, value)` - Set props (handles `key` specially)
- `insertNode(parent, node, anchor?)` - Insert into tree
- `removeNode(parent, node)` - Remove from tree
- Tree traversal methods (`getParentNode`, `getFirstChild`, `getNextSibling`)

**Critical detail:** The `key` prop is stored on the node itself (`node.key`), not in `props`, to enable Solid's reconciliation to detect changes.

## XML Serialization

The tree can be serialized to XML for display and user approval:

```xml
<plan>
  <agent key="0" name="data-fetcher">
    <task name="fetch-users" />
    <task name="fetch-posts" />
  </agent>
</plan>
```

This XML representation:
- Shows the execution plan before running
- Includes the `key` attribute for debugging
- Can be displayed to users for approval
- Preserves the tree structure

## Root API

Create a root to mount components:

```typescript
import { createSmithersRoot } from 'smithers'

const root = createSmithersRoot()

// Mount a component tree
root.mount(() => <Agent name="root" />)

// Get the tree structure
const tree = root.getTree()

// Serialize to XML
const xml = root.toXML()

// Clean up
root.dispose()
```

## Why This Design?

### Self-executing components
Traditional agent frameworks have orchestrators that iterate over tasks and execute them. This creates complexity:
- Orchestrator logic separate from component logic
- Hard to compose and reuse
- Difficult to add control flow

With self-executing components:
- Component logic is self-contained
- Composition is natural (just nest components)
- Control flow is just JSX conditionals

### Fine-grained reactivity
Solid.js provides surgical updates to the tree:
- Signal changes mutate tree in-place
- No virtual DOM diffing
- Minimal re-rendering

### Serializable trees
Unlike DOM nodes, SmithersNodes are plain objects:
- Easy to serialize/deserialize
- Can be sent over the wire
- Simple to inspect and debug

## Next Steps

1. **Component library**: Build reusable agent components (`<Claude>`, `<Parallel>`, `<Retry>`)
2. **Execution engine**: Run the tree, respecting control flow and managing state
3. **Streaming**: Support streaming responses and progressive updates
4. **Persistence**: Save/restore execution state

See `examples/ralph-wiggum-loop.tsx` for a working example.
