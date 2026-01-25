# DB Reload Contention During Streaming

**Severity:** 🟡 Medium  
**Type:** Performance  
**File:** `src/app.zig`  
**Status:** ✅ FIXED

## Problem

Every `state_changed` flag from agent thread triggered a full `chat_history.reload()`:

```zig
// BEFORE: Reload on every state change (including every stream chunk)
if (self.agent_thread.consumeStateChanged()) {
    self.agent_thread.lockDb();
    defer self.agent_thread.unlockDb();
    self.chat_history.reload(&self.database) catch |err| { ... };
}
```

During streaming, state changes on every chunk → thrashing DB reads → mutex contention.

## Impact

- High CPU usage during streaming
- Agent thread blocked waiting for mutex
- UI feels laggy during streaming
- Unnecessary markdown re-parsing

## Fix

Added 100ms debounce during streaming:

```zig
// AFTER: Debounce reloads during streaming (max every 100ms)
if (self.agent_thread.consumeStateChanged()) {
    const now = Clk.milliTimestamp();
    const should_reload = !self.loading.isLoading() or (now - self.last_reload >= 100);
    if (should_reload) {
        self.agent_thread.lockDb();
        defer self.agent_thread.unlockDb();
        self.chat_history.reload(&self.database) catch |err| { ... };
        self.last_reload = now;
    }
}
```

When not loading, always reload immediately. During streaming, max 10 reloads/sec.

## Tests

See `src/tests/thread_safety_test.zig`:
- `Clock: MockClock can simulate time for debounce`
- `Debounce logic: should reload after 100ms`
- `Debounce logic: always reload when not loading`

## Commit

`fix(tui): address all review issues - thread safety, crash recovery, lock discipline`
