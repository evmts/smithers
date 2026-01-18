# Smithers Codebase Export: reconciler

Generated: 2026-01-18T19:31:28.010Z
Section: reconciler - Core React renderer

---

## src/reconciler/README.md

```markdown
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

```

## src/reconciler/hooks.ts

```typescript
/**
 * Mount lifecycle hooks vendored from react-use
 * https://github.com/streamich/react-use
 * License: Unlicense (public domain)
 */

import {
  DependencyList,
  EffectCallback,
  useCallback,
  useEffect,
  useRef,
} from "react";

/**
 * Runs an effect exactly once when the component mounts.
 * Unlike a raw useEffect with [], this is semantically clear about intent.
 */
export const useEffectOnce = (effect: EffectCallback) => {
  useEffect(effect, []);
};

/**
 * Runs a callback when the component mounts.
 * More robust than useEffect(() => fn(), []) because it:
 * - Clearly communicates mount-only intent
 * - Is easier to grep for mount behavior
 */
export const useMount = (fn: () => void) => {
  useEffectOnce(() => {
    fn();
  });
};

/**
 * Runs a callback when the component unmounts.
 * More robust than useEffect cleanup because it:
 * - Always calls the latest version of the callback (via ref)
 * - Avoids stale closure issues that plague normal cleanup functions
 */
export const useUnmount = (fn: () => void): void => {
  const fnRef = useRef(fn);

  // Update the ref each render so if it changes, the newest callback will be invoked
  fnRef.current = fn;

  useEffectOnce(() => () => fnRef.current());
};

/**
 * Returns true only on the first render, false on all subsequent renders.
 * Useful for skipping effects on mount or detecting initial state.
 */
export function useFirstMountState(): boolean {
  const isFirst = useRef(true);

  if (isFirst.current) {
    isFirst.current = false;
    return true;
  }

  return isFirst.current;
}

/**
 * Returns a function that tells you if the component is currently mounted.
 * Essential for avoiding "setState on unmounted component" warnings in async code.
 *
 * @example
 * const isMounted = useMountedState();
 *
 * useEffect(() => {
 *   fetchData().then(data => {
 *     if (isMounted()) {
 *       setData(data);
 *     }
 *   });
 * }, []);
 */
export function useMountedState(): () => boolean {
  const mountedRef = useRef<boolean>(false);
  const get = useCallback(() => mountedRef.current, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  return get;
}

/**
 * Returns the value from the previous render.
 * Returns undefined on the first render.
 *
 * @example
 * const count = useCount();
 * const prevCount = usePrevious(count);
 * // On first render: prevCount is undefined
 * // After count changes: prevCount is the old value
 */
export function usePrevious<T>(state: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = state;
  });

  return ref.current;
}

const UNSET = Symbol("unset");

/**
 * Runs an effect when a value changes, with idempotency guarantees.
 * Unlike useEffect with [value], this:
 * - Won't run twice for the same value (handles React strict mode)
 * - Updates the "last seen" value synchronously before running the effect
 * - Runs on first mount (when value first becomes available)
 *
 * @example
 * const ralphCount = ralph?.ralphCount ?? 0;
 *
 * useEffectOnValueChange(ralphCount, () => {
 *   // Runs once when ralphCount changes, idempotent
 *   executeTask();
 * });
 */
export function useEffectOnValueChange<T>(
  value: T,
  effect: () => void | (() => void),
  deps: DependencyList = []
): void {
  const lastValueRef = useRef<T | typeof UNSET>(UNSET);

  useEffect(() => {
    if (lastValueRef.current !== UNSET && Object.is(lastValueRef.current, value)) {
      return;
    }
    lastValueRef.current = value;
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ...deps]);
}

```

## src/reconciler/host-config.ts

```typescript
import Reconciler from 'react-reconciler'
import type { SmithersNode } from './types.js'
import { rendererMethods } from './methods.js'

// Re-export rendererMethods for backwards compatibility
export { rendererMethods }

type Props = Record<string, unknown>
type Container = SmithersNode
type Instance = SmithersNode
type TextInstance = SmithersNode
type PublicInstance = SmithersNode
type HostContext = object
type UpdatePayload = Props

/**
 * React Reconciler host configuration for SmithersNode trees.
 * This maps React's reconciliation operations to our SmithersNode structure.
 *
 * Note: Using type assertion because react-reconciler types don't fully match
 * the actual API requirements for React 19.
 */
const hostConfig = {
  // Core configuration
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,

  // Timing
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1 as const,

  // Context
  getRootHostContext(): HostContext {
    return {}
  },

  getChildHostContext(parentHostContext: HostContext): HostContext {
    return parentHostContext
  },

  // Instance creation
  createInstance(type: string, props: Props): Instance {
    const node = rendererMethods.createElement(type)

    // Apply all props
    for (const [key, value] of Object.entries(props)) {
      if (key !== 'children') {
        rendererMethods.setProperty(node, key, value)
      }
    }

    return node
  },

  createTextInstance(text: string): TextInstance {
    return rendererMethods.createTextNode(text)
  },

  // Tree manipulation (mutation mode)
  appendChild(parent: Container, child: Instance | TextInstance): void {
    rendererMethods.insertNode(parent, child)
  },

  appendInitialChild(parent: Instance, child: Instance | TextInstance): void {
    rendererMethods.insertNode(parent, child)
  },

  appendChildToContainer(container: Container, child: Instance | TextInstance): void {
    rendererMethods.insertNode(container, child)
  },

  insertBefore(
    parent: Container,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance
  ): void {
    rendererMethods.insertNode(parent, child, beforeChild)
  },

  insertInContainerBefore(
    container: Container,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance
  ): void {
    rendererMethods.insertNode(container, child, beforeChild)
  },

  removeChild(parent: Container, child: Instance | TextInstance): void {
    rendererMethods.removeNode(parent, child)
  },

  removeChildFromContainer(container: Container, child: Instance | TextInstance): void {
    rendererMethods.removeNode(container, child)
  },

  // Updates
  prepareUpdate(
    _instance: Instance,
    _type: string,
    oldProps: Props,
    newProps: Props
  ): UpdatePayload | null {
    // Check if props have changed
    const updatePayload: Props = {}
    let hasChanges = false

    for (const key of Object.keys(newProps)) {
      if (key === 'children') continue
      if (oldProps[key] !== newProps[key]) {
        updatePayload[key] = newProps[key]
        hasChanges = true
      }
    }

    // Check for removed props
    for (const key of Object.keys(oldProps)) {
      if (key === 'children') continue
      if (!(key in newProps)) {
        updatePayload[key] = undefined
        hasChanges = true
      }
    }

    return hasChanges ? updatePayload : null
  },

  commitUpdate(
    instance: Instance,
    updatePayload: UpdatePayload,
    _type: string,
    _oldProps: Props,
    _newProps: Props
  ): void {
    for (const [key, value] of Object.entries(updatePayload)) {
      if (value === undefined) {
        delete instance.props[key]
      } else {
        rendererMethods.setProperty(instance, key, value)
      }
    }
  },

  commitTextUpdate(
    textInstance: TextInstance,
    _oldText: string,
    newText: string
  ): void {
    rendererMethods.replaceText(textInstance, newText)
  },

  // Finalization
  finalizeInitialChildren(): boolean {
    return false
  },

  prepareForCommit(): Record<string, unknown> | null {
    return null
  },

  resetAfterCommit(): void {
    // No-op
  },

  // Required methods
  getPublicInstance(instance: Instance): PublicInstance {
    return instance
  },

  shouldSetTextContent(): boolean {
    return false
  },

  clearContainer(container: Container): void {
    container.children = []
  },

  // Event handling (not used for Smithers)
  preparePortalMount(): void {
    // No-op
  },

  // Detach/attach (for offscreen trees)
  detachDeletedInstance(): void {
    // No-op
  },

  // Required for newer React versions
  getCurrentEventPriority(): number {
    return 16 // DefaultEventPriority (DiscreteEventPriority = 1, ContinuousEventPriority = 4, DefaultEventPriority = 16)
  },

  getInstanceFromNode(): null {
    return null
  },

  beforeActiveInstanceBlur(): void {
    // No-op
  },

  afterActiveInstanceBlur(): void {
    // No-op
  },

  prepareScopeUpdate(): void {
    // No-op
  },

  getInstanceFromScope(): null {
    return null
  },

  setCurrentUpdatePriority(): void {
    // No-op
  },

  getCurrentUpdatePriority(): number {
    return 16
  },

  resolveUpdatePriority(): number {
    return 16
  },

  // For microtasks (React 18+)
  supportsMicrotasks: true,
  scheduleMicrotask:
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (callback: () => void) => Promise.resolve().then(callback),

  // For hiding/unhiding instances (Suspense boundaries)
  hideInstance(): void {
    // No-op
  },

  hideTextInstance(): void {
    // No-op
  },

  unhideInstance(): void {
    // No-op
  },

  unhideTextInstance(): void {
    // No-op
  },

  // Resources (React 19+)
  NotPendingTransition: null,
  resetFormInstance(): void {
    // No-op
  },
  requestPostPaintCallback(): void {
    // No-op
  },
  shouldAttemptEagerTransition(): boolean {
    return false
  },
  maySuspendCommit(): boolean {
    return false
  },
  preloadInstance(): boolean {
    return true
  },
  startSuspendingCommit(): void {
    // No-op
  },
  suspendInstance(): void {
    // No-op
  },
  waitForCommitToBeReady(): null {
    return null
  },
}

/**
 * Create the React Reconciler instance
 */
export const SmithersReconciler = Reconciler(hostConfig)

// Enable concurrent features
SmithersReconciler.injectIntoDevTools({
  findFiberByHostInstance: () => null,
  bundleType: process.env.NODE_ENV === 'development' ? 1 : 0,
  version: '19.0.0',
  rendererPackageName: 'smithers-react-renderer',
})

export type { SmithersNode }

```

## src/reconciler/index.ts

```typescript
/**
 * Smithers Reconciler - Custom React renderer for AI orchestration
 *
 * This module exports everything needed to render React components
 * to SmithersNode trees.
 */

// Root creation and mounting
export { createSmithersRoot, getCurrentTreeXML } from "./root.js";
export type { SmithersRoot } from "./root.js";

// Low-level renderer methods (for testing without JSX)
export { rendererMethods } from "./methods.js";

// React reconciler instance and host config
export { SmithersReconciler, rendererMethods as hostConfigMethods } from "./host-config.js";

// Serialization
export { serialize } from "./serialize.js";

// Types
export type {
  SmithersNode,
  ExecutionState,
  ExecuteOptions,
  ExecutionResult,
  DebugOptions,
  DebugEvent,
} from "./types.js";

// Re-export React hooks for convenience
export {
  useState,
  useEffect,
  useContext,
  useMemo,
  useCallback,
  useRef,
  useReducer,
  createContext,
} from "react";

// Custom hooks
export {
  useEffectOnce,
  useMount,
  useUnmount,
  useFirstMountState,
  useMountedState,
} from "./hooks.js";

```

## src/reconciler/jsx-runtime.ts

```typescript
/**
 * JSX Runtime for Smithers
 *
 * This module provides the jsx/jsxs/Fragment functions used by babel's
 * automatic JSX runtime to compile JSX to SmithersNode trees.
 */

import type { SmithersNode } from './types.js'

/**
 * Type guard for SmithersNode
 */
function isSmithersNode(value: any): value is SmithersNode {
  return value && typeof value === 'object' && 'type' in value && 'props' in value && 'children' in value
}

/**
 * Create a SmithersNode from JSX
 */
function createNode(
  type: string | ((props: any) => any),
  props: Record<string, any>,
  key?: string | number
): SmithersNode | any {
  // Extract children from props
  const { children, ...restProps } = props

  // If type is a function, it's a component - call it
  if (typeof type === 'function') {
    return type(props)
  }

  // Create a SmithersNode
  const node: SmithersNode = {
    type: type as string,
    props: restProps,
    children: [],
    parent: null,
  }

  // Handle key
  if (key !== undefined) {
    node.key = key
  }

  // Process children
  const childArray = Array.isArray(children) ? children.flat(Infinity) : (children != null ? [children] : [])

  for (const child of childArray) {
    if (child == null || child === false || child === true) {
      continue
    }

    if (typeof child === 'string' || typeof child === 'number') {
      // Create text node
      const textNode: SmithersNode = {
        type: 'TEXT',
        props: { value: String(child) },
        children: [],
        parent: node,
      }
      node.children.push(textNode)
    } else if (isSmithersNode(child)) {
      // Add child node
      child.parent = node
      node.children.push(child)
    }
  }

  return node
}

/**
 * jsx function for automatic runtime (single child)
 */
export function jsx(type: string | ((props: any) => any), props: Record<string, any>, key?: string | number): any {
  return createNode(type, props, key)
}

/**
 * jsxs function for automatic runtime (multiple children)
 */
export function jsxs(type: string | ((props: any) => any), props: Record<string, any>, key?: string | number): any {
  return createNode(type, props, key)
}

/**
 * Fragment - returns children as-is
 */
export function Fragment(props: { children?: any }): any {
  return props.children
}

/**
 * jsxDEV for development mode
 */
export function jsxDEV(type: string | ((props: any) => any), props: Record<string, any>, key?: string | number): any {
  return createNode(type, props, key)
}

export type { SmithersNode }

```

## src/reconciler/methods.ts

```typescript
import type { SmithersNode } from './types.js'

/**
 * Renderer configuration methods.
 * Exported separately for direct testing without JSX.
 * This file has NO React dependencies - it's framework-agnostic.
 */
export const rendererMethods = {
  createElement(type: string): SmithersNode {
    return {
      type,
      props: {},
      children: [],
      parent: null,
    }
  },

  createTextNode(text: string): SmithersNode {
    return {
      type: 'TEXT',
      props: { value: text },
      children: [],
      parent: null,
    }
  },

  replaceText(node: SmithersNode, text: string): void {
    node.props['value'] = text
  },

  setProperty(node: SmithersNode, name: string, value: unknown): void {
    if (name === 'children') {
      // Children are handled by insertNode, not setProperty
      return
    }
    if (name === 'key') {
      // Key is stored on the node itself for the Ralph Wiggum loop
      node.key = value as string | number
      return
    }
    // All other props go into props object
    node.props[name] = value
  },

  insertNode(parent: SmithersNode, node: SmithersNode, anchor?: SmithersNode): void {
    node.parent = parent
    if (anchor) {
      const idx = parent.children.indexOf(anchor)
      if (idx !== -1) {
        parent.children.splice(idx, 0, node)
        return
      }
    }
    parent.children.push(node)
  },

  removeNode(parent: SmithersNode, node: SmithersNode): void {
    const idx = parent.children.indexOf(node)
    if (idx >= 0) {
      parent.children.splice(idx, 1)
    }
    node.parent = null
  },

  isTextNode(node: SmithersNode): boolean {
    return node.type === 'TEXT'
  },

  getParentNode(node: SmithersNode): SmithersNode | undefined {
    return node.parent ?? undefined
  },

  getFirstChild(node: SmithersNode): SmithersNode | undefined {
    return node.children[0]
  },

  getNextSibling(node: SmithersNode): SmithersNode | undefined {
    if (!node.parent) return undefined
    const idx = node.parent.children.indexOf(node)
    if (idx === -1) return undefined
    return node.parent.children[idx + 1]
  },
}

export type { SmithersNode }

```

## src/reconciler/root.ts

```typescript
import type { ReactNode } from 'react'
import { SmithersReconciler } from './host-config.js'
import type { SmithersNode } from './types.js'
import { serialize } from './serialize.js'
import { createOrchestrationPromise } from '../components/Ralph.jsx'

// Type for the fiber root container
type FiberRoot = ReturnType<typeof SmithersReconciler.createContainer>

// Module-level reference to the current root for frame capture
let currentRootNode: SmithersNode | null = null

/**
 * Get the current tree serialized as XML.
 * Used by SmithersProvider to capture render frames.
 */
export function getCurrentTreeXML(): string | null {
  if (!currentRootNode) return null
  return serialize(currentRootNode)
}

/**
 * Smithers root for mounting React components.
 */
export interface SmithersRoot {
  /**
   * Mount the app and wait for orchestration to complete.
   * Returns a Promise that resolves when Ralph signals completion.
   */
  mount(App: () => ReactNode | Promise<ReactNode>): Promise<void>
  getTree(): SmithersNode
  dispose(): void
  /**
   * Serialize the tree to XML for display/approval.
   * This is crucial for showing users the agent plan before execution.
   */
  toXML(): string
}

/**
 * Create a Smithers root for rendering React components to SmithersNode trees.
 */
export function createSmithersRoot(): SmithersRoot {
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }

  // Set module-level reference for frame capture
  currentRootNode = rootNode

  let fiberRoot: FiberRoot | null = null

  return {
    async mount(App: () => ReactNode | Promise<ReactNode>): Promise<void> {
      // Clean up previous render
      if (fiberRoot) {
        SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
        rootNode.children = []
      }

      // Create a promise that Ralph will resolve when orchestration completes
      const completionPromise = createOrchestrationPromise()

      // Check if App returns a Promise
      const result = App()

      let element: ReactNode

      if (result && typeof (result as any).then === 'function') {
        // App is async - we need to await the JSX first
        element = await (result as Promise<ReactNode>)
      } else {
        // App is sync
        element = result as ReactNode
      }

      // Create the fiber root container
      // createContainer signature: (containerInfo, tag, hydrate, hydrationCallbacks, isStrictMode, concurrentUpdatesByDefaultOverride, identifierPrefix, transitionCallbacks)
      fiberRoot = SmithersReconciler.createContainer(
        rootNode, // container
        0, // LegacyRoot tag (ConcurrentRoot = 1)
        null, // hydrationCallbacks
        false, // isStrictMode
        null, // concurrentUpdatesByDefaultOverride
        '', // identifierPrefix
        (error: Error) => console.error('Smithers recoverable error:', error), // onRecoverableError
        null // transitionCallbacks
      )

      // Render the app
      SmithersReconciler.updateContainer(element, fiberRoot, null, () => {})

      // Flush the initial render synchronously
      SmithersReconciler.flushSync(() => {})

      // Wait for orchestration to complete (Ralph will signal this)
      await completionPromise
    },

    getTree(): SmithersNode {
      return rootNode
    },

    dispose(): void {
      if (fiberRoot) {
        SmithersReconciler.updateContainer(null, fiberRoot, null, () => {})
        fiberRoot = null
      }
      rootNode.children = []
    },

    toXML(): string {
      return serialize(rootNode)
    },
  }
}

```

## src/reconciler/serialize.ts

```typescript
import type { SmithersNode } from './types.js'

/**
 * Known component types that have meaning in Smithers.
 * If a known type appears under an unknown parent, we add a warning.
 */
const KNOWN_TYPES = new Set([
  'claude',
  'ralph',
  'phase',
  'step',
  'task',
  'persona',
  'constraints',
  'human',
  'smithers-stop',
  'subagent',
  'orchestration',
  'review',
  'text',
  'root',
  'messages',
  'message',
  'tool-call',
])

/**
 * Add warnings to nodes when known components appear inside unknown elements.
 * This helps detect accidental nesting like <loop><Claude>...</Claude></loop>
 * where the user likely didn't want Claude to execute.
 */
function addWarningsForUnknownParents(node: SmithersNode): void {
  // Clear previous warnings to ensure idempotency when serialize() is called multiple times
  node.warnings = []

  const type = node.type.toLowerCase()
  const isKnown = KNOWN_TYPES.has(type)

  // Walk up to find unknown parent
  let parent = node.parent
  while (parent) {
    const parentType = parent.type.toLowerCase()

    // If parent is a known type, stop walking - the parent will get its own warning if needed.
    // This prevents redundant warnings for deeply nested known components.
    if (KNOWN_TYPES.has(parentType)) {
      break
    }

    if (parent.type !== 'ROOT') {
      if (isKnown) {
        node.warnings.push(
          `<${node.type}> rendered inside unknown element <${parent.type}>`
        )
      }
      break
    }
    parent = parent.parent
  }

  // Clean up: remove empty warnings array
  if (node.warnings.length === 0) {
    delete node.warnings
  }

  // Recurse to children
  for (const child of node.children) {
    addWarningsForUnknownParents(child)
  }
}

/**
 * Serialize a SmithersNode tree to XML string.
 * This XML is the "plan" shown to users before execution.
 *
 * GOTCHA: When testing entity escaping, create nodes MANUALLY without JSX!
 * JSX pre-escapes entities, so using JSX in tests will cause double-escaping.
 *
 * Example transformations:
 * - { type: 'task', props: { name: 'test' }, children: [] } → '<task name="test" />'
 * - { type: 'ROOT', children: [...] } → children joined with \n (no <ROOT> wrapper)
 * - node.key appears FIRST in attributes (before other props)
 */
export function serialize(node: SmithersNode): string {
  // Skip null/undefined nodes
  if (!node || !node.type) {
    return ''
  }

  // Add warnings for known components under unknown parents (once at root)
  addWarningsForUnknownParents(node)

  return serializeNode(node)
}

/**
 * Internal recursive serialization (doesn't add warnings).
 */
function serializeNode(node: SmithersNode): string {
  // Skip null/undefined nodes
  if (!node || !node.type) {
    return ''
  }

  // TEXT nodes: just escape and return the value
  if (node.type === 'TEXT') {
    return escapeXml(String(node.props['value'] ?? ''))
  }

  // ROOT nodes: serialize children without wrapper tags
  if (node.type === 'ROOT') {
    return node.children.filter(c => c && c.type).map(serializeNode).filter(s => s).join('\n')
  }

  const tag = node.type.toLowerCase()

  // Key attribute goes FIRST (if present) for readability
  const keyAttr = node.key !== undefined ? ` key="${escapeXml(String(node.key))}"` : ''

  // Then other props (filtered and escaped)
  const attrs = serializeProps(node.props)

  // Serialize children recursively
  const children = node.children.filter(c => c && c.type).map(serializeNode).filter(s => s).join('\n')

  // Self-closing tag if no children
  if (!children) {
    return `<${tag}${keyAttr}${attrs} />`
  }

  // Otherwise wrap children with indentation
  return `<${tag}${keyAttr}${attrs}>\n${indent(children)}\n</${tag}>`
}

/**
 * Serialize props to XML attributes.
 *
 * GOTCHA: Several props must be filtered out:
 * - callbacks (onFinished, onError, etc.)
 * - children (handled separately)
 * - key (handled separately via node.key)
 * - any function values
 */
function serializeProps(props: Record<string, unknown>): string {
  // Props that should never appear in XML
  const nonSerializable = new Set([
    'children',      // Handled separately, not a prop
    'onFinished',    // Callbacks are runtime-only
    'onError',
    'onStreamStart',
    'onStreamDelta',
    'onStreamEnd',
    'validate',      // Functions don't serialize
    'key',           // Stored on node.key, not props
  ])

  return Object.entries(props)
    .filter(([key]) => !nonSerializable.has(key))
    .filter(([, value]) => value !== undefined && value !== null)
    .filter(([, value]) => typeof value !== 'function')  // Extra safety: no functions
    .map(([key, value]) => {
      // GOTCHA: Object props need to be serialized as JSON
      if (typeof value === 'object') {
        return ` ${key}="${escapeXml(JSON.stringify(value))}"`
      }
      return ` ${key}="${escapeXml(String(value))}"`
    })
    .join('')
}

/**
 * Escape XML entities.
 *
 * CRITICAL GOTCHA: & MUST be replaced FIRST!
 * Otherwise you'll double-escape: '<' → '&lt;' → '&amp;lt;' ☠️
 *
 * Correct order: & first, then others
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')   // MUST be first!
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')  // Optional but good to have
}

function indent(str: string, spaces = 2): string {
  const prefix = ' '.repeat(spaces)
  return str.split('\n').map(line => prefix + line).join('\n')
}

```

## src/reconciler/types.ts

```typescript
/**
 * Core type definitions for Smithers reconciler.
 * These types define the SmithersNode tree structure that the reconciler creates.
 *
 * Key architectural principle: Components execute themselves via onMount,
 * not via external orchestrators. State changes (via React signals) trigger
 * re-renders, which trigger re-execution. This is the "Ralph Wiggum loop"
 * pattern - change the key prop to force unmount/remount.
 */

export interface SmithersNode {
  /** Node type: 'claude', 'phase', 'step', 'TEXT', etc. */
  type: string
  /** Props passed to the component */
  props: Record<string, unknown>
  /** Child nodes */
  children: SmithersNode[]
  /** Reference to parent node (null for root) */
  parent: SmithersNode | null
  /**
   * Unique key for reconciliation.
   * CRITICAL for the "Ralph Wiggum loop" - changing this forces unmount/remount,
   * which triggers re-execution of onMount handlers.
   */
  key?: string | number
  /** Runtime execution state */
  _execution?: ExecutionState
  /** Validation warnings (e.g., known component inside unknown element) */
  warnings?: string[]
}

export interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown
  error?: Error
  contentHash?: string
}

export interface ExecuteOptions {
  maxFrames?: number
  timeout?: number
  verbose?: boolean
  mockMode?: boolean
  debug?: DebugOptions
}

export interface ExecutionResult {
  output: unknown
  frames: number
  totalDuration: number
}

export interface DebugOptions {
  enabled?: boolean
  onEvent?: (event: DebugEvent) => void
}

export interface DebugEvent {
  type: string
  timestamp?: number
  [key: string]: unknown
}

```

---

## Export Metadata

- **Section**: reconciler
- **Total files**: 9
- **Truncated files**: 0
- **Export date**: 1/18/2026, 11:31:28 AM
