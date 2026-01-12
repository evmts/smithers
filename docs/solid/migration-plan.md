---
title: React to Solid Migration Plan
description: Comprehensive implementation plan for migrating Smithers from React to Solid.js
---

# React to Solid Migration Plan

This document provides the complete implementation plan for migrating Smithers from React's `react-reconciler` to Solid's `solid-js/universal` renderer.

## Executive Summary

Smithers uses JSX to declaratively build AI agent workflows that render to XML plans. The current implementation uses React's reconciler API. We're migrating to Solid.js because:

- **Fine-grained reactivity**: Signals update exactly what changed, no VDOM diffing
- **No stale closures**: Callbacks always see current state
- **Simpler mental model**: No rules of hooks, no dependency arrays
- **Lighter runtime**: Solid is smaller and faster

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package structure | Separate package `@evmts/smithers-solid` | Better isolation, independent versioning, cleaner dependencies |
| Priority | Core renderer + parity tests first | Prove correctness before adding CLI integration |
| State strategy | Zustand bridge + native Solid stores | Support existing patterns while enabling idiomatic Solid |

## What Stays the Same

- **XML plan output** - Serialized plans are byte-for-byte identical
- **Ralph Wiggum loop** - Render → execute → state update → repeat
- **Component API** - Same props, same behavior for `<Claude>`, `<Phase>`, etc.
- **Execution logic** - Claude SDK integration, callbacks, error handling
- **Node.js runtime** - No DOM dependencies

## What Changes

- **Renderer implementation** - `react-reconciler` → `solid-js/universal`
- **State management** - React hooks → Solid signals
- **Context API** - React Context → Solid Context
- **JSX compilation** - Different JSX transform target

---

## Architecture

### Current (React)

```
┌─────────────────────────────────────────────────────────────┐
│                        User Code (JSX)                       │
│  <Claude>, <Phase>, <Step>, <Subagent>, etc.                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    react-reconciler                          │
│  Host Config → createInstance, appendChild, commitUpdate     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     SmithersNode Tree                        │
│  { type, props, children, parent, _execution }              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    XML Serialization                         │
│  serialize(tree) → <claude><phase>...</phase></claude>      │
└─────────────────────────────────────────────────────────────┘
```

### Target (Solid)

```
┌─────────────────────────────────────────────────────────────┐
│                        User Code (JSX)                       │
│  <Claude>, <Phase>, <Step>, <Subagent>, etc.                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   solid-js/universal                         │
│  createRenderer → createElement, insertNode, setProperty     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     SmithersNode Tree                        │
│  { type, props, children, parent, _execution }              │
│  (Same structure - serializer unchanged)                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    XML Serialization                         │
│  serialize(tree) → <claude><phase>...</phase></claude>      │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 0: Renderer Abstraction

**Goal**: Decouple execution logic from React-specific APIs

#### Tasks

1. Define `SmithersRoot` interface in `src/core/types.ts`:

```typescript
export interface SmithersRoot<TInput = unknown> {
  mount(input: TInput): void | Promise<void>
  getTree(): SmithersNode
  flush?(): void | Promise<void>
  dispose(): void
}
```

2. Refactor `createSmithersRoot` to implement this interface
3. Create golden test fixtures for parity validation

#### Files
- `src/core/types.ts` - Add interface
- `src/reconciler/index.ts` - Implement interface

---

### Phase 1: Solid Universal Renderer

**Goal**: Implement SmithersNode tree construction using Solid's `createRenderer`

#### Core Implementation

```typescript
// packages/smithers-solid/src/renderer.ts
import { createRenderer } from 'solid-js/universal'
import type { SmithersNode } from '@evmts/smithers'

export function createSmithersSolidRenderer() {
  return createRenderer<SmithersNode>({
    createElement(type: string) {
      return { type, props: {}, children: [], parent: null }
    },

    createTextNode(text: string) {
      return { type: 'TEXT', props: { value: text }, children: [], parent: null }
    },

    replaceText(node, text) {
      node.props.value = text
    },

    setProperty(node, name, value) {
      if (name !== 'children') {
        node.props[name] = value
      }
    },

    insertNode(parent, node, anchor) {
      node.parent = parent
      const idx = anchor ? parent.children.indexOf(anchor) : -1
      if (idx === -1) {
        parent.children.push(node)
      } else {
        parent.children.splice(idx, 0, node)
      }
    },

    removeNode(parent, node) {
      const idx = parent.children.indexOf(node)
      if (idx >= 0) {
        parent.children.splice(idx, 1)
      }
      node.parent = null
    },

    isTextNode: (node) => node.type === 'TEXT',
    getParentNode: (node) => node.parent,
    getFirstChild: (node) => node.children[0],
    getNextSibling(node) {
      if (!node.parent) return undefined
      const idx = node.parent.children.indexOf(node)
      return node.parent.children[idx + 1]
    },
  })
}
```

#### Root Implementation

```typescript
// packages/smithers-solid/src/root.ts
import type { SmithersRoot, SmithersNode } from '@evmts/smithers'
import { createSmithersSolidRenderer } from './renderer.js'

export function createSmithersSolidRoot(): SmithersRoot<() => any> {
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  const { render } = createSmithersSolidRenderer()
  let dispose: (() => void) | null = null

  return {
    mount(App) {
      dispose = render(App, rootNode)
    },
    getTree() {
      return rootNode
    },
    async flush() {
      // Drain microtasks to ensure signal updates are processed
      await Promise.resolve()
    },
    dispose() {
      dispose?.()
    },
  }
}
```

---

### Phase 2: Component Parity

**Goal**: Solid versions of all host components

```typescript
// packages/smithers-solid/src/components/index.ts
import type { Component, JSX } from 'solid-js'
import type {
  ClaudeProps, PhaseProps, StepProps, SubagentProps,
  PersonaProps, ConstraintsProps, OutputFormatProps,
  HumanProps, StopProps, OutputProps, FileProps, WorktreeProps
} from '@evmts/smithers'

// Helper type for host components
type HostComponent<P> = Component<P & { children?: JSX.Element }>

export const Claude: HostComponent<ClaudeProps> = (props) => {
  // @ts-expect-error - lowercase tags route to universal renderer
  return <claude {...props}>{props.children}</claude>
}

export const Phase: HostComponent<PhaseProps> = (props) => {
  return <phase {...props}>{props.children}</phase>
}

export const Step: HostComponent<StepProps> = (props) => {
  return <step {...props}>{props.children}</step>
}

export const Subagent: HostComponent<SubagentProps> = (props) => {
  return <subagent parallel={true} {...props}>{props.children}</subagent>
}

export const Persona: HostComponent<PersonaProps> = (props) => {
  return <persona {...props}>{props.children}</persona>
}

export const Constraints: HostComponent<ConstraintsProps> = (props) => {
  return <constraints {...props}>{props.children}</constraints>
}

export const OutputFormat: HostComponent<OutputFormatProps> = (props) => {
  return <output-format {...props}>{props.children}</output-format>
}

export const Human: HostComponent<HumanProps> = (props) => {
  return <human {...props}>{props.children}</human>
}

export const Stop: HostComponent<StopProps> = (props) => {
  return <stop {...props}>{props.children}</stop>
}

export const Output: HostComponent<OutputProps> = (props) => {
  return <output {...props}>{props.children}</output>
}

export const File: HostComponent<FileProps> = (props) => {
  return <file {...props}>{props.children}</file>
}

export const Worktree: HostComponent<WorktreeProps> = (props) => {
  return <worktree {...props}>{props.children}</worktree>
}
```

---

### Phase 3: State & Context

**Goal**: Solid-compatible state management

#### Zustand Bridge

```typescript
// packages/smithers-solid/src/state/zustand.ts
import { createSignal, onCleanup } from 'solid-js'
import type { StoreApi } from 'zustand/vanilla'

export function fromZustand<T>(store: StoreApi<T>): () => T {
  const [state, setState] = createSignal<T>(store.getState())

  const unsubscribe = store.subscribe((newState) => {
    setState(() => newState)
  })

  onCleanup(unsubscribe)

  return state
}
```

#### Solid Context

```typescript
// packages/smithers-solid/src/context/claude-provider.tsx
import { createContext, useContext, ParentComponent } from 'solid-js'
import type { ProviderContext } from '@evmts/smithers'

const ClaudeContext = createContext<ProviderContext>()

export const ClaudeProvider: ParentComponent<{ value: ProviderContext }> = (props) => {
  return (
    <ClaudeContext.Provider value={props.value}>
      {props.children}
    </ClaudeContext.Provider>
  )
}

export function useClaudeContext() {
  return useContext(ClaudeContext)
}
```

---

## Testing Strategy

### Parity Tests

The critical validation: same JSX input → identical XML output.

```typescript
// packages/smithers-solid/evals/parity/simple.test.ts
import { describe, test, expect } from 'bun:test'
import { renderPlan as renderReact } from '@evmts/smithers'
import { renderPlan as renderSolid } from '@evmts/smithers-solid'

describe('XML parity', () => {
  test('simple text renders identically', async () => {
    const reactXml = await renderReact(<Claude>Hello world</Claude>)
    const solidXml = await renderSolid(() => <Claude>Hello world</Claude>)
    expect(solidXml).toBe(reactXml)
  })

  test('nested phases render identically', async () => {
    const agent = (
      <Claude>
        <Phase name="research">
          <Step>Find docs</Step>
          <Step>Summarize</Step>
        </Phase>
        Analyze the topic
      </Claude>
    )

    const reactXml = await renderReact(agent)
    const solidXml = await renderSolid(() => agent)
    expect(solidXml).toBe(reactXml)
  })
})
```

### Test Fixtures

```
packages/smithers-solid/evals/
├── parity/
│   ├── simple-text.test.ts      # Basic text nodes
│   ├── nested-phases.test.ts    # Phase > Step hierarchy
│   ├── conditional.test.ts      # Show/Hide logic
│   ├── parallel-agents.test.ts  # Subagent parallel=true
│   └── state-machine.test.ts    # Multi-phase with state
└── fixtures/
    ├── code-review-agent.tsx
    ├── research-agent.tsx
    └── multi-phase-agent.tsx
```

---

## Package Structure

```
packages/smithers-solid/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main exports
│   ├── renderer.ts           # createRenderer implementation
│   ├── root.ts               # SmithersRoot implementation
│   ├── execute.ts            # executePlanSolid wrapper
│   ├── components/
│   │   └── index.ts          # All Solid components
│   ├── state/
│   │   └── zustand.ts        # Zustand → Solid bridge
│   └── context/
│       └── claude-provider.tsx
├── evals/
│   └── parity/               # Parity tests
└── README.md
```

---

## Migration Guide for Users

### Before (React)

```tsx
import { useState } from 'react'
import { Claude, Phase, executePlan } from '@evmts/smithers'

function MyAgent() {
  const [phase, setPhase] = useState<'research' | 'write'>('research')

  if (phase === 'research') {
    return (
      <Claude onFinished={() => setPhase('write')}>
        Research the topic
      </Claude>
    )
  }

  return <Claude>Write the report</Claude>
}

await executePlan(<MyAgent />)
```

### After (Solid)

```tsx
import { createSignal } from 'solid-js'
import { Claude, Phase, executePlan } from '@evmts/smithers-solid'

function MyAgent() {
  const [phase, setPhase] = createSignal<'research' | 'write'>('research')

  return phase() === 'research'
    ? <Claude onFinished={() => setPhase('write')}>Research the topic</Claude>
    : <Claude>Write the report</Claude>
}

await executePlan(() => <MyAgent />)
```

### Key Differences

| React | Solid |
|-------|-------|
| `useState()` returns `[value, setter]` | `createSignal()` returns `[accessor, setter]` |
| Read state directly: `phase` | Call accessor: `phase()` |
| `<>{condition && <X />}</>` | `<Show when={condition()}><X /></Show>` |
| `{list.map(item => ...)}` | `<For each={list()}>{item => ...}</For>` |
| Zustand hook: `useStore()` | Bridge: `fromZustand(store)` |

---

## Verification Checklist

- [ ] `serialize(solidTree)` === `serialize(reactTree)` for all fixtures
- [ ] Ralph loop converges in same frame count
- [ ] `onFinished` callbacks trigger re-renders
- [ ] Parallel subagents execute concurrently
- [ ] Stop/Human control flow works
- [ ] File/Worktree side effects execute
- [ ] No DOM dependencies in solid renderer

---

## Resources

- [Solid.js Documentation](https://docs.solidjs.com/)
- [Solid Universal Renderer](https://github.com/solidjs/solid/tree/main/packages/solid/universal)
- [Smithers Architecture](/pludom-design)
- [Ralph Wiggum Loop](/concepts/ralph-wiggum-loop)
