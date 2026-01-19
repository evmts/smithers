# Type Safety: `any` Type in Executor Error Handling

## File
[src/components/agents/claude-cli/executor.ts](file:///Users/williamcory/smithers/src/components/agents/claude-cli/executor.ts#L324)

## Issue
Line 324 uses `any` type in catch block, bypassing TypeScript's type checking.

## Problematic Code
```typescript
} catch (error: any) {
  const durationMs = Date.now() - startTime
  return {
    output: error.stderr || error.message || String(error),
    ...
  }
}
```

## Risk
- `error.stderr` access on non-error types could be undefined without warning
- Inconsistent with the rest of the codebase which uses `instanceof Error` checks

## Suggested Fix
```typescript
} catch (error: unknown) {
  const durationMs = Date.now() - startTime
  const errorMessage = error instanceof Error 
    ? error.message 
    : String(error)
  const stderr = (error as any)?.stderr
  
  return {
    output: stderr || errorMessage,
    tokensUsed: { input: 0, output: 0 },
    turnsUsed: 0,
    stopReason: 'error',
    durationMs,
    exitCode: (error as any)?.exitCode ?? -1,
  }
}
```
