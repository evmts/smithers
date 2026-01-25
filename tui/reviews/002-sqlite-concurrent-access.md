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

Even if SQLite is compiled in "serialized" mode, **sharing a single connection object across threads without a unified locking discipline is a common failure mode**.

## Impact

- Random SQLite errors ("database is locked")
- Database corruption
- Intermittent crashes
- Hard-to-debug heisenbugs

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

## Fix Options

**Option A (minimal): Serialize all DB access with same mutex**
```zig
// In App.run()
if (self.agent_thread.consumeStateChanged()) {
    self.agent_thread.lockForRead();
    defer self.agent_thread.unlockForRead();
    self.chat_history.reload(&self.database) catch {};
}
```
And similarly around any key handler paths that mutate DB.

**Option B (preferred): Separate DB connections per thread**
- Main thread: `Db.init(...)` -> connection A
- Agent thread: its own `Db.init(...)` -> connection B

Enable WAL mode and let SQLite coordinate. This eliminates cross-thread connection sharing and reduces lock contention.

```zig
// In App
database_ui: Db,
database_agent: Db,
```

**Option C: Agent thread owns DB, queue operations**
Main thread sends requests to agent thread queue. Agent thread does all DB I/O.

## Effort

M (1-2 hours) for Option A, L (half day) for Option B
