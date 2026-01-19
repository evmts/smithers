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

## Debugging Plan

### Files to Investigate
- `/Users/williamcory/smithers/src/components/agents/claude-cli/executor.ts` (primary - lines 170-201, 324-335)
- `/Users/williamcory/smithers/src/components/agents/claude-cli/arg-builder.ts` (for understanding args format)

### Grep Patterns
```bash
# Find all error return paths
grep -n "stopReason: 'error'" src/components/agents/claude-cli/executor.ts

# Find stderr usage
grep -n "stderr" src/components/agents/claude-cli/executor.ts

# Check if pattern exists elsewhere
grep -rn "Command:.*args.join" src/
```

### Test Commands to Reproduce
```bash
# Trigger exit code !== 0 with invalid arg
bun run src/components/agents/claude-cli/executor.ts --invalid-flag

# Trigger exception with invalid cwd
# Call executeClaudeCLIOnce with cwd: '/nonexistent/path'
```

### Proposed Fix Approach

1. **executeClaudeCLIOnce exitCode !== 0 (lines 179-189)**:
   - Enhance output to include stderr and command when `exitCode !== 0`
   - Format: `Claude CLI failed (exit ${exitCode})\nCommand: claude ${args.join(' ')}\n\nSTDOUT:\n${parsed.output}\n\nSTDERR:\n${stderr}`

2. **executeClaudeCLIOnce exception (lines 194-201)**:
   - Include command args and any collected stderr in error output
   - `args` variable is in scope from line 40

3. **executeClaudeShell error (lines 327-334)**:
   - Add `argsString` (line 307) to error output

4. **Test**: Verify with invalid cwd and invalid args to confirm both paths now show full context

## Debugging Plan

### Verified Issue Locations (current line numbers)
- `executeClaudeCLIOnce` exitCode !== 0: **lines 179-189** - returns `parsed.output` only
- `executeClaudeCLIOnce` exception: **lines 194-201** - returns `errorMessage` only
- `executeClaudeShell` error: **lines 327-334** - missing command context

### Fix Steps

1. **executeClaudeCLIOnce exitCode !== 0 (line 179-189)**
   ```typescript
   // When exitCode !== 0, replace line 180:
   output: exitCode !== 0 
     ? `Claude CLI failed (exit ${exitCode})\nCommand: claude ${args.join(' ')}\n\nSTDOUT:\n${parsed.output}\n\nSTDERR:\n${stderr}`
     : parsed.output,
   ```

2. **executeClaudeCLIOnce exception (lines 194-201)**
   ```typescript
   output: `Claude CLI execution error\nCommand: claude ${args.join(' ')}\nError: ${errorMessage}`,
   ```

3. **executeClaudeShell error (lines 327-334)**
   ```typescript
   output: `Claude CLI failed\nCommand: claude ${argsString}\n\n${error.stderr || error.message || String(error)}`,
   ```

### Validation
```bash
bun test src/components/agents/claude-cli/
```
