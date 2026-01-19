# Type Safety Issue: `any` return types in StateModule

## Files & Lines

- `src/db/state.ts:9` - `setMany: (updates: Record<string, any>, trigger?: string) => void`
- `src/db/state.ts:10` - `getAll: () => Record<string, any>`
- `src/db/state.ts:12` - `history: (key?: string, limit?: number) => any[]`

## Issue

The state module uses `any` for value types which defeats TypeScript's type checking. The `history` method returns `any[]` instead of a properly typed `Transition[]`.

## Suggested Fix

```typescript
import type { Transition } from './types.js'

export interface StateModule {
  get: <T>(key: string) => T | null
  set: <T>(key: string, value: T, trigger?: string) => void
  setMany: (updates: Record<string, unknown>, trigger?: string) => void
  getAll: () => Record<string, unknown>
  reset: () => void
  history: (key?: string, limit?: number) => Transition[]
}
```

Also update line 71:
```typescript
history: (key?: string, limit: number = 100): Transition[] => {
```
