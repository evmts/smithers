# Type Safety Issue: `any` in type definitions

## Files & Lines

- `src/db/types.ts:100` - `value: any` in `StateEntry`
- `src/db/types.ts:108-109` - `old_value?: any` and `new_value: any` in `Transition`
- `src/db/human.ts:14` - `response: any | null` in `HumanInteraction`

## Issue

Core type definitions use `any` which propagates untyped values throughout the codebase.

## Suggested Fix

For `StateEntry` and `Transition`, use `unknown` to force type narrowing:

```typescript
// types.ts
export interface StateEntry {
  key: string
  value: unknown
  updated_at: Date
}

export interface Transition {
  id: string
  execution_id?: string
  key: string
  old_value?: unknown
  new_value: unknown
  trigger?: string
  trigger_agent_id?: string
  created_at: Date
}
```

For `HumanInteraction`, use `unknown`:
```typescript
// human.ts
export interface HumanInteraction {
  // ...
  response: unknown
  // ...
}
```
