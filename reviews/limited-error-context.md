<!-- Scope: easy -->

# Limited Error Context from CLI

## Status: LOW PRIORITY

## Summary
When the Claude CLI subprocess fails, error messages provide minimal context. This makes debugging orchestration failures difficult.

## Impact
- Hard to diagnose why a Claude invocation failed
- Users may not understand what went wrong
- Debugging complex workflows is tedious

## Current Implementation

### Location
`/Users/williamcory/smithers/src/components/agents/claude-cli/executor.ts`

### What's Missing

**In executeClaudeCLIOnce() - exitCode !== 0 path (lines 147-160):**
- stderr is collected but NOT included in error output
- Only stdout is returned via `parsed.output`
- stderr only used to extract sessionId (line 142)
- Command args never logged

**In executeClaudeCLIOnce() - exception path (lines 161-173):**
- Only returns `error.message`
- No stderr content
- No command/args
- No execution context

**In executeClaudeShell() - error path (lines 288-299):**
- Returns `error.stderr || error.message` (better)
- Still missing command/args context

## Fix Implementation Pattern

Based on codebase patterns in `/Users/williamcory/smithers/src/components/Claude.tsx` (line 188-189):

```typescript
// When exitCode !== 0, enhance error output:
return {
  output: `Claude CLI failed with exit code ${exitCode}

Command: claude ${args.join(' ')}

STDOUT:
${parsed.output}

STDERR:
${stderr}`,
  // ... rest of result
  stopReason: 'error',
  exitCode,
}

// In exception handler:
return {
  output: `Claude CLI execution error

Command: claude ${args.join(' ')}
Error: ${errorMessage}

${stderr ? `STDERR:\n${stderr}` : ''}`,
  // ... rest
}
```

## Testing Strategy

1. Trigger exit code !== 0 by passing invalid args
2. Trigger exception by using invalid cwd
3. Verify both paths include command + stderr
4. Ensure existing error handling still works

## Priority
**P3** - Quality of life improvement

## Estimated Effort
1-2 hours (easy scope - localized changes to error handlers)
