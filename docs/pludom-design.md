---
title: PluDom Design (Solid Renderer)
description: Design notes for the custom renderer and execution model
---

# PluDom Design Document (Solid Renderer)

## Research Summary

### How Solid Custom Renderers Work

Solid's architecture separates the **reactive runtime** (signals, effects) from the **renderer** (DOM, string, custom). The `solid-js/universal` package exposes `createRenderer`, letting us build custom renderers for any target.

**Key insight**: Solid doesn't care what you render to. Solid DOM renders to browser DOM, Solid Native renders to native views. We render to an in-memory `SmithersNode` tree which is then serialized to XML plans.

### Renderer Config

A custom renderer implements a config object with methods `solid-js/universal` calls to manipulate the tree:

```typescript
import { createRenderer } from 'solid-js/universal'

export function createSmithersSolidRenderer() {
  return createRenderer<SmithersNode>({
    // Create element nodes
    createElement(type) {
      return { type, props: {}, children: [], parent: null }
    },

    // Create text nodes
    createTextNode(text) {
      return { type: 'TEXT', props: { value: text }, children: [], parent: null }
    },

    // Updates
    replaceText(node, text) {
      node.props.value = text
    },

    setProperty(node, name, value) {
      if (name !== 'children') node.props[name] = value
    },

    // Tree manipulation
    insertNode(parent, node, anchor) {
      node.parent = parent
      if (anchor) {
        const idx = parent.children.indexOf(anchor)
        if (idx !== -1) parent.children.splice(idx, 0, node)
      } else {
        parent.children.push(node)
      }
    },

    removeNode(parent, node) {
      const idx = parent.children.indexOf(node)
      if (idx >= 0) parent.children.splice(idx, 1)
      node.parent = null
    },

    // Traversal
    getParentNode(node) { return node.parent ?? undefined },
    getFirstChild(node) { return node.children[0] },
    getNextSibling(node) {
      if (!node.parent) return undefined
      const idx = node.parent.children.indexOf(node)
      return idx !== -1 ? node.parent.children[idx + 1] : undefined
    },

    isTextNode(node) { return node.type === 'TEXT' }
  })
}
```

---

## PluDom Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Code                             │
│  MDX/JSX → <Claude>, <Phase>, <Step>, <Subagent>, etc.      │
│  (Using Solid Signals for State)                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      PluDom Renderer                         │
│  solid-js/universal + Smithers Renderer Config → Node Tree   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       Serializer                             │
│  SmithersNode Tree → XML String (the "plan")                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       Executor                               │
│  XML Plan → Claude SDK calls → Results                      │
│  Results → onFinished callbacks → Signal updates            │
│  Signal updates → Fine-grained Re-render → New plan         │
└─────────────────────────────────────────────────────────────┘
```

### Internal Node Representation

```typescript
export interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown
  error?: Error
  contentHash?: string
}

export interface SmithersNode {
  type: string                    // 'claude', 'phase', 'step', 'TEXT', etc.
  props: Record<string, unknown>  // Component props
  children: SmithersNode[]        // Child nodes
  parent: SmithersNode | null     // Parent reference
  _execution?: ExecutionState     // Runtime execution state
}
```

### Host Components

These are the primitive "elements" our renderer understands (like `div`, `span` in DOM). In Solid, we typically don't wrap these in "Host Components" like React, but instead rely on the compiler or intrinsic elements.

| Component | Purpose | Props |
|-----------|---------|-------|
| `claude` | Main agent execution | `tools`, `onFinished`, `onError`, SDK passthrough |
| `subagent` | Parallel execution boundary | `name`, `parallel`, same as claude |
| `phase` | Semantic phase grouping | `name` |
| `step` | Semantic step marker | (children only) |
| `persona` | Agent role definition | `role` |
| `constraints` | Rules/limitations | (children only) |
| `output-format` | Expected output schema | `schema` |

---

## Component Details

### `<Claude>`

The core component. Represents a Claude agent invocation.

```tsx
import { ParentProps } from 'solid-js'

interface ClaudeProps extends ParentProps {
  tools?: Tool[]
  onFinished?: (output: any) => void
  onError?: (error: Error) => void
  // ... additional SDK props
}
```

**Rendering**: Serializes to `<claude>` XML with children as prompt.

**Execution**:
1. Serialize children to XML/text prompt
2. Connect tools as MCP servers
3. Call Claude SDK
4. Parse response
5. Call `onFinished` with result
6. Signal update triggers fine-grained updates to the tree

### `<Subagent>`

A parallel execution boundary.

```tsx
interface SubagentProps extends ParentProps {
  name?: string
  parallel?: boolean
}
```

### `<Phase>` and `<Step>`

Semantic markers.

```tsx
<Phase name="research">
  <Step>Search for relevant papers</Step>
  <Step>Extract key findings</Step>
</Phase>
```

### `<Persona>`, `<Constraints>`, `<OutputFormat>`

Prompt structure components.

```tsx
<Claude>
  <Persona role="security expert">...</Persona>
  <Constraints>...</Constraints>
  <OutputFormat schema={...} />
</Claude>
```

---

## Execution Model: The Ralph Wiggum Loop

Named after the simple, iterative approach: run the agent, get result, repeat.

### Loop Pseudocode

```typescript
import { render } from './renderer'

async function executePlan(element: () => JSX.Element): Promise<any> {
  // Create a root node for the renderer
  const root: SmithersNode = { type: 'root', props: {}, children: [], parent: null }

  // 1. Initial Render (Solid tracks dependencies)
  // We pass a disposal function if we needed to clean up, but here we just render.
  const dispose = render(element, root)

  while (true) {
    // 2. Serialize current tree to XML plan
    const xmlPlan = serialize(root)

    // 3. Find executable nodes (claude/subagent with pending status)
    const executables = findPendingExecutables(root)

    if (executables.length === 0) {
      dispose()
      return extractResults(root)
    }

    // 4. Execute nodes
    // - Sequential claude nodes run one at a time
    // - Subagent nodes run in parallel
    const sequential = executables.filter(n => n.type === 'claude')
    const parallel = executables.filter(n => n.type === 'subagent')

    // Run first sequential + all parallel
    // Note: Execution updates internal _execution state on nodes
    // AND calls onFinished callbacks which update User Signals.
    await Promise.all([
      sequential[0] && executeNode(sequential[0]),
      ...parallel.map(executeNode)
    ])

    // 5. Signal updates from onFinished trigger fine-grained updates
    // Solid automatically updates the 'root' tree structure.
    // The while loop continues with the updated tree.
  }
}
```

### Frame-by-Frame Execution

Each "frame" is one iteration of the loop:

1. **Render**: Solid Reactivity updates `SmithersNode` tree automatically.
2. **Display**: Show plan to user.
3. **Execute**: Run pending nodes.
4. **Update**: `onFinished` callbacks update Solid signals.
5. **Reactivity**: Signal changes trigger fine-grained DOM (Node) updates.
6. **Repeat**: Loop until no pending executables.

---

## API Design

### Core Functions

```typescript
// Render JSX to XML string (no execution)
export async function renderPlan(element: () => JSX.Element): Promise<string>

// Execute the plan with Ralph Wiggum loop
export async function executePlan(
  element: () => JSX.Element,
  options?: ExecuteOptions
): Promise<ExecutionResult>
```

---

## Implementation Plan

### Completed

1. **Core renderer** (`src/renderer.ts`)
   - `solid-js/universal` implementation
   - `SmithersNode` structure

2. **Core API** (`src/index.ts`)
   - `renderPlan()`
   - `executePlan()`

3. **Components** (`src/components/index.ts`)
   - Solid functional components

4. **CLI** (`packages/cli`)
   - Updated to use Solid-based core

### Next

1. **TUI Implementation**
   - Solid-based Terminal Renderer

---

## File Structure

```
packages/smithers/src/
  index.ts              # Main exports
  renderer.ts           # solid-js/universal renderer
  root.ts               # Execution loop
  claude-executor.ts    # Claude SDK wrapper
  components/
    index.ts            # All component exports
packages/cli/src/
    index.ts            # CLI entry point
    commands/           # run/plan/init
```

---

## References

- [solid-js/universal docs](https://www.solidjs.com/docs/latest/api#createrenderer)
- [Making a Custom Solid Renderer](https://www.solidjs.com/guides/rendering#custom-renderers)
