# Loading State Data Race

**Severity:** 🔴 Critical  
**Type:** Thread Safety  
**File:** `src/keys/handler.zig`, `src/loading.zig`  
**Status:** ✅ FIXED

## Problem

`Loading` state was accessed from both main thread (KeyHandler) and agent thread without proper synchronization. Specifically, `setPendingQuery()` and `startLoading()` were called from main thread without holding the mutex.

```zig
// BEFORE: Race condition - main thread mutates Loading without lock
if (ctx.has_ai) {
    ctx.loading.setPendingQuery(try self.alloc.dupe(u8, command));
    ctx.loading.startLoading();
    return .start_ai_query;
}
```

## Impact

- Possible use-after-free if agent thread calls `cleanup()` while main thread reads
- Data corruption in `pending_query` field
- Undefined behavior under concurrent access

## Fix

All `Loading` mutations from main thread now protected by `lockDb()`:

```zig
// AFTER: Protected by mutex
if (ctx.has_ai) {
    ctx.agent_thread.lockDb();
    defer ctx.agent_thread.unlockDb();
    ctx.loading.setPendingQuery(try self.alloc.dupe(u8, command));
    ctx.loading.startLoading();
    return .start_ai_query;
}
```

## Tests

See `src/tests/thread_safety_test.zig`:
- `Loading: atomic flags can be read without mutex`
- `Loading: requestCancel sets atomic flag`
- `Loading: startLoading clears cancel flag`
- `Loading: cleanup clears all atomic flags`
- `Loading: setPendingQuery updates atomic flag`

## Commit

`fix(tui): address all review issues - thread safety, crash recovery, lock discipline`
