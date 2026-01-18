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
