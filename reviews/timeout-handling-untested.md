**SCOPE: easy**

# Timeout Handling Not Thoroughly Tested

## Status: LOW PRIORITY

## Summary
The Orchestration component (`src/components/Orchestration.tsx`) has timeout handling implemented via `globalTimeout` prop and `stopConditions`, but lacks integration tests that exercise actual timeout behavior. While stop conditions are unit tested (`src/components/agents/claude-cli/stop-conditions.test.ts`), the Orchestration component's timeout orchestration logic (setTimeout cleanup, requestStop flow, onStopRequested callbacks) is untested.

## Impact
- Timeout behavior may not work as expected
- Edge cases in timeout handling unknown (e.g., timer cleanup on early unmount, concurrent stop requests)
- May cause orphaned processes or stuck states
- Callback sequence (onStopRequested, onComplete) untested

## Implementation Details

### Current State
- `globalTimeout` prop sets a setTimeout that calls `requestStop()`
- Timer cleanup happens in `useUnmount` (lines 207-208)
- Stop condition polling uses setInterval (every 1s) that also calls `requestStop()`
- Both timers get cleared on unmount

### Missing Test Coverage
1. **Timeout triggers** - No test verifies setTimeout actually fires and calls requestStop
2. **Timer cleanup** - No test verifies timers are cleared on unmount
3. **Callback flow** - onStopRequested → onComplete sequence untested
4. **Concurrent stops** - Multiple stop conditions triggering simultaneously
5. **DB state on timeout** - Execution status should be 'stopped' not 'completed'

## Location
- Implementation: `src/components/Orchestration.tsx`
- Related tests: `src/components/agents/claude-cli/stop-conditions.test.ts` (unit tests only)
- No eval tests exercise Orchestration component

## Suggested Fix

### Pattern to Follow
Based on existing test patterns in `evals/` directory:
- Use `createTestEnvironment` from `evals/setup`
- Render SmithersProvider with Orchestration wrapper
- Use short timeout (100ms) for fast test execution
- Verify callbacks and DB state

### Test Cases Needed
```typescript
// 1. Basic timeout fires
<Orchestration
  globalTimeout={100}
  onStopRequested={(reason) => { /* verify reason */ }}
>
  <Step name="long-running">...</Step>
</Orchestration>

// 2. Cleanup on early unmount
// 3. Stop condition triggers before timeout
// 4. Timeout with onComplete callback
// 5. DB execution status = 'stopped' when timeout
```

### Files to Create/Modify
- Create `evals/15-orchestration-timeout.test.tsx`
- Follow pattern from `evals/13-composition-advanced.test.tsx`
- Test both `globalTimeout` and `stopConditions` timeout paths

## Priority
**P3** - Testing improvement (low risk - core logic is simple setTimeout/clearTimeout)

## Estimated Effort
**2-3 hours** - Write 5-7 integration test cases following eval test patterns

## Debugging Plan

### Files to Investigate
- `src/components/SmithersProvider.tsx` (lines 408-480) - timeout & stopConditions logic
- `evals/setup.ts` - test utilities (`waitFor`, `delay`)
- `evals/13-composition-advanced.test.tsx` - pattern to follow

### Grep Patterns
```bash
# Find timeout timer setup/cleanup
grep -n "timeoutIdRef\|checkIntervalIdRef" src/components/SmithersProvider.tsx

# Find stop request flow
grep -n "stop_requested\|requestStop\|onStopRequested" src/components/

# Find existing eval patterns
grep -n "SmithersProvider\|createTestEnvironment" evals/*.tsx
```

### Test Commands to Reproduce
```bash
# Run existing evals to understand pattern
bun test evals/13-composition-advanced.test.tsx

# After creating test file
bun test evals/15-orchestration-timeout.test.tsx
```

### Proposed Fix Approach
1. Create `evals/15-orchestration-timeout.test.tsx`
2. Test cases:
   - `globalTimeout` fires and calls `onStopRequested`
   - Timer cleanup on unmount (no memory leak)
   - `stopConditions` triggers before `globalTimeout`
   - DB state shows `status='stopped'` after timeout
   - Concurrent stop conditions handled gracefully
3. Use short timeouts (50-100ms) for fast tests
4. Follow pattern from `evals/13-composition-advanced.test.tsx`
