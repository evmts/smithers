# Weak Error Typing in CLI Executor

## File

- [src/components/agents/claude-cli/executor.ts](file:///Users/williamcory/smithers/src/components/agents/claude-cli/executor.ts#L324)

## Issue Description

The shell executor uses `any` type for caught errors:

```typescript
} catch (error: any) {
  const durationMs = Date.now() - startTime

  return {
    output: error.stderr || error.message || String(error),
    tokensUsed: { input: 0, output: 0 },
    turnsUsed: 0,
    stopReason: 'error',
    durationMs,
    exitCode: error.exitCode ?? -1,
  }
}
```

Using `any` bypasses TypeScript's type checking and can lead to runtime issues if error properties don't exist.

## Suggested Fix

Use unknown and type guard:

```typescript
} catch (error: unknown) {
  const durationMs = Date.now() - startTime
  
  let output: string
  let exitCode: number = -1
  
  if (error instanceof Error) {
    output = error.message
    if ('exitCode' in error && typeof error.exitCode === 'number') {
      exitCode = error.exitCode
    }
    if ('stderr' in error && typeof error.stderr === 'string') {
      output = error.stderr || output
    }
  } else {
    output = String(error)
  }

  return {
    output,
    tokensUsed: { input: 0, output: 0 },
    turnsUsed: 0,
    stopReason: 'error',
    durationMs,
    exitCode,
  }
}
```

Or define a Bun shell error type:

```typescript
interface BunShellError extends Error {
  stderr?: string
  exitCode?: number
}

function isBunShellError(err: unknown): err is BunShellError {
  return err instanceof Error
}
```
