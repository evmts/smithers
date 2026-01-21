# Option 8: Consolidate Package Exports

**Priority: LOW** | **Effort: S (1-2 hours)** | **Impact: LOW**

## Problem

package.json has **20+ export paths**:

```json
{
  "exports": {
    ".": "./dist/src/index.js",
    "./jsx-runtime": "./dist/src/reconciler/jsx-runtime.js",
    "./jsx-dev-runtime": "./dist/src/reconciler/jsx-runtime.js",
    "./core": "./dist/src/core/index.js",
    "./reconciler": "./dist/src/reconciler/index.js",
    "./react": "./dist/src/reconciler/index.js",
    "./components": "./dist/src/components/index.js",
    "./components/JJ": "./dist/src/components/JJ/index.js",
    "./components/Git": "./dist/src/components/Git/index.js",
    "./components/Hooks": "./dist/src/components/Hooks/index.js",
    "./components/MCP": "./dist/src/components/MCP/index.js",
    "./middleware": "./dist/src/middleware/index.js",
    "./db": "./dist/src/db/index.js",
    "./monitor": "./dist/src/monitor/index.js",
    "./rate-limits": "./dist/src/rate-limits/index.js",
    "./tools": "./dist/src/tools/index.js",
    "./reactive-sqlite": "./dist/src/reactive-sqlite/index.js",
    "./hooks": "./dist/src/hooks/index.js",
    "./hooks/ai-sdk": "./dist/src/hooks/ai-sdk.js",
    "./supersmithers": "./dist/src/supersmithers/index.js"
  }
}
```

## Analysis

### Essential Exports (Keep)

```
.                 → Main entry (most common)
./jsx-runtime     → Required for JSX transform
./jsx-dev-runtime → Required for JSX dev transform
```

### Commonly Used (Keep)

```
./db              → Database access
./components      → Core components
./hooks           → Custom hooks
```

### Questionable (Evaluate)

```
./core            → Just re-exports from reconciler
./reconciler      → Low-level, rarely used directly
./react           → Alias for reconciler
./middleware      → Probably used
./reactive-sqlite → Implementation detail?
./rate-limits     → Niche use case
./tools           → What's in here?
./monitor         → What's in here?
./supersmithers   → Experimental feature
```

### Subpath Components (Evaluate)

```
./components/JJ   → JJ VCS components
./components/Git  → Git VCS components
./components/Hooks → Lifecycle hooks
./components/MCP  → MCP tools
./hooks/ai-sdk    → AI SDK compatibility
```

## Proposed Consolidation

### Option A: Minimal Exports

```json
{
  "exports": {
    ".": "./dist/src/index.js",
    "./jsx-runtime": "./dist/src/reconciler/jsx-runtime.js",
    "./jsx-dev-runtime": "./dist/src/reconciler/jsx-runtime.js",
    "./db": "./dist/src/db/index.js"
  }
}
```

Everything else accessible via main export or deep imports.

### Option B: Grouped Exports

```json
{
  "exports": {
    ".": "./dist/src/index.js",
    "./jsx-runtime": "./dist/src/reconciler/jsx-runtime.js",
    "./jsx-dev-runtime": "./dist/src/reconciler/jsx-runtime.js",
    "./db": "./dist/src/db/index.js",
    "./vcs": "./dist/src/components/vcs/index.js",  // Combined JJ + Git
    "./middleware": "./dist/src/middleware/index.js"
  }
}
```

### Option C: Document Current (No Change)

Keep exports, add documentation for what each provides.

## Redundant Exports

These are definitely redundant:

```json
"./core": "./dist/src/core/index.js",        // Just re-exports from reconciler
"./react": "./dist/src/reconciler/index.js", // Alias for reconciler
```

**core/index.ts:**
```typescript
// Just re-exports!
export { serialize } from '../reconciler/serialize.js'
export type { SmithersNode, ExecutionState, ... } from '../reconciler/types.js'
```

## Recommendation

1. **Delete `./core` export** - it's just a re-export layer
2. **Delete `./react` alias** - confusing, use `./reconciler`
3. **Keep domain exports** - `/db`, `/middleware`, `/hooks`
4. **Combine VCS** - `/vcs` instead of `/components/JJ` + `/components/Git`

## Benefits

1. **Simpler package.json** - fewer paths to maintain
2. **Clearer API** - users know where to import from
3. **No redundant re-exports** - delete core/index.ts entirely

## Decision

- [x] **Accept A** - Minimal exports (4 paths only)
- [ ] **Accept B** - Grouped exports  
- [ ] **Accept Partial** - Just delete redundant ones
- [ ] **Reject** - Keep all for maximum flexibility

**Resolution:** Ship with minimal exports:
```json
{
  "exports": {
    ".": "./dist/src/index.js",
    "./jsx-runtime": "./dist/src/reconciler/jsx-runtime.js",
    "./jsx-dev-runtime": "./dist/src/reconciler/jsx-runtime.js",
    "./db": "./dist/src/db/index.js"
  }
}
```
