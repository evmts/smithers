# Limited Error Context from CLI

## Status: LOW PRIORITY

## Summary
When the Claude CLI subprocess fails, error messages provide minimal context. This makes debugging orchestration failures difficult.

## Impact
- Hard to diagnose why a Claude invocation failed
- Users may not understand what went wrong
- Debugging complex workflows is tedious

## Location
- `src/components/agents/executor.ts`

## Suggested Fix
1. Capture and log full stderr output
2. Include command arguments in error messages
3. Add structured error types for common failures
4. Include execution context (phase, step, iteration) in errors
5. Consider adding retry-with-logging option

## Priority
**P3** - Quality of life improvement

## Estimated Effort
2-3 hours
