# Type Safety Issue: `any[]` in query function signature

## Files & Lines

- `src/db/query.ts:5` - `export type QueryFunction = <T>(sql: string, params?: any[]) => T[]`
- `src/db/query.ts:14` - `return <T>(sql: string, params?: any[]): T[] => {`

## Issue

The raw query function uses `any[]` for parameters, losing type safety for SQL parameter binding.

## Suggested Fix

Define a union type for valid SQL parameters:

```typescript
export type SqlParam = string | number | boolean | null | Uint8Array

export type QueryFunction = <T>(sql: string, params?: SqlParam[]) => T[]

export function createQueryModule(ctx: QueryModuleContext): QueryFunction {
  const { rdb } = ctx

  return <T>(sql: string, params?: SqlParam[]): T[] => {
    return rdb.query<T>(sql, params ?? [])
  }
}
```
