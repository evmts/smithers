# Remove happy-dom and Migrate to XML-based Testing

<metadata>
  <created>2026-01-18</created>
  <category>testing-migration</category>
  <priority>high</priority>
</metadata>

## Objective

<objective>
Remove `happy-dom` and `@happy-dom/global-registrator` dependencies from this project
and migrate any tests that were using DOM-based testing to use the project's native
SmithersNode/XML serialization approach. Smithers uses a custom React reconciler that
renders to SmithersNode trees, not DOM elements, so DOM testing libraries are
fundamentally incompatible with this architecture.
</objective>

---

## Architecture Overview

<architecture>

### Custom JSX Runtime

The `tsconfig.json` specifies `"jsxImportSource": "smithers-orchestrator"`, meaning JSX
transforms to `SmithersNode` objects, **NOT** React DOM elements.

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "smithers-orchestrator"
  }
}
```

**JSX Runtime Location:** `src/reconciler/jsx-runtime.ts`

### SmithersNode Structure

<type-definition file="src/reconciler/types.ts">
```typescript
interface SmithersNode {
  type: string                    // 'claude', 'phase', 'step', 'TEXT', etc.
  props: Record<string, unknown>  // Props passed to component
  children: SmithersNode[]        // Child nodes
  parent: SmithersNode | null     // Parent reference
  key?: string | number           // Reconciliation key
  warnings?: string[]             // Validation warnings
}
```
</type-definition>

### XML Serializer

The `serialize()` function converts SmithersNode trees to readable XML strings.
**Use this for test assertions instead of DOM queries.**

<function file="src/reconciler/serialize.ts">
```typescript
export function serialize(node: SmithersNode): string
// Examples:
// { type: 'task', props: { name: 'test' }, children: [] } → '<task name="test" />'
// { type: 'ROOT', children: [...] } → children joined with \n (no <ROOT> wrapper)
```
</function>

### SmithersRoot

<api file="src/reconciler/root.ts">
| Method | Description |
|--------|-------------|
| `mount(App)` | Renders React component to SmithersNode tree |
| `getTree()` | Returns raw SmithersNode tree |
| `toXML()` | Returns XML string representation |
| `dispose()` | Cleanup |
</api>

</architecture>

---

## Why DOM Testing Fails

<problem>

When JSX is written in this project:

```tsx
<DatabaseProvider db={db}>
  <UserList />
</DatabaseProvider>
```

It transforms to SmithersNode objects:

```typescript
{
  type: 'DatabaseProvider',
  props: { db: dbInstance },
  children: [{ type: 'UserList', props: {}, children: [] }]
}
```

Libraries like `@testing-library/react` expect `react-dom` to render actual DOM nodes,
but our reconciler **never creates DOM**.

<errors>
- `"document is not defined"` - No DOM globals exist
- `"Invalid hook call"` - Hooks try to use react-dom's dispatcher
- Type mismatches between SmithersNode and ReactElement
</errors>

</problem>

---

## Current State

<current-state>

### Test Configuration

**Test command** (from `package.json`):
```bash
"test": "cd src && bun test ."
```

**Preload file** (`test/preload.ts`) - currently has happy-dom:
```typescript
import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()  // ← REMOVE THIS

process.env.SMITHERS_MOCK_MODE = 'true'
process.env.NODE_ENV = 'test'
```

### Dependencies to Remove

From `package.json` devDependencies:
- `happy-dom`
- `@happy-dom/global-registrator`
- `@testing-library/react` (if unused after migration)
- `@testing-library/dom` (if unused after migration)

### Files Requiring Migration

<file-list>
| File | Status | Notes |
|------|--------|-------|
| `src/reactive-sqlite/hooks/context.test.tsx` | Has skipped tests | Uses @testing-library/react |
| `src/components/Ralph.test.tsx` | Has skipped tests | JSX import issues |
| `test/preload.ts` | Needs cleanup | Remove happy-dom setup |
</file-list>

</current-state>

---

## Migration Tasks

<tasks>

### Task 1: Remove Dependencies

```bash
bun remove happy-dom @happy-dom/global-registrator @testing-library/react @testing-library/dom
```

### Task 2: Update Test Preload

**File:** `test/preload.ts`

<before>
```typescript
import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()

process.env.SMITHERS_MOCK_MODE = 'true'
process.env.NODE_ENV = 'test'
```
</before>

<after>
```typescript
/**
 * Test preload file for Smithers tests.
 * No DOM required - we use SmithersNode/XML serialization.
 */
process.env.SMITHERS_MOCK_MODE = 'true'
process.env.NODE_ENV = 'test'
```
</after>

### Task 3: Migrate Context Tests

**File:** `src/reactive-sqlite/hooks/context.test.tsx`

<migration-example>

**Before (broken):**
```tsx
import { render, screen } from '@testing-library/react'

test('renders children', () => {
  render(
    <DatabaseProvider db={db}>
      <div data-testid="child">Hello</div>
    </DatabaseProvider>
  )
  expect(screen.getByTestId('child')).toBeDefined()
})
```

**After (works in Bun):**
```tsx
import { jsx } from '../../reconciler/jsx-runtime'
import { serialize } from '../../reconciler/serialize'

test('renders children', () => {
  // Create nodes directly using jsx() function
  const tree = jsx(DatabaseProvider, {
    db,
    children: jsx('div', { 'data-testid': 'child', children: 'Hello' })
  })

  // Serialize to XML for assertion
  const xml = serialize(tree)
  expect(xml).toContain('<div data-testid="child">')
  expect(xml).toContain('Hello')
})
```

**Alternative - Test Node Structure:**
```tsx
test('DatabaseProvider wraps children correctly', () => {
  const child = jsx('user-list', {})
  const tree = jsx(DatabaseProvider, { db, children: child })

  // Assert on node structure directly
  expect(tree.type).toBe('DatabaseProvider')
  expect(tree.props.db).toBe(db)
  expect(tree.children).toHaveLength(1)
  expect(tree.children[0].type).toBe('user-list')
})
```

</migration-example>

</tasks>

---

## Testing Patterns Reference

<patterns>

### Pattern 1: Direct JSX Function Calls

From `src/jsx-runtime.test.ts`:

```typescript
import { jsx, jsxs, Fragment } from './reconciler/jsx-runtime'

test('creates element with props', () => {
  const element = jsx('phase', { name: 'test', count: 42 })

  expect(element.type).toBe('phase')
  expect(element.props.name).toBe('test')
  expect(element.props.count).toBe(42)
})

test('handles nested children', () => {
  const child = jsx('step', { children: 'Hello' })
  const parent = jsx('phase', { name: 'test', children: child })

  expect(parent.children).toHaveLength(1)
  expect(parent.children[0].type).toBe('step')
  expect(parent.children[0].parent).toBe(parent) // Parent refs work!
})

test('filters null/undefined/boolean children', () => {
  const validChild = jsx('step', { children: 'Valid' })
  const element = jsx('phase', {
    children: [null, validChild, undefined, false, true]
  })

  expect(element.children).toHaveLength(1) // Only validChild
})
```

### Pattern 2: XML Serialization Assertions

From `src/reconciler/serialize.test.ts`:

```typescript
import { serialize } from './serialize'
import type { SmithersNode } from './types'

test('serializes self-closing tag', () => {
  const node: SmithersNode = {
    type: 'task',
    props: { name: 'test' },
    children: [],
    parent: null
  }

  expect(serialize(node)).toBe('<task name="test" />')
})

test('serializes with children', () => {
  const child: SmithersNode = {
    type: 'step',
    props: {},
    children: [],
    parent: null
  }
  const parent: SmithersNode = {
    type: 'phase',
    props: { name: 'setup' },
    children: [child],
    parent: null
  }
  child.parent = parent

  const xml = serialize(parent)
  expect(xml).toContain('<phase name="setup">')
  expect(xml).toContain('<step />')
  expect(xml).toContain('</phase>')
})

test('escapes XML entities', () => {
  const node: SmithersNode = {
    type: 'task',
    props: { query: 'a < b && c > d' },
    children: [],
    parent: null
  }

  expect(serialize(node)).toContain('&lt;')
  expect(serialize(node)).toContain('&amp;')
  expect(serialize(node)).toContain('&gt;')
})
```

### Pattern 3: Function Component Testing

```typescript
test('function component renders correctly', () => {
  function MyComponent({ name }: { name: string }) {
    return jsx('task', { name, children: 'content' })
  }

  // Function components are called during jsx()
  const element = jsx(MyComponent, { name: 'test-task' })

  expect(element.type).toBe('task')
  expect(element.props.name).toBe('test-task')
})
```

### Pattern 4: Testing Exports Without Rendering

```typescript
describe('module exports', () => {
  test('exports expected functions', async () => {
    const module = await import('./context')

    expect(typeof module.DatabaseProvider).toBe('function')
    expect(typeof module.useDatabase).toBe('function')
  })

  test('context is a valid React context', () => {
    expect(DatabaseContext.Provider).toBeDefined()
    expect(DatabaseContext.Consumer).toBeDefined()
  })
})
```

</patterns>

---

## Constraints

<constraints>
- **No DOM globals needed** - Tests run in plain Bun environment
- **Use bun:test** - `import { describe, test, expect } from 'bun:test'`
- **JSX works both ways** - Can use JSX syntax OR call `jsx()` function directly
- **Avoid React.createElement** - Use project's `jsx()` for consistency
- **No @testing-library** - These require react-dom which we don't use
</constraints>

---

## Verification Checklist

<verification>

```bash
# 1. Remove packages
bun remove happy-dom @happy-dom/global-registrator

# 2. Run tests - should pass without DOM errors
bun run test

# 3. Run full check
bun run check  # typecheck + lint + test

# 4. Verify no DOM references in test files
grep -r "document\." src/**/*.test.* || echo "No DOM references found ✓"

# 5. Verify no testing-library imports
grep -r "@testing-library" src/ || echo "No testing-library imports ✓"
```

</verification>

---

## Expected Outcome

<outcome>
- [ ] Zero DOM-related dependencies
- [ ] All tests pass in plain Bun environment
- [ ] Tests use SmithersNode/XML patterns instead of DOM queries
- [ ] No skipped tests (convert or remove them)
- [ ] `test/preload.ts` contains only env setup, no DOM polyfills
- [ ] Pre-commit hook passes: `bun run check`
</outcome>
