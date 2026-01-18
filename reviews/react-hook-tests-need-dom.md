# React Hook Tests Need SmithersNode/XML Testing

## Status: HIGH PRIORITY

## Summary
Tests for React hooks (`useQuery`, `useMutation`) fail because they're using DOM-based testing patterns. This project uses a custom React reconciler that renders to SmithersNode trees, NOT DOM elements.

**DO NOT add happy-dom or jsdom** - they are fundamentally incompatible with this architecture.

## Impact
- 7 test failures in `src/reactive-sqlite/hooks/context.test.tsx`
- Cannot verify reactive database behavior works correctly
- Hook-based components untested

## Evidence
Tests attempt to use DOM queries but our JSX transforms to SmithersNode objects, not DOM elements.

## Location
- `src/reactive-sqlite/hooks/context.test.tsx`
- `src/reactive-sqlite/hooks/hooks.ts`

## Suggested Fix
Migrate tests to use SmithersNode/XML serialization:

```typescript
import { SmithersRoot } from '../../reconciler/root'
import { serialize } from '../../reconciler/serialize'

test('DatabaseProvider renders children', () => {
  const root = new SmithersRoot()
  root.mount(
    <DatabaseProvider db={db}>
      <UserList />
    </DatabaseProvider>
  )

  const xml = root.toXML()
  expect(xml).toContain('<UserList')

  root.dispose()
})
```

Or test node structure directly:
```typescript
import { jsx } from '../../reconciler/jsx-runtime'

test('creates correct node structure', () => {
  const tree = jsx(DatabaseProvider, {
    db,
    children: jsx('user-list', {})
  })

  expect(tree.type).toBe('DatabaseProvider')
  expect(tree.children[0].type).toBe('user-list')
})
```

See `.claude/prompts/remove-happydom-use-xml-testing.md` for full migration patterns.

## Priority
**P1** - Required for confident MVP

## Estimated Effort
1-2 hours
