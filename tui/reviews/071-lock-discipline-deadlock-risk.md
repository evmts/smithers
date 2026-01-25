# Lock Discipline: Deadlock Risk

**Severity:** 🟡 Medium  
**Type:** Thread Safety  
**File:** `src/keys/handler.zig`  
**Status:** ✅ FIXED

## Problem

Manual `lockDb()`/`unlockDb()` calls without `defer`:

```zig
// BEFORE: Early return/throw leaves mutex locked → deadlock
ctx.agent_thread.lockDb();
const count = try ctx.database.getSessionCount();  // If this throws...
// ...unlock never called!
ctx.agent_thread.unlockDb();
return .none;
```

## Impact

- Any error in locked section → mutex never released
- Next lock attempt → deadlock
- App hangs on any DB error

## Fix

Changed all lock patterns to use `defer`:

```zig
// AFTER: defer ensures unlock on any exit path
ctx.agent_thread.lockDb();
defer ctx.agent_thread.unlockDb();
const count = try ctx.database.getSessionCount();
// unlock called even if getSessionCount throws
```

Also renamed `lockForRead`/`unlockForRead` → `lockDb`/`unlockDb` for clarity (it's a simple mutex, not RW lock).

## Tests

See `src/tests/thread_safety_test.zig`:
- `Mutex: defer unlock ensures cleanup on early return`
- `Mutex: tryLock works after defer unlock`

## Commit

`fix(tui): address all review issues - thread safety, crash recovery, lock discipline`
