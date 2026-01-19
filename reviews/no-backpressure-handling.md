## Scope: easy

# No Backpressure Handling in ReactiveDatabase

## Status: LOW PRIORITY

## Summary
ReactiveDatabase triggers subscription callbacks synchronously and immediately on every mutation. Rapid mutations (e.g., bulk inserts, tight loops) cause immediate cascading re-renders with no batching, debouncing, or rate limiting.

## Impact
- High-frequency updates cause synchronous callback storms (N mutations = N immediate callbacks)
- Each callback triggers React re-render via `useSyncExternalStore` in `useQuery` hook
- Memory usage spikes during bulk operations as all updates execute synchronously
- UI becomes unresponsive with rapid mutations (no opportunity for event loop to breathe)
- No mechanism to drop/batch redundant invalidations for same table

## Current Implementation Details
**`src/reactive-sqlite/database.ts`:**
- L96-109: `run()` triggers invalidation immediately after each mutation
- L225-232, L266-271: Callbacks invoked directly in loops, no batching
- L279-296: `invalidate()` iterates all subscriptions synchronously
- No queue, no debouncing, no rate limiting

**React Integration:**
- `src/reactive-sqlite/hooks/useQuery.ts` L132-136: Uses `useSyncExternalStore`
- Expects synchronous callbacks, triggers immediate re-render on every invalidation

## Available Patterns in Codebase
1. **DebounceController** - `reference/opentui/packages/core/src/lib/debounce.ts`
   - Scope-based debouncing with configurable delays
   - Can batch multiple calls into single execution

2. **ProcessQueue** - `reference/opentui/packages/core/src/lib/queue.ts`
   - Async job queue using queueMicrotask
   - FIFO processing, prevents stack overflow

## Suggested Fix
**Add batching layer to `ReactiveDatabase`:**

```typescript
// Option 1: Microtask batching (simplest, ~0 delay)
private pendingInvalidations = new Set<string>()
private batchScheduled = false

invalidate(tables?: string[]): void {
  tables?.forEach(t => this.pendingInvalidations.add(t.toLowerCase()))

  if (!this.batchScheduled) {
    this.batchScheduled = true
    queueMicrotask(() => {
      this.flushInvalidations()
      this.batchScheduled = false
    })
  }
}

// Option 2: Debounced (configurable delay)
// Use DebounceController pattern from reference lib
// Config option: invalidationDebounceMs (default: 0 for microtask, or 16 for rAF)
```

**Benefits:**
- 100 mutations in loop → 1 batched callback (vs 100 synchronous callbacks)
- Works with existing `useSyncExternalStore` (callbacks still synchronous, just batched)
- Backward compatible - add as opt-in config initially
- Minimal code change (~20 lines)

## Priority
**P4** - Performance optimization

## Estimated Effort
2-3 hours (easy scope - add batching layer, test with bulk mutations)

## Debugging Plan

### Files to Investigate
- [`src/reactive-sqlite/database.ts`](file:///Users/williamcory/smithers/src/reactive-sqlite/database.ts) - Core issue location (L282-299 `invalidate()`, L242-276 `invalidateWithRowFilter()`)
- [`src/reactive-sqlite/hooks/useQuery.ts`](file:///Users/williamcory/smithers/src/reactive-sqlite/hooks/useQuery.ts) - Consumer of callbacks via `useSyncExternalStore`
- [`reference/opentui/packages/core/src/lib/queue.ts`](file:///Users/williamcory/smithers/reference/opentui/packages/core/src/lib/queue.ts) - Reference pattern for ProcessQueue

### Grep Patterns
```bash
# Find all callback invocations
grep -n "subscription.callback()" src/reactive-sqlite/

# Check for existing batching attempts
grep -rn "queueMicrotask\|pendingInvalidations\|batchScheduled" src/reactive-sqlite/

# Find all invalidate call sites
grep -rn "\.invalidate\(" src/
```

### Test Commands to Reproduce
```typescript
// Add to database.test.ts - should show N callbacks for N mutations
test('bulk insert triggers callback per mutation (no batching)', () => {
  const db = new ReactiveDatabase(':memory:')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
  
  let callCount = 0
  db.subscribe(['t'], () => callCount++)
  
  for (let i = 0; i < 100; i++) {
    db.run('INSERT INTO t (id) VALUES (?)', [i])
  }
  
  // Currently: callCount === 100 (bad)
  // After fix: callCount === 1 (batched)
  expect(callCount).toBe(100) // Will fail after fix
})
```

### Proposed Fix Approach
1. Add `pendingInvalidations: Set<string>` and `batchScheduled: boolean` private fields
2. Modify `invalidate()` to collect tables in set and schedule via `queueMicrotask`
3. Add `flushInvalidations()` private method to execute batched callbacks
4. Same pattern for `invalidateWithRowFilter()` with row filter deduplication
5. Add `invalidationMode: 'sync' | 'batched'` config option for backward compat
6. Update tests to verify batching behavior

## Last Reviewed: 2026-01-18

**Status: STILL RELEVANT**

Verified `invalidate()` at L282-299 still loops synchronously over subscriptions with no batching. Grep confirms no `queueMicrotask`, `pendingInvalidations`, or `batchScheduled` patterns exist in `src/reactive-sqlite/`.
