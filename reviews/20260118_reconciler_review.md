# Reconciler Technical Review

**Date:** 2026-01-18
**Scope:** `src/reconciler/` (renderer, root, serializer, hooks)
**Classification:** Production-critical infrastructure review

---

## Executive Assessment

### What's Working Well

- **Separation of concerns is clean**
  - `host-config.ts` is a thin React ↔ tree bridge
  - `methods.ts` is a pure data-structure layer (excellent for testing)
  - `serialize.ts` is standalone with correct escaping order
  - `root.ts` provides ergonomic mount API and test-focused `render()`

- **Mutation-mode renderer is appropriate** (`supportsMutation: true`)
  - `insertNode/removeNode/commitUpdate/commitTextUpdate` mappings are coherent
  - Won't fight React's expectations for a non-DOM host

- **Prop diffing is simple and serviceable** in `prepareUpdate`
  - Includes removed-prop handling

### High-Impact Issues (Fix Soon)

1. **"key" story is internally inconsistent and non-functional**
   - React's `key` isn't a normal prop (correct understanding)
   - Still has `SmithersNode.key` and unreachable handling in `setProperty('key', ...)`
   - `types.ts` claims key is "set by jsx-runtime", but pass-through `jsx-runtime.ts` doesn't do this
   - Currently in a "half state" that misleads maintainers

2. **Global singletons prevent safe concurrency**
   - `currentRootNode` singletons cause cross-run leakage
   - Multiple roots in one process will overwrite shared state
   - Parallel workflows, parallel tests, and server mode will cause frame capture to be incorrect

3. **`mount()` can hang forever on errors**
   - Unconditionally `await completionPromise`
   - Reconciler error callbacks only `console.error`
   - If React throws before orchestration resolves, mount never returns/rejects

4. **Event/update priority tracking is dead code**
   - `currentUpdatePriority` tracked but `getCurrentEventPriority()` returns `DefaultEventPriority` unconditionally
   - Makes `setCurrentUpdatePriority()` pointless

---

## Detailed Review by File

### `src/reconciler/host-config.ts`

#### Issue: Update priority implementation is inconsistent

**Current:**
```ts
getCurrentEventPriority(): number {
  return DefaultEventPriority
}
```

**Should be:**
```ts
getCurrentEventPriority(): number {
  return currentUpdatePriority
}

resolveUpdatePriority(): number {
  return currentUpdatePriority
}
```

#### Issue: `isPrimaryRenderer: true` could conflict in multi-renderer processes

**Risk:** If Smithers is ever embedded alongside ReactDOM or another primary renderer, this can create devtools/renderer identity conflicts.

**Recommendation:**
- If Smithers is always the only renderer in the process (CLI-only), this is fine
- If embedded alongside React DOM, consider `isPrimaryRenderer: false`

#### Issue: `prepareUpdate` equality semantics differ from React's

**Current:** Uses `oldProps[key] !== newProps[key]` which differs from `Object.is` for `NaN` and `-0`

**Better:**
```ts
if (!Object.is(oldProps[key], newProps[key])) { ... }
```

#### Issue: `clearContainer` only detaches immediate children

**Current:**
```ts
for (const child of container.children) {
  child.parent = null
}
container.children.length = 0
```

**Problem:** Descendant `parent` pointers remain intact (though unreachable), creating inconsistent invariants.

**Recommendation:**
```ts
clearContainer(container: Container): void {
  const children = [...container.children]
  for (const child of children) {
    rendererMethods.removeNode(container, child)
  }
}
```

---

### `src/reconciler/methods.ts`

#### Issue: Key handling is explicitly unreachable

**Current:**
```ts
if (name === 'key') {
  // NOTE: unreachable with React jsx-runtime
  node.key = value as string | number
  return
}
```

**Decision needed:** Choose one of three approaches:

**Option A (recommended):** Implement custom `jsx-runtime` wrapper
- Copy React's key into a normal prop (e.g., `__smithersKey`)
- Use that to set `node.key`
- Makes comments coherent and avoids Fiber internals

**Option B:** Read key from `internalInstanceHandle`
- Access Fiber internals in `createInstance`
- Faster change but creates React version dependency

**Option C:** Remove `SmithersNode.key` entirely
- Standardize on `planKey` or `iteration` props
- Simplest but loses `key="..."` convention

#### Issue: `removeNode` breaks subtree invariants

**Current:** Clears `parent` pointers for all descendants but does NOT clear `node.children`
- Detached node still has children
- Children have `parent = null` but node still references them

**Choose one consistent model:**

**Model 1 (recommended): Detached subtree remains internally consistent**
- Only set `node.parent = null` and remove from parent's children
- Leave descendant parent pointers intact
- Child still points to node, but node removed from root

**Model 2: Fully sever subtree**
- Clear `node.parent`, recursively clear descendants
- Clear `children` arrays
- Node is completely dead

---

### `src/reconciler/root.ts`

#### Issue: Global `currentRootNode` breaks multi-root execution

**Risk:**
- Parallel tests will interfere with each other
- Concurrent subagents with distinct roots will overwrite shared state
- Server mode with multiple requests will cause frame capture collisions

**Recommendation:** Make frame capture root-instance-scoped, not module-scoped

**Direction:**
- Remove module singleton
- Have `SmithersRoot` expose `toXML()` (already does)
- If SmithersProvider needs "current tree", pass a callback or object reference
- If legacy "globally-accessible current XML" is needed, make it opt-in and explicitly document: "not concurrency-safe"

#### Issue: `mount()` can hang indefinitely on errors

**Current:**
```ts
await completionPromise
```

**Problem:**
- Errors only `console.error` via root error callbacks
- If React throws before orchestrator promise resolves, mount never returns

**Minimum fix:**
```ts
let fatalError: unknown | null = null

fiberRoot = createContainer(...,
  (e) => { fatalError = e; orchestrationReject(e) },
  (e) => { fatalError = e; orchestrationReject(e) },
  (e) => { /* maybe log */ },
)

await Promise.race([completionPromise, errorPromise])
if (fatalError) throw fatalError
```

**Better:** Push errors into SmithersProvider's stop/requestStop pipeline.

#### Issue: Recreating Fiber root every `mount()` is unusual

**Current:**
- Unmount previous tree via `updateContainer(null, fiberRoot)`
- Create brand-new container via `createContainer(...)`

**Consideration:**
- May be fine if you want full React component state reset
- Alternative: reuse same fiber root with changing top-level key
- If recreating root, should also recreate `rootNode` container to avoid mixing old node identity references

#### Issue: Misleading comment about concurrent features

**Current:**
```ts
0 // tag: LegacyRoot (ConcurrentRoot = 1)
```

**Comment says:** "Enable concurrent features"

**Reality:** You're explicitly using LegacyRoot (NOT concurrent)

**Fix:** Update comment to accurately reflect LegacyRoot choice and scheduling semantics

---

### `src/reconciler/serialize.ts`

Well-structured; escaping is correct (notably `&` first). Several maintainability issues:

#### Issue: Serialization mutates the node tree

**Current:** `serialize()` calls `addWarningsForUnknownParents(node)` which clears/sets `node.warnings`

**If warnings are runtime validation state:** Mutation is okay but should be explicit—serialization is no longer a pure operation.

**If serialization should be pure:** Compute warnings externally and either:
- Return them alongside XML
- Embed as XML comments
- Expose separate `validateTree(root)` call

**Optimization:** Clearing warnings allocates arrays each time. Prefer:
```ts
delete node.warnings;  // At start, only allocate if needed
```

#### Issue: Object prop serialization poorly handles schema-like props

**Current:** JSON serializes any `typeof value === 'object'`

**Problems:**
- Blows up on Zod schemas (circular/huge)
- Leaks noisy details into plan output
- Produces unhelpful placeholder strings

**Recommendation:** Introduce "display formatter" layer for common Smithers props:
- `schema`: serialize to JSON Schema or friendly label
- Tool configs: small stable representation
- Large objects: "[Object]" with type name

**Minimum:** Add problematic keys (`schema`, `tools`, etc.) to `nonSerializable`

#### Issue: Non-deterministic attribute ordering

**Current:** `Object.entries(props)` uses insertion order (can change based on update history)

**Better:** Sort keys for stable snapshots and diffs
```ts
return Object.entries(props)
  .filter(...)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(...)
```

After special-casing `key` first, sorting everything else makes "plan diffs" much nicer.

#### Issue: KNOWN_TYPES registry maintenance

**Current:** Using KNOWN_TYPES both for warnings and unknown wrapper detection

**Will require:** Ongoing maintenance as you add components (`commit`, `jj-*`, etc.)

**Alternatives to reduce maintenance:**
- Treat any intrinsic element with `smithers-*` prefix as known
- Allow components to register known tags at runtime

---

### `src/reconciler/hooks.ts`

Implementation is sound. Two important points:

#### Issue: License header is incorrect

**Current:**
```
License: MIT (public domain)
```

**Fix:** MIT is NOT public domain (legal difference). Change to "MIT".

#### Issue: `useMount`/`useEffectOnce` and Strict Mode semantics

**Current:** `useEffectOnce(..., [])` is not truly "once" in React dev strict mode

**You pass:** `isStrictMode = false` to `createContainer`, but user can still wrap with `<React.StrictMode>`

**Given:** Smithers components may do side effects (Claude calls)

**Hardening options:**
- Explicitly document: "Do not use StrictMode in Smithers workflows"
- Add runtime guard at root mount (difficult)
- Ensure execution hooks are idempotent via execution IDs/content hashes (you already have `ExecutionState.contentHash`—good direction)

Your `useEffectOnValueChange` attempts idempotency, but won't necessarily protect against strict-mode remount patterns in all React versions.

---

### `src/reconciler/types.ts`

#### Issue: Misleading documentation

**Current comment on `SmithersNode.key`:**
> "set by jsx-runtime"

**Reality:** Your `jsx-runtime.ts` is a pass-through to React's runtime and does not set this.

**Fix:** Either:
1. Update comment to reflect reality, OR
2. Implement the runtime behavior to make it true (Option A from key discussion above)

---

## Design Decision: How "key" Should Work

Currently conflated:
1. React's reconciliation key (internal; not a prop)
2. Smithers plan key (serialized to XML)

### Option A: Custom JSX Runtime (Best DX)

Implement `jsx/jsxs` wrappers that copy key into props:
- React gets key for reconciliation
- You get normal prop (e.g., `__smithersKey`) for `SmithersNode.key`
- Makes comments and types coherent
- Avoids Fiber internals

### Option B: Read from `internalInstanceHandle` (Fastest)

Update `createInstance` to access Fiber shape directly. Technically possible but creates React version dependency.

### Option C: Drop `SmithersNode.key` (Simplest)

Standardize on `planKey` prop. Lose `key="..."` convention unless you map `planKey -> node.key` during serialization.

**Recommendation:** Implement **Option A**.

---

## Priority Recommendations

### P0 (Correctness / Reliability)

1. **Prevent mount hangs**
   - Wire React root errors to reject/stop orchestration
   - Never `await completionPromise` without an error path

2. **Fix event priority**
   - `getCurrentEventPriority()` should return the tracked priority, not always default

3. **Resolve the key model**
   - Implement Option A or remove misleading code/comments
   - Ensure types.ts reflects reality

4. **Remove/contain global singleton state**
   - `currentRootNode` prevents concurrent execution
   - Explicitly mark "single-root only" or refactor to root-scoped

### P1 (Maintainability / DX)

1. Make serialization deterministic (sort attributes)
2. Improve object prop display (especially schema-like props)
3. Make `removeNode` invariants consistent
4. Fix license header (MIT, not "public domain")
5. Fix concurrent features comment in root.ts

### P2 (Nice-to-Haves)

1. Add optional stable node IDs for improved diffing/debugging
2. Consider pure `validateTree()` instead of mutation in `serialize()`
3. Consider reusing fiber root vs recreating each mount (depends on desired state reset semantics)

---

## Bottom Line

The reconciler is **structurally strong** and close to "correct-by-construction," but has **foundational sharp edges** that matter when:

- Running more than one workflow per process
- Running tests in parallel
- Hitting an exception before orchestration resolves

**P0 items are correctness/reliability issues** that should be addressed before scaling orchestration.

All other issues are maintainability improvements that make the code more coherent and easier to extend.

---

## Action Items (1 per item)

### P0: mount never hangs on error
- Risk: mount() awaits completionPromise forever if React throws before orchestration resolves.
- Action: wire root errors to rejection/stop path; never await completionPromise without error path.
- Steps:
  1) In createContainer error callbacks, capture error + reject orchestration promise.
  2) await Promise.race([completionPromise, errorPromise]) and throw if error.
  3) Add test: simulated render error -> mount rejects promptly.

### P0: event priority tracking must work
- Risk: currentUpdatePriority tracked but getCurrentEventPriority returns DefaultEventPriority; priorities ignored.
- Action: return tracked priority; resolveUpdatePriority should use it too.
- Steps:
  1) getCurrentEventPriority() => currentUpdatePriority.
  2) resolveUpdatePriority() => currentUpdatePriority.
  3) Add unit test verifying setCurrentUpdatePriority influences returned priority.

### P0: key model must be coherent
- Risk: SmithersNode.key claims jsx-runtime sets it, but runtime is passthrough; key prop unreachable.
- Action: pick a single model; implement it.
- Steps (Option A preferred):
  1) Wrap jsx/jsxs to copy React key into explicit prop (e.g., __smithersKey).
  2) setProperty reads __smithersKey -> node.key.
  3) Update types/docs to match.

### P0: remove or isolate global singleton root state
- Risk: currentRootNode (and similar globals) break concurrency, cause cross-run leakage.
- Action: scope current tree to root instance; avoid module singletons.
- Steps:
  1) Remove module-level currentRootNode.
  2) Expose per-root toXML() and pass references where needed.
  3) If global needed, make it explicit/opt-in + documented as single-root only.

### P1: deterministic serialization ordering
- Risk: Object.entries preserves insertion order; diffs unstable.
- Action: sort prop keys deterministically.
- Steps:
  1) Sort keys lexicographically before serialization (after filtering).
  2) Keep key first if required, then sorted remainder.

### P1: object prop display policy
- Risk: JSON stringify of arbitrary objects (schemas, tools) is noisy or breaks.
- Action: add formatter for known heavy props; guard circular/huge objects.
- Steps:
  1) Add allowlist/formatter (schema/tools/etc.).
  2) For unknown objects, use stable placeholder (e.g., [Object Type]).
  3) Add tests for schema/tool props.

### P1: removeNode subtree invariants
- Risk: removeNode clears descendants' parent but leaves children arrays; inconsistent invariant.
- Action: choose one model and implement consistently.
- Steps (Model 1 recommended):
  1) Only detach node from parent + set node.parent = null.
  2) Leave child.parent pointers intact (subtree consistent).
  3) Add test for invariant after removal.

### P1: host-config clearContainer must fully detach
- Risk: current clearContainer only clears immediate children; descendants keep parent pointers.
- Action: reuse removeNode for each child or recursively clear.
- Steps:
  1) Copy children list; call removeNode(container, child).
  2) Add test ensuring descendants parent pointers cleared per chosen model.

### P1: license header correction
- Risk: "MIT (public domain)" is legally wrong.
- Action: change to "MIT".
- Steps:
  1) Update header text in hooks file.

### P1: comment correctness on concurrent features
- Risk: comment says "Enable concurrent features" while using LegacyRoot.
- Action: fix comment to match LegacyRoot behavior.
- Steps:
  1) Update comment to "LegacyRoot" or remove misleading text.

### P1: types.ts key doc fix
- Risk: doc claims key set by jsx-runtime; not true.
- Action: update comment to reflect actual key source (or after implementing Option A).
- Steps:
  1) Align types comment with chosen key model.

### P2: serialize side effects clarity
- Risk: serialize mutates warnings; not a pure function.
- Action: either make side effects explicit or move to validateTree().
- Steps:
  1) Choose: keep mutation w/ explicit docs or extract validateTree.
  2) If keep mutation, avoid allocations: delete warnings then set if needed.

### P2: KNOWN_TYPES growth strategy
- Risk: registry drift/maintenance burden.
- Action: define extension strategy (prefix convention or runtime registration).
- Steps:
  1) Decide rule (e.g., smithers-* prefix).
  2) Update warnings logic accordingly.

### P2: reuse vs recreate fiber root
- Risk: recreate each mount is heavy; rootNode identity may leak.
- Action: decide reset semantics; implement consistently.
- Steps:
  1) If reuse root, render top element with changing key to reset state.
  2) If recreate, also recreate rootNode to avoid identity reuse.

### P2: StrictMode safety for hooks
- Risk: useMount/useEffectOnce not truly once in StrictMode.
- Action: guard/document StrictMode usage.
- Steps:
  1) Add explicit warning or runtime guard against StrictMode.
  2) Consider idempotency via execution IDs/content hashes where side effects occur.

---

## Status: MOSTLY RESOLVED

**Review Date:** 2026-01-18

### Resolved Issues

| Issue | Evidence |
|-------|----------|
| **P0: mount hangs** | `root.ts:79-89` wires fatal errors to reject + `Promise.race` at L125 |
| **P0: event priority** | `host-config.ts:204-238` returns `currentUpdatePriority` in all three methods |
| **P0: key model** | `jsx-runtime.ts:16-21` copies key to `__smithersKey`, `methods.ts:36-40` handles it |
| **P0: global singleton** | `root.ts:39-54` makes it opt-in with `setGlobalFrameCaptureRoot` + explicit docs |
| **P1: license header** | `hooks.ts:5` now says "License: MIT" only (no "public domain") |
| **P1: LegacyRoot comment** | `root.ts:109` comment says "LegacyRoot" explicitly |
| **P1: types.ts key doc** | `types.ts:21-24` accurately describes jsx-runtime behavior |

### Still Relevant Issues

#### P1: removeNode subtree invariants
- **Current behavior:** `methods.ts:70-87` clears descendant parent pointers but leaves `node.children` arrays intact
- **Problem:** Inconsistent invariant - detached node still has children, but children have `parent = null`

#### P1: clearContainer incomplete cleanup
- **Current behavior:** `host-config.ts:185-191` only clears immediate children's parent pointers
- **Problem:** Does not use `removeNode` pattern; descendants keep their parent pointers

---

## Debugging Plan

### Files to Investigate
1. `src/reconciler/methods.ts` - `removeNode` function (L70-87)
2. `src/reconciler/host-config.ts` - `clearContainer` function (L185-191)

### Grep Patterns
```bash
# Find all removeNode calls
grep -n "removeNode" src/reconciler/

# Find clearContainer usages
grep -n "clearContainer" src/reconciler/

# Check for parent pointer assignments
grep -n "\.parent\s*=" src/reconciler/
```

### Test Commands
```bash
# Run existing reconciler tests
bun test src/reconciler/

# Manual verification: create test that checks invariants after removal
bun test src/reconciler/methods.test.ts
```

### Proposed Fix Approach

**Option 1 (Recommended): Model 1 - Detached subtree remains internally consistent**

For `removeNode`:
```ts
removeNode(parent: SmithersNode, node: SmithersNode): void {
  const idx = parent.children.indexOf(node)
  if (idx !== -1) parent.children.splice(idx, 1)
  if (node.parent === parent) node.parent = null
  // Do NOT clear descendant parent pointers - subtree stays internally consistent
}
```

For `clearContainer`:
```ts
clearContainer(container: Container): void {
  const children = [...container.children]
  for (const child of children) {
    rendererMethods.removeNode(container, child)
  }
}
```

**Option 2: Model 2 - Fully sever subtree**

Keep current `removeNode` behavior but also clear `node.children`:
```ts
removeNode(parent: SmithersNode, node: SmithersNode): void {
  const idx = parent.children.indexOf(node)
  if (idx !== -1) parent.children.splice(idx, 1)
  if (node.parent === parent) node.parent = null
  
  function clearDescendants(n: SmithersNode) {
    for (const child of n.children) {
      child.parent = null
      clearDescendants(child)
    }
    n.children.length = 0  // <-- Add this
  }
  clearDescendants(node)
}
```

### Acceptance Criteria
1. After `removeNode(parent, node)`: either descendants have consistent parent pointers OR both parent pointers AND children arrays are cleared
2. After `clearContainer(container)`: same invariant applies to all detached subtrees
3. Add unit tests verifying the chosen invariant model
