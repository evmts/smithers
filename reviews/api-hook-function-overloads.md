# API Inconsistency: Hook Function Overload Signatures

## Files Involved
- `src/reactive-sqlite/hooks/useQuery.ts`
- `src/reactive-sqlite/hooks/useQueryValue.ts`
- `src/reactive-sqlite/hooks/useQueryOne.ts`
- `src/reactive-sqlite/hooks/useMutation.ts`

## Inconsistency Description

The reactive-sqlite hooks support two calling conventions but implement them via complex runtime argument parsing rather than TypeScript overloads:

### Current Implementation (useQuery.ts):
```typescript
export function useQuery<T = Record<string, unknown>>(
  sqlOrDb: ReactiveDatabase | string,
  sqlOrParams?: string | any[],
  paramsOrOptions?: any[] | UseQueryOptions,
  optionsOrDb?: UseQueryOptions | ReactiveDatabase
): UseQueryResult<T> {
  // 40+ lines of argument parsing logic
  if (typeof sqlOrDb === 'string') {
    // New signature
  } else {
    // Legacy signature
  }
}
```

### Problems:
1. Type safety is lost - uses `any[]` and runtime type guards
2. Same complex parsing duplicated across 4 hooks
3. Error messages are generic ("Invalid arguments")
4. IDE autocomplete shows confusing signature

### useQueryValue has even more complexity:
```typescript
// Helper to detect ReactiveDatabase (has subscribe method)
const isDb = (obj: unknown): obj is ReactiveDatabase =>
  obj !== null && typeof obj === 'object' && 'subscribe' in obj
```

## Suggested Standardization

1. **Use TypeScript overloads** for clear API:
```typescript
// With context (preferred)
export function useQuery<T>(sql: string, params?: any[]): UseQueryResult<T>
export function useQuery<T>(sql: string, options: UseQueryOptions): UseQueryResult<T>
export function useQuery<T>(sql: string, params: any[], options: UseQueryOptions): UseQueryResult<T>

// With explicit db (legacy)
export function useQuery<T>(db: ReactiveDatabase, sql: string): UseQueryResult<T>
export function useQuery<T>(db: ReactiveDatabase, sql: string, params: any[]): UseQueryResult<T>

// Implementation
export function useQuery<T>(...args: unknown[]): UseQueryResult<T> {
  const parsed = parseHookArgs(args)
  // ...
}
```

2. **Extract shared argument parser**:
```typescript
// src/reactive-sqlite/hooks/parse-args.ts
interface ParsedHookArgs {
  db: ReactiveDatabase
  sql: string
  params: any[]
  options: UseQueryOptions
}

export function parseHookArgs(args: unknown[], contextDb: ReactiveDatabase | null): ParsedHookArgs
```

3. **Apply to all 4 hooks** for consistency
