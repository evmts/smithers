# Streaming DB Updates Are Redundant

**Severity:** 🟢 Low  
**Type:** Performance  
**File:** `src/agent/loop.zig`

## Problem

```zig
// In poll_active_stream()
if (text.len > 0) {
    database.updateMessageContent(msg_id, display_text) catch {};
    state_changed = true;
}
```

This runs every tick, even when text length hasn't changed since last tick.

`ProviderApi.poll()` returns `WouldBlock` most of the time (no new data), but we still write identical content to DB.

## Impact

- Unnecessary SQLite writes (I/O, locking)
- Triggers unnecessary `chat_history.reload()` via `state_changed`
- Unnecessary markdown re-parsing
- Higher CPU usage during streaming

## Fix

Track last flushed length:

```zig
// Add to streaming state or AgentLoop
last_flushed_len: usize = 0,

// In poll_active_stream()
if (text.len > 0 and text.len != self.last_flushed_len) {
    database.updateMessageContent(msg_id, display_text) catch {};
    self.last_flushed_len = text.len;
    state_changed = true;
}
```

Or throttle updates:
```zig
const now = std.time.milliTimestamp();
if (now - self.last_db_update > 100) {  // max 10 updates/sec
    database.updateMessageContent(msg_id, display_text) catch {};
    self.last_db_update = now;
}
```

## Effort

S (15 min)
