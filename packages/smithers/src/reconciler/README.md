# Smithers Reconciler

A custom React reconciler that renders JSX to an internal `SmithersNode` tree instead of the DOM. This is the core engine that makes Smithers work - it's essentially a "react-dom" replacement for AI agents.

## How It Works

```
                              React Application
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         React Reconciler                                 │
│                                                                          │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐          │
│   │   Render     │ ───▶ │   Reconcile  │ ───▶ │    Commit    │          │
│   │   Phase      │      │    Phase     │      │    Phase     │          │
│   └──────────────┘      └──────────────┘      └──────────────┘          │
│         │                      │                      │                  │
│         ▼                      ▼                      ▼                  │
│   Create fiber           Compare old/new        Apply mutations         │
│   tree from JSX          trees to find          to SmithersNode tree         │
│                          differences                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                         ┌─────────────────────┐
                         │    SmithersNode Tree     │
                         │   (Internal DOM)    │
                         └─────────────────────┘
```

## Architecture

### The Host Config (`host-config.ts`)

The host config tells React how to interact with our custom "DOM" (the SmithersNode tree). It implements the `react-reconciler` interface:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Host Config                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Node Creation                               │    │
│  │  createInstance()     - Create <claude>, <phase>, etc. nodes    │    │
│  │  createTextInstance() - Create TEXT nodes for strings           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Tree Manipulation                             │    │
│  │  appendChild()        - Add child to parent                      │    │
│  │  insertBefore()       - Insert child at specific position        │    │
│  │  removeChild()        - Remove child from parent                 │    │
│  │  appendInitialChild() - Add child during initial render          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                        Updates                                   │    │
│  │  prepareUpdate()      - Compute update payload                   │    │
│  │  commitUpdate()       - Apply props changes to node              │    │
│  │  commitTextUpdate()   - Update text content                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                       Scheduling                                 │    │
│  │  now()                - Get current time                         │    │
│  │  scheduleTimeout()    - Schedule deferred work                   │    │
│  │  scheduleMicrotask()  - Schedule microtask work                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### SmithersNode Structure

Every element in the tree is a `SmithersNode`:

```
                            SmithersNode
                    ┌─────────────────────┐
                    │  type: 'claude'     │
                    │  props: {           │
                    │    tools: [...],    │
                    │    onFinished: fn   │
                    │  }                  │
                    │  children: [...]    │
                    │  parent: SmithersNode    │
                    │  _execution?: {...} │
                    └─────────────────────┘
```

### Rendering Flow

```
                    JSX Component                    SmithersNode Tree
                         │                               │
    <Claude>             │                               │
      <Persona>          │                               ▼
        Expert           │     ┌─────────────────────────────────────┐
      </Persona>         │     │  ROOT                               │
      <Step>             │ ──▶ │   └─ claude                         │
        Do task          │     │       ├─ persona (role="Expert")    │
      </Step>            │     │       │   └─ TEXT ("Expert")        │
    </Claude>            │     │       └─ step                       │
                         │     │           └─ TEXT ("Do task")       │
                               └─────────────────────────────────────┘
```

## Key Concepts

### 1. Mutation Mode

We use **mutation mode** (`supportsMutation: true`), meaning nodes are modified in place rather than creating immutable copies. This is simpler and sufficient for our use case.

```typescript
// Example: appendChild mutates the parent directly
appendChild(parent: SmithersNode, child: SmithersNode): void {
  child.parent = parent
  parent.children.push(child)
}
```

### 2. Synchronous Rendering

We use **legacy mode** (tag = 1) for synchronous rendering, which is important for the Ralph Wiggum loop where we need to render, execute, and re-render in sequence:

```typescript
const container = reconciler.createContainer(
  rootNode,
  1, // tag: 1 = legacy/sync mode, 0 = concurrent mode
  // ...
)
```

### 3. React 19 Workarounds

React 19 changed how props are passed during updates. We extract props from the fiber's `pendingProps`:

```typescript
commitUpdate(instance, updatePayload, type, prevProps, nextProps, handle) {
  // React 19 passes the fiber as nextProps
  let actualProps = updatePayload
  if ((nextProps as any).pendingProps !== undefined) {
    actualProps = (nextProps as any).pendingProps
  }
  instance.props = { ...actualProps }
}
```

### 4. Async Commit Handling

Even with `updateContainerSync()`, React 19 schedules some work asynchronously. We handle this with explicit waits:

```typescript
await new Promise(resolve => setImmediate(resolve))
await new Promise(resolve => setTimeout(resolve, 10))
await new Promise(resolve => setImmediate(resolve))
```

## The Ralph Wiggum Loop Integration

The reconciler is used by the Ralph Wiggum execution loop:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Ralph Wiggum Loop                                │
│                                                                           │
│    ┌────────────────┐                                                     │
│    │ 1. Render JSX  │ ◄───────────────────────────────────────┐          │
│    │   via Reconciler                                          │          │
│    └───────┬────────┘                                          │          │
│            │                                                   │          │
│            ▼                                                   │          │
│    ┌────────────────┐                                          │          │
│    │ 2. Serialize   │                                          │          │
│    │   to XML Plan  │                                          │          │
│    └───────┬────────┘                                          │          │
│            │                                                   │          │
│            ▼                                                   │          │
│    ┌────────────────┐                                          │          │
│    │ 3. Execute     │                                          │          │
│    │   Claude Nodes │                                          │          │
│    └───────┬────────┘                                          │          │
│            │                                                   │          │
│            ▼                                                   │          │
│    ┌────────────────┐      ┌──────────────────┐               │          │
│    │ 4. onFinished  │ ───▶ │ State Changes    │ ──────────────┘          │
│    │   Callbacks    │      │ (Zustand/useState)│                          │
│    └────────────────┘      └──────────────────┘                          │
│                                                                           │
│    Loop continues until no more pending <Claude> nodes                    │
└──────────────────────────────────────────────────────────────────────────┘
```

## API Reference

### `createSmithersRoot()`

Creates a new reconciler root for rendering React elements.

```typescript
import { createSmithersRoot } from 'smithers/reconciler'

const root = createSmithersRoot()

// Render a React element
const tree = await root.render(<MyAgent />)

// Get the current tree
const currentTree = root.getTree()

// Clean up
root.unmount()
```

### Utility Functions

```typescript
// Force synchronous work to complete
flushSyncWork()

// Force passive effects to run
flushPassiveEffects()

// Run updates synchronously
runWithSyncUpdates(() => {
  // State updates here are synchronous
})

// Wait for React's commit phase
await waitForCommit()

// Wait for state updates to propagate
await waitForStateUpdates()
```

## Comparison with react-dom

| Feature | react-dom | smithers-reconciler |
|---------|-----------|---------------------|
| Target | Browser DOM | SmithersNode Tree |
| Purpose | UI rendering | Agent orchestration |
| Rendering | Concurrent | Synchronous (legacy) |
| Output | HTML elements | XML plan |
| Events | DOM events | Execution callbacks |

## Files

- **`host-config.ts`** - The host configuration that tells React how to manage SmithersNodes
- **`index.ts`** - Creates the reconciler instance and exports `createSmithersRoot()`

## Further Reading

- [React Reconciler Documentation](https://github.com/facebook/react/tree/main/packages/react-reconciler)
- [Building a Custom React Renderer](https://agent-hunt.medium.com/hello-world-custom-react-renderer-9a95b7cd04bc)
- [React Fiber Architecture](https://github.com/acdlite/react-fiber-architecture)
