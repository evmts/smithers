# Registry: isCustomTool Accepts Non-Function execute

**File:** `src/tools/registry.ts`  
**Lines:** 91-93

## Issue

`isCustomTool` only checks for `execute` key existence:

```typescript
export function isCustomTool(spec: ToolSpec): spec is Tool {
  return typeof spec === 'object' && 'execute' in spec
}
```

Objects with `execute: 'string'` or `execute: null` pass the guard.

Test at line 163-172 documents this:

```typescript
test('returns false for object with non-function execute', () => {
  const badTool = {
    execute: 'not a function',  // string, not function
  }
  expect(isCustomTool(badTool as any)).toBe(true)  // ← passes!
})
```

## Impact

- Type guard lies about type safety
- Runtime error when `execute()` is called on non-function

## Fix

Validate execute is a function:

```typescript
export function isCustomTool(spec: ToolSpec): spec is Tool {
  return (
    typeof spec === 'object' &&
    spec !== null &&
    'execute' in spec &&
    typeof spec.execute === 'function'
  )
}
```
