# AgentThread Double-Deinit on Normal Exit

**Severity:** 🔴 Critical  
**Type:** Memory Safety / Resource Lifecycle  
**File:** `src/app.zig#L133-L146`

## Problem

In `App.run()`:
```zig
try self.agent_thread.start();
defer self.agent_thread.deinit();
```

In `App.deinit()`:
```zig
self.agent_thread.deinit();
```

If `main()` does:
```zig
var app = try App.init(alloc);
defer app.deinit();
try app.run();
```

Then `agent_thread.deinit()` runs **twice** on normal exit from `run()`.

## Impact

- Double-free of thread resources
- Undefined behavior
- Potential crashes on shutdown

## Fix

Make one function the single owner. Recommended pattern:

```zig
// In run() - only stop/join, no deinit
try self.agent_thread.start();
defer {
    self.agent_thread.stop();
    self.agent_thread.join();
}

// In deinit() - only deinit (which should handle not-started case)
pub fn deinit(self: *Self) void {
    self.agent_thread.deinit(); // single owner
    // ...
}
```

Or make `AgentThread.deinit()` explicitly idempotent:
```zig
pub fn deinit(self: *Self) void {
    if (self.thread == null) return; // already cleaned up
    self.stop();
    self.join();
    // cleanup...
    self.thread = null;
}
```

## Effort

S (20 min)
