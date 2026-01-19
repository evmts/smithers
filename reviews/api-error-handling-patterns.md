# API Inconsistency: Error Handling Patterns

## Files Involved
- `src/db/*.ts` - throws `Error('No active execution')`
- `src/utils/vcs/git.ts` - throws custom Error with command context
- `src/reactive-sqlite/hooks/useQuery.ts` - returns `{ error: Error | null }`
- `src/reactive-sqlite/hooks/useMutation.ts` - returns `{ error: Error | null }`
- `src/components/SmithersProvider.tsx` - throws for context violations
- `src/hooks/useHuman.ts` - silent catch `} catch {`

## Inconsistency Description

Three distinct error handling patterns exist:

### Pattern 1: Throw immediately (DB modules)
```typescript
// src/db/steps.ts:34
if (!currentExecutionId) throw new Error('No active execution')

// src/db/phases.ts:28
if (!currentExecutionId) throw new Error('No active execution')
```
Same error message across 8+ files, no error codes or recovery context.

### Pattern 2: Return error in result object (Reactive hooks)
```typescript
// src/reactive-sqlite/hooks/useQuery.ts:96-98
} catch (error) {
  return { data: [] as T[], error: error as Error }
}
```

### Pattern 3: Silent catch (various)
```typescript
// src/hooks/useHuman.ts:68
} catch {
  response = request.response
}

// src/db/utils.ts:14
} catch {
  return defaultValue
}
```

### Pattern 4: Rethrow with context (VCS)
```typescript
// src/utils/vcs/git.ts:21
throw new Error(`git ${args.join(' ')} failed: ${error.stderr?.toString() || error.message}`)
```

## Suggested Standardization

1. **Synchronous DB operations**: Throw on invariant violations (keep current)
   - Add error codes: `throw new SmithersError('NO_ACTIVE_EXECUTION', 'No active execution')`

2. **React hooks for data fetching**: Return `{ data, error }` pattern (keep current)
   - Never throw from hooks - breaks React render

3. **Async VCS/IO operations**: Rethrow with context (keep current)
   - Always include original error message

4. **Silent catches**: Replace with explicit error handling
   - Log to debug collector OR return typed error
   - `} catch { return defaultValue }` only for parse operations

5. **Create shared error types**:
```typescript
// src/core/errors.ts
export class SmithersError extends Error {
  constructor(public code: string, message: string) { super(message) }
}
```
