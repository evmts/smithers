# Poor Error Messages in VCS Operations

## Files Affected

- [src/utils/vcs/git.ts](file:///Users/williamcory/smithers/src/utils/vcs/git.ts#L20-L22)
- [src/utils/vcs/jj.ts](file:///Users/williamcory/smithers/src/utils/vcs/jj.ts#L17-L19)

## Issue Description

VCS error messages may lose important context:

```typescript
// git.ts:20-22
} catch (error: any) {
  throw new Error(`git ${args.join(' ')} failed: ${error.stderr?.toString() || error.message}`)
}

// jj.ts:17-19
} catch (error: any) {
  throw new Error(`jj ${args.join(' ')} failed: ${error.stderr?.toString() || error.message}`)
}
```

Issues:
1. Uses `any` type for error
2. Loses the original error stack trace
3. `error.stderr?.toString()` may be empty, leaving vague messages

## Suggested Fix

Preserve error chain and improve typing:

```typescript
} catch (error: unknown) {
  const stderr = error instanceof Error && 'stderr' in error 
    ? String(error.stderr) 
    : ''
  const message = error instanceof Error ? error.message : String(error)
  const details = stderr || message || 'Unknown error'
  
  const wrapped = new Error(`git ${args.join(' ')} failed: ${details}`)
  wrapped.cause = error
  throw wrapped
}
```

Or use a custom error class:

```typescript
class GitError extends Error {
  constructor(
    public readonly command: string[],
    public readonly stderr: string,
    cause?: unknown
  ) {
    super(`git ${command.join(' ')} failed: ${stderr}`)
    this.cause = cause
    this.name = 'GitError'
  }
}
```
