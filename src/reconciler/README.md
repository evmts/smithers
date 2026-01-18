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
│     const [count, setCount] = useState(0)                                       │
│     return (                                                                    │
│       <Ralph key={count}>                                                       │
│         <Phase name="build">                                                    │
│           <Claude onFinished={() => setCount(c => c + 1)}>                      │
│             Fix the bug in auth.ts                                              │
│           </Claude>                                                             │
│         </Phase>                                                                │
│       </Ralph>                                                                  │
│     )                                                                           │
│   }                                                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ Babel/TypeScript transforms JSX
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         JSX RUNTIME (jsx-runtime.ts)                            │
│                                                                                 │
│   // Babel transforms <Ralph key={0}> into:                                     │
│   jsx(Ralph, { children: jsx(Phase, { ... }) }, 0)                              │
│                                                                                 │
│   // For function components: call them                                         │
│   // For intrinsic elements: create SmithersNode                                │
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

The key insight is how React's reconciliation enables the "Ralph Wiggum loop":

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          THE RALPH WIGGUM LOOP                               │
│                                                                              │
│   1. Initial render                                                          │
│      ┌────────────────┐                                                      │
│      │ <Ralph key={0}>│  ← key=0 on first iteration                          │
│      │   <Claude />   │                                                      │
│      └────────────────┘                                                      │
│              │                                                               │
│              ▼                                                               │
│   2. Claude mounts, executes, calls onFinished                               │
│      onFinished triggers: setCount(c => c + 1)                               │
│              │                                                               │
│              ▼                                                               │
│   3. State change triggers re-render                                         │
│      ┌────────────────┐                                                      │
│      │ <Ralph key={1}>│  ← key changed! React sees this as NEW component     │
│      │   <Claude />   │                                                      │
│      └────────────────┘                                                      │
│              │                                                               │
│              ▼                                                               │
│   4. Old Ralph UNMOUNTS (cleanup runs)                                       │
│      New Ralph MOUNTS (fresh state, useMount runs again)                     │
│              │                                                               │
│              ▼                                                               │
│   5. Claude executes again with potentially different context                │
│      Loop continues until completion condition met                           │
│                                                                              │
│   This is React's reconciliation doing the heavy lifting!                    │
│   We just change a key prop, and React handles unmount/remount.              │
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

## Key Files Explained

### `jsx-runtime.ts`
Called by Babel when it transforms JSX. Converts `<phase name="test">` into `SmithersNode` objects.

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
