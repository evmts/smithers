# LoadingState Non-Atomic Fields Accessed By Both Threads

**Severity:** 🟡 Medium  
**Type:** Thread Safety  
**File:** `src/loading.zig`, `src/app.zig`

## Problem

Only `is_loading_atomic` and `cancel_requested` are atomic. Other fields are accessed by both threads:

```zig
// Main thread (app.zig#L219) - NO LOCK
if (self.loading.pending_query != null) {
    self.agent_thread.wakeForWork();
}

// Agent thread - has lock
self.mutex.lock();
const has_query = self.loading.pending_query != null;
```

Fields with potential races:
- `pending_query`
- `pending_continuation`
- `pending_tools`
- `tool_results`
- `assistant_content_json`
- `agent_run_id`

## Impact

- TOCTOU bugs
- Torn reads on pointer fields
- Undefined behavior

## Fix

Either:

1. **Make all cross-thread reads go through mutex** (recommended):
```zig
// app.zig
self.agent_thread.mutex.lock();
const has_pending = self.loading.pending_query != null;
self.agent_thread.mutex.unlock();
if (has_pending) self.agent_thread.wakeForWork();
```

2. **Or add atomic flag for "has pending work"**:
```zig
// loading.zig
has_pending_work: std.atomic.Value(bool) = .init(false),

// Set when query/continuation added
pub fn setPendingQuery(self: *Self, q: []const u8) void {
    self.pending_query = q;
    self.has_pending_work.store(true, .release);
}
```

## Effort

S (30 min) for option 2
