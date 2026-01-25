# SQLite Concurrent Access Without Mutex

**Severity:** 🔴 Critical  
**Type:** Thread Safety  
**Files:** `src/app.zig`, `src/keys/handler.zig`, `src/agent_thread.zig`

## Problem

Main thread accesses SQLite database without mutex:
- `chat_history.reload(&self.database)` 
- `ctx.database.addMessage()`
- `ctx.database.clearMessages()`
- etc.

Agent thread uses `self.mutex` around DB operations, but main thread bypasses it entirely.

SQLite objects are not safe for concurrent use without serialization.

## Impact

- Random SQLite errors
- Database corruption
- Hard-to-debug crashes

## Current Code

```zig
// agent_thread.zig - agent uses mutex
self.mutex.lock();
const state_changed = self.agent_loop.tick(self.database) catch ...;
self.mutex.unlock();

// app.zig - main thread NO mutex
self.chat_history.reload(&self.database) catch {};  // RACE

// handler.zig - main thread NO mutex  
_ = try ctx.database.addMessage(.user, command);  // RACE
```

## Fix

Option A: Add mutex to KeyContext, wrap all DB ops:
```zig
pub fn KeyContext(...) type {
    return struct {
        // existing fields...
        mutex: *std.Thread.Mutex,
    };
}

// In handleKey, wrap DB access:
ctx.mutex.lock();
defer ctx.mutex.unlock();
_ = try ctx.database.addMessage(.user, command);
```

Option B: Queue all DB writes to agent thread (message passing).

## Effort

M (1-2 hours) for Option A
