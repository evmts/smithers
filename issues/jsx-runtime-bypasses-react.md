# Fix JSX Runtime to Use React Reconciler

## Problem Statement

Custom JSX runtime at `src/reconciler/jsx-runtime.ts:29-30` directly calls function components, bypassing React's reconciler. This causes "Invalid hook call" errors when components use hooks.

```typescript
// Current (BROKEN):
if (typeof type === 'function') {
  return type(props)  // ❌ Calls component outside React render context!
}
```

**Impact:** All 36 `.tsx` files using React hooks fail when rendered via JSX. Tests pass because they avoid JSX+hooks combination.

## Root Cause

```
Current flow (broken):
  TSX → jsx-runtime.jsx() → type(props) → SmithersNode
           ↑
           Calls component BEFORE React sets up dispatcher

Should be:
  TSX → react/jsx-runtime → Reconciler → hostConfig → SmithersNode
                               ↑
                               Hooks work here (dispatcher active)
```

When `tsconfig.json` sets `"jsxImportSource": "smithers-orchestrator"`, JSX compiles to our custom `jsx()` function which calls components synchronously before React can prepare its internal hook dispatcher.

## Fix Requirements

### 1. Replace Custom JSX Runtime

**File:** `src/reconciler/jsx-runtime.ts`

Replace entire file with React delegation:

```typescript
/**
 * JSX Runtime for Smithers - delegates to React
 *
 * React's jsx-runtime handles component calls and sets up the hook dispatcher.
 * Our hostConfig (host-config.ts) transforms React elements into SmithersNode trees.
 */

export { jsx, jsxs, Fragment } from 'react/jsx-runtime'
export { jsxDEV } from 'react/jsx-dev-runtime'

// Re-export types for backwards compatibility
export type { SmithersNode } from './types.js'
```

**Rationale:** React's jsx-runtime knows how to handle function components correctly. Our hostConfig already handles SmithersNode creation during reconciliation.

### 2. Update Root JSX Re-export

**File:** `src/jsx-runtime.ts`

Already correct (just re-exports from reconciler). Verify it still works after reconciler change.

### 3. Update TypeScript Config

**File:** `tsconfig.json`

Change JSX import source:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"  // Changed from "smithers-orchestrator"
  }
}
```

**Critical:** This makes JSX compile to React's runtime, not ours.

### 4. Clean Up Old Tests

**File:** `src/jsx-runtime.test.ts`

This file tests the old custom jsx-runtime behavior. After fix:
- Delete tests for function component direct calls (lines 27-34)
- Keep tests for primitive elements if they still work
- Or convert to integration tests using `createSmithersRoot().mount()`

## Validation Requirements

### A. Create Hook Integration Test

**File:** `src/reconciler/hooks-integration.test.tsx` (NEW)

```typescript
import { describe, test, expect } from 'bun:test'
import { createSmithersRoot } from './root.js'
import { useState, useEffect, useContext, createContext } from 'react'

describe('React Hooks Integration', () => {
  test('useState works in components', async () => {
    function Counter() {
      const [count] = useState(42)
      return <div>Count: {count}</div>
    }

    const root = createSmithersRoot()
    await root.mount(() => <Counter />)
    const xml = root.toXML()

    expect(xml).toContain('Count: 42')
    root.dispose()
  })

  test('useContext works across tree', async () => {
    const TestContext = createContext('default')

    function Child() {
      const value = useContext(TestContext)
      return <span>{value}</span>
    }

    function App() {
      return (
        <TestContext.Provider value="test-value">
          <Child />
        </TestContext.Provider>
      )
    }

    const root = createSmithersRoot()
    await root.mount(App)
    const xml = root.toXML()

    expect(xml).toContain('test-value')
    root.dispose()
  })

  test('useEffect cleanup runs on unmount', async () => {
    let mounted = false
    let unmounted = false

    function Component() {
      useEffect(() => {
        mounted = true
        return () => { unmounted = true }
      }, [])
      return <div>test</div>
    }

    const root = createSmithersRoot()
    await root.mount(() => <Component />)
    expect(mounted).toBe(true)
    expect(unmounted).toBe(false)

    root.dispose()
    expect(unmounted).toBe(true)
  })
})
```

### B. Verify Existing Tests Still Pass

```bash
bun test src/reconciler/
bun test src/components/
bun test test/integration.test.ts
```

All tests must pass. Fix any that break due to JSX changes.

### C. Test Real Component with Hooks

Create `test/verify-claude-component.tsx`:

```typescript
import { createSmithersRoot } from '../src/reconciler/root.js'
import { createSmithersDB } from '../src/db/index.js'
import { SmithersProvider } from '../src/components/SmithersProvider.js'
import { useState } from 'react'

function TestComponent() {
  const [value] = useState('hook-works')
  return <div>{value}</div>
}

async function App() {
  const db = await createSmithersDB({ path: ':memory:' })
  const execId = await db.execution.start('test', 'test.tsx')

  return (
    <SmithersProvider db={db} executionId={execId}>
      <TestComponent />
    </SmithersProvider>
  )
}

const root = createSmithersRoot()
await root.mount(App)
const xml = root.toXML()

if (xml.includes('hook-works')) {
  console.log('✓ Hooks work correctly through JSX')
  process.exit(0)
} else {
  console.error('✗ Hooks failed')
  console.error(xml)
  process.exit(1)
}
```

Run: `bun test/verify-claude-component.tsx`

### D. Test Package Exports

Verify `package.json` exports still resolve:

```typescript
// Should work:
import { jsx } from 'smithers-orchestrator/jsx-runtime'
import { createSmithersRoot } from 'smithers-orchestrator/reconciler'
```

## Success Criteria

- [ ] All existing tests pass
- [ ] New hooks-integration.test.tsx passes (3+ tests)
- [ ] verify-claude-component.tsx succeeds
- [ ] No "Invalid hook call" errors
- [ ] `bun test` shows 0 failures
- [ ] Components using hooks render correctly

## Edge Cases to Check

1. **Fragment support:** `<>...</>` should still work
2. **Key prop:** `<div key="x">` should preserve keys
3. **Children handling:** Arrays, strings, numbers, nested elements
4. **Null/undefined children:** Should filter correctly
5. **Custom components:** Function components should render through reconciler

## Report Format

At completion, provide:

```markdown
## Fix Summary

**Files Modified:**
- src/reconciler/jsx-runtime.ts - Replaced with React delegation
- tsconfig.json - Changed jsxImportSource to "react"
- src/jsx-runtime.test.ts - [deleted|updated|kept]
- src/reconciler/hooks-integration.test.tsx - NEW

**Test Results:**
- Existing tests: X pass / Y fail
- New hook tests: X pass / Y fail
- Integration test: [PASS|FAIL]
- Component verification: [PASS|FAIL]

**Validation:**
```bash
bun test
# Output here
```

**Hook Errors:** [RESOLVED|description of remaining issues]

**Breaking Changes:** [none|list any]
```

## Additional Context

- **HostConfig already correct:** `src/reconciler/host-config.ts` properly implements React reconciler interface
- **SmithersReconciler works:** Integration tests prove reconciler creates SmithersNode trees correctly
- **Only JSX path broken:** Manual node creation (rendererMethods) works fine
- **26 components affected:** All files in `src/components/*.tsx` use hooks
- **Reference implementation:** OpenTUI in `reference/opentui/packages/react/` uses similar pattern

## Related Files

```
src/reconciler/
├── jsx-runtime.ts      # FIX HERE - replace with React delegation
├── host-config.ts      # Already correct - creates SmithersNodes
├── root.ts             # Already correct - mounts via reconciler
└── types.ts            # SmithersNode definition

tsconfig.json           # FIX HERE - change jsxImportSource
src/jsx-runtime.ts      # Re-export only, should work after fix
package.json            # Exports jsx-runtime, verify still resolves
```

---

**Priority:** P0 - Blocks all JSX+hooks usage
**Estimated effort:** 1-2 hours including comprehensive testing
