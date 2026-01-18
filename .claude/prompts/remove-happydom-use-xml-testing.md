# Task: Remove happy-dom and Migrate to XML-based Testing

## Objective

Remove the `happy-dom` and `@happy-dom/global-registrator` dependencies from this project and migrate any tests that were using DOM-based testing to use the project's native XML serialization approach. Smithers uses a custom React reconciler that renders to `SmithersNode` trees, not DOM elements, so DOM testing libraries are fundamentally incompatible with this architecture.

## Background Context

### Project Architecture

Smithers is a React-based orchestration framework that uses a **custom React reconciler** instead of react-dom. Key facts:

1. **Custom JSX Runtime**: `tsconfig.json` specifies `"jsxImportSource": "smithers-orchestrator"`, meaning JSX transforms to `SmithersNode` objects, not React DOM elements.

2. **SmithersNode Structure** (from `src/reconciler/types.ts`):
```typescript
interface SmithersNode {
  type: string                    // 'claude', 'phase', 'step', 'TEXT', etc.
  props: Record<string, unknown>  // Props passed to component
  children: SmithersNode[]        // Child nodes
  parent: SmithersNode | null     // Parent reference
  key?: string | number           // Reconciliation key
}
```

3. **XML Serialization**: The `serialize()` function in `src/reconciler/serialize.ts` converts SmithersNode trees to readable XML strings for display/testing.

4. **SmithersRoot**: The `createSmithersRoot()` function in `src/reconciler/root.ts` provides:
   - `mount(App)` - Renders a React component to SmithersNode tree
   - `getTree()` - Returns the raw SmithersNode tree
   - `toXML()` - Returns XML string representation
   - `dispose()` - Cleanup

### Why DOM Testing Doesn't Work

When you write JSX in this project:
```tsx
<DatabaseProvider db={db}>
  <UserList />
</DatabaseProvider>
```

It transforms to SmithersNode objects like:
```typescript
{
  type: 'DatabaseProvider',
  props: { db: dbInstance },
  children: [{ type: 'UserList', props: {}, children: [] }]
}
```

Libraries like `@testing-library/react` expect `react-dom` to render to actual DOM elements, but our reconciler never creates DOM nodes. This causes:
- "document is not defined" errors
- "Invalid hook call" errors (hooks try to use react-dom's dispatcher)
- Type mismatches between SmithersNode and ReactElement

## Files to Modify

### 1. Remove Dependencies

**`package.json`**: Remove these dev dependencies:
- `happy-dom`
- `@happy-dom/global-registrator`
- `@testing-library/react` (if present and unused elsewhere)

### 2. Update Test Preload

**`test/preload.ts`**: Remove the happy-dom setup:
```typescript
// REMOVE THESE LINES:
import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()
```

The preload should only contain:
```typescript
process.env.SMITHERS_MOCK_MODE = 'true'
process.env.NODE_ENV = 'test'
```

### 3. Migrate Context Tests

**`src/reactive-sqlite/hooks/context.test.tsx`**: This file currently has skipped tests. Migrate to XML-based testing pattern.

#### Current Pattern (broken):
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

#### New Pattern (works in Bun):
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

#### Alternative: Test SmithersNode Structure Directly
```tsx
test('DatabaseProvider wraps children correctly', () => {
  const child = jsx('user-list', {})
  const tree = jsx(DatabaseProvider, { db, children: child })

  // Assert on node structure
  expect(tree.type).toBe('DatabaseProvider') // or function name
  expect(tree.props.db).toBe(db)
  expect(tree.children).toHaveLength(1)
  expect(tree.children[0].type).toBe('user-list')
})
```

## Testing Patterns Reference

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
  expect(parent.children[0].parent).toBe(parent)
})
```

### Pattern 2: XML Serialization Assertions
From `src/reconciler/serialize.test.ts`:
```typescript
import { serialize } from './serialize'
import type { SmithersNode } from './types'

test('serializes node to XML', () => {
  const node: SmithersNode = {
    type: 'task',
    props: { name: 'test' },
    children: [],
    parent: null
  }

  expect(serialize(node)).toBe('<task name="test" />')
})

test('handles nested structure', () => {
  const xml = serialize(parentNode)
  expect(xml).toContain('<phase name="setup">')
  expect(xml).toContain('<step>')
})
```

### Pattern 3: Function Component Testing
```typescript
test('function component renders correctly', () => {
  function MyComponent({ name }: { name: string }) {
    return jsx('task', { name, children: 'content' })
  }

  const element = jsx(MyComponent, { name: 'test-task' })

  // Function components are called during jsx()
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

## Key Constraints

1. **No DOM globals needed**: Tests run in plain Bun - no `document`, `window`, or DOM APIs
2. **Use bun:test**: All tests use `import { describe, test, expect } from 'bun:test'`
3. **JSX in tests**: Can use JSX syntax OR call `jsx()` function directly - both work
4. **Avoid React.createElement**: Use the project's `jsx()` function for consistency
5. **No @testing-library**: These require react-dom which we don't use

## Verification Steps

After making changes:

1. **Remove packages**: `bun remove happy-dom @happy-dom/global-registrator`
2. **Run tests**: `bun test` should pass without DOM errors
3. **Run full check**: `bun run check` (typecheck + lint + test)
4. **Verify no DOM references**: `grep -r "document\." src/` should find nothing in test files

## Expected Outcome

- Zero DOM-related dependencies
- All tests pass in plain Bun environment
- Tests use SmithersNode/XML patterns instead of DOM queries
- No skipped tests (convert or remove them)
- `test/preload.ts` contains only env setup, no DOM polyfills
