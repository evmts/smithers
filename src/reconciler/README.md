# Smithers Reconciler

Custom React renderer that transforms JSX into executable AI agent trees.

## What is this?

React isn't just for DOM or mobile - it's a general-purpose UI reconciliation engine. This folder contains a **custom React renderer** that outputs `SmithersNode` trees instead of DOM elements. These trees represent AI agent orchestration plans that can be serialized to XML and executed.

## File Structure

```
src/reconciler/
├── index.ts           # Public exports
├── jsx-runtime.ts     # JSX transform (jsx, jsxs, Fragment)
├── types.ts           # SmithersNode, ExecutionState
├── host-config.ts     # React reconciler host config
├── methods.ts         # Low-level node operations
├── root.ts            # createSmithersRoot(), mount()
├── serialize.ts       # Tree → XML serialization
└── hooks.ts           # useMount, useUnmount, useMountedState
```

## The Full Picture: JSX to Execution

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              YOUR JSX CODE                                      │
│                                                                                 │
│   function MyAgent() {                                                          │
│     const { ralphCount } = useSmithers()                                        │
│     return (                                                                    │
│       <Orchestration>                                                           │
│         <Phase name="build">                                                    │
│           <Claude>                                                              │
│             Fix the bug in auth.ts (iteration {ralphCount})                     │
│           </Claude>                                                             │
│         </Phase>                                                                │
│       </Orchestration>                                                          │
│     )                                                                           │
│   }                                                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ Babel/TypeScript transforms JSX
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         JSX RUNTIME (jsx-runtime.ts)                            │
│                                                                                 │
│   // CUSTOM wrapper around React's JSX runtime that exposes React's key:        │
│   import { jsx as reactJsx } from 'react/jsx-runtime'                           │
│                                                                                 │
│   function withSmithersKey(props, key) {                                        │
│     if (key == null) return props                                               │
│     return { ...props, __smithersKey: key }  // Inject key as prop              │
│   }                                                                             │
│                                                                                 │
│   export function jsx(type, props, key) {                                       │
│     return reactJsx(type, withSmithersKey(props, key), key)                     │
│   }                                                                             │
│                                                                                 │
│   // This allows SmithersNode.key to be populated from React's key              │
│   // for plan serialization (key="0" appears in XML output).                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ React processes component tree
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         REACT INTERNALS (Fiber Tree)                            │
│                              WE DON'T OWN THIS                                  │
│                                                                                 │
│   React builds an internal "fiber" tree that tracks:                            │
│   - Component instances and their state (useState, useEffect, etc.)             │
│   - Which nodes changed and need updates                                        │
│   - Parent/child/sibling relationships                                          │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  FiberNode (MyAgent)                                                    │   │
│   │  ├─ hooks: [{state: 0, setState: fn}]    ← useState lives here          │   │
│   │  └─ child ─→ FiberNode (Ralph)                                          │   │
│   │              ├─ key: 0                                                  │   │
│   │              └─ child ─→ FiberNode (Phase)                              │   │
│   │                          └─ child ─→ FiberNode (Claude)                 │   │
│   │                                       └─ hooks: [{state:'pending'}]     │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│   When state changes (setCount), React:                                         │
│   1. Marks affected fibers as "needs update"                                    │
│   2. Re-renders components to get new elements                                  │
│   3. Diffs old vs new to find what changed                                      │
│   4. Calls our HOST CONFIG methods to apply changes                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          │                             │                             │
          ▼                             ▼                             ▼
   createInstance()              appendChild()               commitUpdate()
   createTextInstance()          removeChild()               commitTextUpdate()
                                 insertBefore()
          │                             │                             │
          └─────────────────────────────┼─────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      HOST CONFIG (host-config.ts)                               │
│                            WE OWN THIS                                          │
│                                                                                 │
│   This is the "bridge" between React and our SmithersNode tree.                 │
│   React calls these methods; we implement them.                                 │
│                                                                                 │
│   const hostConfig = {                                                          │
│     createInstance(type, props) {                                               │
│       // React says "make a <phase>" → we create SmithersNode                   │
│       return rendererMethods.createElement(type)                                │
│     },                                                                          │
│     appendChild(parent, child) {                                                │
│       // React says "put child under parent"                                    │
│       rendererMethods.insertNode(parent, child)                                 │
│     },                                                                          │
│     commitUpdate(instance, payload) {                                           │
│       // React says "props changed on this node"                                │
│       Object.assign(instance.props, payload)                                    │
│     },                                                                          │
│   }                                                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ delegates to
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       RENDERER METHODS (methods.ts)                             │
│                            WE OWN THIS                                          │
│                                                                                 │
│   Low-level operations on SmithersNode trees.                                   │
│   No React dependency - pure data structure manipulation.                       │
│                                                                                 │
│   rendererMethods = {                                                           │
│     createElement(type) → SmithersNode                                          │
│     createTextNode(text) → SmithersNode                                         │
│     setProperty(node, key, value)                                               │
│     insertNode(parent, child, anchor?)                                          │
│     removeNode(parent, child)                                                   │
│   }                                                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ creates/manipulates
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    SMITHERS NODE TREE (types.ts)                                │
│                            WE OWN THIS                                          │
│                                                                                 │
│   interface SmithersNode {             ┌───────────────────────────────────┐    │
│     type: string                       │  ROOT                             │    │
│     props: Record<string, unknown>     │  └─ ralph {key:0}                 │    │
│     children: SmithersNode[]           │     └─ phase {name:"build"}       │    │
│     parent: SmithersNode | null        │        └─ claude {status:"..."}   │    │
│     key?: string | number              │           └─ TEXT "Fix the bug"   │    │
│   }                                    └───────────────────────────────────┘    │
│                                                                                 │
│   This is our "virtual DOM" - a plain JS object tree                            │
│   that represents the current state of the agent plan.                          │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
          ┌─────────────────────────────┴─────────────────────────────┐
          │                                                           │
          ▼                                                           ▼
┌─────────────────────────────────┐                 ┌─────────────────────────────┐
│   SERIALIZER (serialize.ts)     │                 │    COMPONENT EXECUTION      │
│                                 │                 │                             │
│   Converts tree to XML for      │                 │   Claude, Ralph, Phase      │
│   display and approval:         │                 │   components use useMount   │
│                                 │                 │   to execute on render:     │
│   <ralph key="0">               │                 │                             │
│     <phase name="build">        │                 │   useMount(() => {          │
│       <claude status="pending"> │                 │     // Call Claude API      │
│         Fix the bug             │                 │     // Update state         │
│       </claude>                 │                 │     // Trigger re-render    │
│     </phase>                    │                 │   })                        │
│   </ralph>                      │                 │                             │
└─────────────────────────────────┘                 └─────────────────────────────┘
```

## The Ralph Wiggum Loop

The key insight is how React's reconciliation enables iterative orchestration:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          THE RALPH WIGGUM LOOP                               │
│                                                                              │
│   1. Initial render (managed by SmithersProvider)                            │
│      ┌─────────────────────┐                                                 │
│      │ <ralph iteration={0}>│  ← intrinsic element (serialized to XML)       │
│      │   <Claude />         │  ← React component                             │
│      └─────────────────────┘                                                 │
│              │                                                               │
│              ▼                                                               │
│   2. Claude mounts, executes, signals completion                             │
│      Completion triggers: ralphCount++ in SmithersProvider                   │
│              │                                                               │
│              ▼                                                               │
│   3. State change triggers re-render with new iteration                      │
│      ┌─────────────────────┐                                                 │
│      │ <ralph iteration={1}>│  ← iteration incremented                       │
│      │   <Claude />         │                                                │
│      └─────────────────────┘                                                 │
│              │                                                               │
│              ▼                                                               │
│   4. Components can react to iteration changes and re-execute                │
│      Loop continues until max iterations or explicit completion              │
│                                                                              │
│   Note: React's `key` prop can force remounts but is not passed as          │
│   props.key or to host config. Smithers injects __smithersKey for           │
│   serialization; treat it as internal and prefer explicit props            │
│   (like `iteration`) inside components.                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Comparison with React DOM

| React DOM | Smithers Reconciler |
|-----------|---------------------|
| `<div>` → DOM Element | `<phase>` → SmithersNode |
| `element.appendChild()` | `rendererMethods.insertNode()` |
| `element.style.color = 'red'` | `node.props.status = 'running'` |
| Browser renders pixels | Serializer outputs XML |
| User clicks trigger events | Claude responses trigger state changes |

## Why Not Just Build Objects Directly?

You could build SmithersNode trees manually, but React gives you:

1. **Hooks** - `useState`, `useEffect`, `useContext` for state management
2. **Reconciliation** - Efficient diffing when state changes
3. **Component model** - Reusable, composable pieces
4. **Lifecycle** - Mount/unmount/update hooks for execution timing
5. **Context** - Dependency injection without prop drilling
6. **Familiar API** - Leverage existing React knowledge

## Understanding React's `key` Prop vs SmithersNode.key

**Important distinction:**

- **React's `key` prop** - Used by React's reconciliation algorithm to track component identity. When a component's key changes, React unmounts the old instance and mounts a new one. React does not pass `key` as `props.key` or expose it to host config APIs.

- **SmithersNode.key** - An optional field on our SmithersNode data structure that gets serialized to XML as `key="..."` attribute for plan display.

### How Smithers exposes React's key:

Our custom `jsx-runtime.ts` intercepts JSX creation and injects the React key as `__smithersKey` prop:

```tsx
// When you write:
<MyComponent key={0}>...</MyComponent>

// jsx-runtime transforms it to include __smithersKey:
jsx(MyComponent, { __smithersKey: 0, children: ... }, 0)

// methods.ts then stores this on SmithersNode.key:
rendererMethods.setProperty(node, '__smithersKey', 0)
// → node.key = 0
```

### How to use keys correctly:

```tsx
// React's key DOES appear in plan XML output (via __smithersKey injection):
<Claude key={iteration}>...</Claude>
// Serializes to: <claude key="0" ...>

// Inside components, key is still not available as props.key:
function MyComponent({ key }) {  // key is always undefined!
  // Use iteration or another prop if you need the value
}

// __smithersKey *is* visible if you read/forward props, but treat it as internal.
// Pattern: use key for React remounting AND a regular prop for component access:
<MyComponent key={count} iteration={count} />
//           ^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^
//           Forces       Available in
//           remount      component props
```

### Key propagation flow:

```
JSX: <phase key="build">        jsx-runtime.ts              host-config.ts
     ────────────────────>  { __smithersKey: "build" }  ───────────────>  node.key = "build"
                                                                               │
                                                          serialize.ts         │
                                     <phase key="build">  <────────────────────┘
```

## Key Files Explained

### `jsx-runtime.ts`
Custom JSX runtime that wraps React's runtime to expose the `key` prop. Injects `__smithersKey` into props so it reaches our reconciler and can be stored on `SmithersNode.key` for plan serialization.

### `host-config.ts`
Implements React's reconciler interface. React calls `createInstance()`, `appendChild()`, etc. and we create/modify SmithersNodes.

### `methods.ts`
Pure functions for manipulating SmithersNode trees. No React dependency - useful for testing.

### `root.ts`
Creates the root container and provides `mount()` to render a React tree into it.

### `serialize.ts`
Converts SmithersNode tree to XML string. Handles escaping, indentation, and filters out non-serializable props like callbacks.

### `hooks.ts`
Vendored lifecycle hooks from react-use. `useMount` and `useUnmount` are clearer than raw `useEffect`.

## Usage

```tsx
import { createSmithersRoot } from './reconciler'

// Create a root
const root = createSmithersRoot()

// Mount your app (returns Promise that resolves when orchestration completes)
await root.mount(() => <MyAgent />)

// Get the tree or XML
const tree = root.getTree()
const xml = root.toXML()

// Clean up
root.dispose()
```
