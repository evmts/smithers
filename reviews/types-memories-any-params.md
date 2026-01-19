# Type Safety Issue: `any[]` params in memories module

## Files & Lines

- `src/db/memories.ts:54` - `const params: any[] = []`
- `src/db/memories.ts:64` - `const params: any[] = [...]`
- `src/db/memories.ts:71` - `update: (id: string, updates: any) => {`
- `src/db/memories.ts:73` - `const params: any[] = [now()]`

## Issue

The memories module uses `any[]` for SQL parameters and `any` for update objects, losing type safety.

## Suggested Fix

Use a union type for SQL parameters:

```typescript
type SqlParam = string | number | null | boolean

// Line 54, 64, 73
const params: SqlParam[] = []

// Line 71 - properly type the updates parameter
update: (id: string, updates: Partial<Pick<Memory, 'content' | 'confidence' | 'expires_at'>>) => {
  const sets: string[] = ['updated_at = ?']
  const params: SqlParam[] = [now()]
  // ...
}
```

The `update` function signature on line 12 is already correctly typed, but the implementation on line 71 uses `any` - they should match.
