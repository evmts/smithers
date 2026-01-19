# API Inconsistency: Catch Block Patterns

## Files Involved
- `src/db/utils.ts:14` - `} catch {`
- `src/utils/vcs/git.ts:20` - `} catch (error: any) {`
- `src/components/Step.tsx:235` - `} catch (error) {`
- `src/components/JJ/Rebase.tsx:76` - `} catch (rebaseError: any) {`
- `src/reactive-sqlite/hooks/useMutation.ts:88` - `} catch (err) {`
- `src/tui/hooks/useSmithersConnection.ts:81` - `} catch (e) {`
- `src/commands/monitor.test.ts:216` - `} catch (e: unknown) {`

## Inconsistency Description

Four different catch block patterns exist:

### Pattern 1: Empty catch (silent)
```typescript
// 65+ occurrences
} catch {
  return defaultValue
}
```

### Pattern 2: Typed as any
```typescript
// ~10 occurrences
} catch (error: any) {
  throw new Error(`... ${error.message}`)
}
```

### Pattern 3: Untyped error variable
```typescript
// ~20 occurrences  
} catch (error) {
  return { error: error as Error }
}

} catch (err) {
  setError(err as Error)
}
```

### Pattern 4: Typed as unknown (correct)
```typescript
// ~3 occurrences
} catch (e: unknown) {
  if (e instanceof Error) { ... }
}
```

## Suggested Standardization

1. **For parse/fallback operations** - empty catch is acceptable:
```typescript
} catch {
  return defaultValue
}
```

2. **When accessing error properties** - use type guard:
```typescript
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  throw new Error(`Operation failed: ${message}`)
}
```

3. **When returning/storing error** - cast properly:
```typescript
} catch (error) {
  return { error: error instanceof Error ? error : new Error(String(error)) }
}
```

4. **Never use `: any`** - it hides type issues:
```typescript
// BAD
} catch (error: any) {
  error.stderr?.toString()  // What if stderr doesn't exist?
}

// GOOD
} catch (error) {
  const stderr = error instanceof Object && 'stderr' in error 
    ? String((error as { stderr: unknown }).stderr)
    : ''
}
```

Create utility:
```typescript
// src/utils/error.ts
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}
```
