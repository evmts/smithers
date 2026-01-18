# Agent Task: Fix JSX Runtime to Enable React Hooks

## Context

`src/reconciler/jsx-runtime.ts:29-30` directly invokes function components (`type(props)`), bypassing React's reconciler. This prevents hook dispatcher setup → "Invalid hook call" errors. 36 `.tsx` files with hooks are broken.

## Problem Architecture

```xml
<current_flow status="broken">
  TSX → jsx-runtime.jsx() → type(props) [no dispatcher!] → SmithersNode
</current_flow>

<correct_flow>
  TSX → react/jsx-runtime → Reconciler [dispatcher active] → hostConfig → SmithersNode
</correct_flow>
```

Root cause: `tsconfig.json` `jsxImportSource: "smithers-orchestrator"` → JSX compiles to custom runtime → components called before React ready.

## Implementation Steps

### Step 1: Replace JSX Runtime (PRIMARY FIX)

**File:** `src/reconciler/jsx-runtime.ts`

Replace entire contents:

```typescript
/**
 * JSX Runtime for Smithers - delegates to React
 * React handles component calls + hook dispatcher setup
 * Our hostConfig transforms React elements → SmithersNode trees
 */
export { jsx, jsxs, Fragment } from 'react/jsx-runtime'
export { jsxDEV } from 'react/jsx-dev-runtime'
export type { SmithersNode } from './types.js'
```

**Why:** Let React own component lifecycle. HostConfig (`src/reconciler/host-config.ts`) already correctly creates SmithersNodes during reconciliation.

### Step 2: Update TSConfig

**File:** `tsconfig.json` line 12

```diff
- "jsxImportSource": "smithers-orchestrator",
+ "jsxImportSource": "react",
```

**Critical:** Makes JSX compile to React's runtime, not custom one.

### Step 3: Handle Test Fallout

**File:** `src/jsx-runtime.test.ts`

Current tests verify old behavior (direct component calls). Options:
1. Delete tests for function components (lines 27-34) - they test wrong behavior
2. Convert to integration tests using `createSmithersRoot().mount()`
3. Keep only primitive element tests (`jsx('div', {})`) if they still pass

Choose pragmatically based on what breaks.

### Step 4: Create Hook Validation Tests

**File:** `src/reconciler/hooks-integration.test.tsx` (NEW)

Minimal test proving hooks work:

```typescript
import { describe, test, expect } from 'bun:test'
import { createSmithersRoot } from './root.js'
import { useState, useContext, createContext } from 'react'

describe('Hooks Integration', () => {
  test('useState works', async () => {
    function Counter() {
      const [count] = useState(99)
      return <div>Count: {count}</div>
    }

    const root = createSmithersRoot()
    await root.mount(() => <Counter />)

    expect(root.toXML()).toContain('Count: 99')
    root.dispose()
  })

  test('useContext works', async () => {
    const Ctx = createContext('default')
    function Child() {
      return <span>{useContext(Ctx)}</span>
    }
    function App() {
      return <Ctx.Provider value="works"><Child /></Ctx.Provider>
    }

    const root = createSmithersRoot()
    await root.mount(App)

    expect(root.toXML()).toContain('works')
    root.dispose()
  })
})
```

Must pass after fix. Expand with `useEffect`, `useMemo`, etc. if time permits.

## Validation Protocol

### A. Run Full Test Suite

```bash
bun test
```

**Target:** 0 failures. Fix any breaks from JSX changes.

### B. Spot Check Key Files

```bash
bun test src/reconciler/hooks-integration.test.tsx  # New file
bun test src/reconciler/jsx-runtime.test.ts         # May need fixes
bun test src/components/Claude.test.tsx             # Should still pass
bun test test/integration.test.ts                   # Should still pass
```

### C. Manual Verification

Create `_verify.tsx` (delete after):

```typescript
#!/usr/bin/env bun
import { createSmithersRoot } from './src/reconciler/root.js'
import { useState, useEffect } from 'react'

function HookComponent() {
  const [state] = useState('SUCCESS')
  useEffect(() => console.log('Effect ran'), [])
  return <result>{state}</result>
}

const root = createSmithersRoot()
await root.mount(() => <HookComponent />)
console.log(root.toXML())
root.dispose()

// Should print: <ROOT><result>SUCCESS</result></ROOT>
// Should NOT print: "Invalid hook call"
```

Run: `bun _verify.tsx`

### D. Check Package Exports

```bash
bun -e "import {jsx} from './src/jsx-runtime.ts'; console.log('✓ jsx export works')"
bun -e "import {createSmithersRoot} from './src/reconciler/root.ts'; console.log('✓ root export works')"
```

Both must succeed without errors.

## Success Metrics

- ✅ `bun test` shows 0 failures (or <5 if acceptable breaks documented)
- ✅ New hooks-integration.test.tsx passes (2+ tests)
- ✅ `_verify.tsx` prints SUCCESS without "Invalid hook call"
- ✅ No import/module resolution errors
- ✅ Components in `src/components/*.tsx` can use hooks without errors

## Edge Cases

Test if time permits:
- Fragments: `<><div/><span/></>`
- Keys: `<div key="x">`
- Nested function components
- Conditional rendering: `{condition && <Component/>}`
- Array children: `{items.map(x => <Item key={x}/>)}`

## Reporting Requirements

At completion, output:

```xml
<fix_summary>
  <changes>
    <file path="src/reconciler/jsx-runtime.ts">Replaced with React delegation</file>
    <file path="tsconfig.json">Changed jsxImportSource to "react"</file>
    <file path="src/jsx-runtime.test.ts">[action taken]</file>
    <file path="src/reconciler/hooks-integration.test.tsx">Created with [N] tests</file>
  </changes>

  <test_results>
    <command>bun test</command>
    <summary>[N] pass / [N] fail / [N] skip</summary>
    <failures>[list or "none"]</failures>
  </test_results>

  <validation>
    <hooks_integration>[PASS|FAIL with details]</hooks_integration>
    <manual_verify>[PASS|FAIL with output]</manual_verify>
    <no_hook_errors>[true|false]</no_hook_errors>
  </validation>

  <breaking_changes>[none|list with migration notes]</breaking_changes>

  <known_issues>[none|list remaining problems]</known_issues>
</fix_summary>
```

Include full test output if failures exist.

## Critical Insights

1. **HostConfig is correct** - `src/reconciler/host-config.ts` already implements React reconciler properly
2. **Root mounting works** - `createSmithersRoot().mount()` calls reconciler correctly
3. **Only JSX path broken** - Manual `rendererMethods` calls work (see `test/integration.test.ts`)
4. **Package structure sound** - `package.json` exports are correct, just need runtime swap

This is a **targeted fix** - change 2 files (jsx-runtime.ts, tsconfig.json), validate with tests. Don't refactor hostConfig, root, or components - they work.

## Reference Implementations

- **OpenTUI:** `reference/opentui/packages/react/src/reconciler/` - similar custom reconciler using React's jsx-runtime
- **Working integration tests:** `test/integration.test.ts` - proves reconciler works when JSX bypassed
- **HostConfig API:** `src/reconciler/host-config.ts:23-150` - complete React reconciler host config

## Anti-Patterns to Avoid

- ❌ Don't modify `host-config.ts` - it's correct
- ❌ Don't change how `createSmithersRoot()` works - it's correct
- ❌ Don't add DOM libraries (happy-dom, jsdom) - incompatible with custom reconciler
- ❌ Don't try to "fix" the custom jsx-runtime - replace it entirely
- ❌ Don't add special hook handling - let React do it

## Time Budget

- 20min: Implement changes (Steps 1-2)
- 15min: Fix test fallout (Step 3)
- 15min: Create validation tests (Step 4)
- 20min: Run validation protocol
- 10min: Manual verification + report

**Total: ~80 minutes** for thorough fix + validation

---

**Agent Instructions:** Follow steps sequentially. Run `bun test` after each file change to catch breaks early. Prioritize getting hooks working over test coverage - 2 solid hook tests > 10 brittle ones. Report blockers immediately if Steps 1-2 don't resolve "Invalid hook call" errors.
