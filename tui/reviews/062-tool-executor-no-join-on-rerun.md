# ToolExecutor Returns Error Without Joining Running Thread

**Severity:** 🟡 Medium  
**Type:** Resource Leak  
**File:** `src/agent/tool_executor.zig`

## Problem

If `execute()` is called while a thread is already running:

```zig
pub fn execute(self: *Self, tool_name: []const u8, input: anytype) !void {
    self.mutex.lock();
    defer self.mutex.unlock();
    
    if (self.thread != null) {
        return error.AlreadyRunning;  // Existing thread not joined!
    }
    // ...
}
```

The existing thread continues running but is orphaned. If later `deinit()` is called, it joins `self.thread` which may be a different handle or null.

## Impact

- Orphaned thread leaks resources
- Thread continues executing after executor is "done"
- Potential UAF if thread accesses freed executor

## Fix

Either wait for existing thread or fail properly:

```zig
pub fn execute(self: *Self, tool_name: []const u8, input: anytype) !void {
    self.mutex.lock();
    
    if (self.thread) |existing| {
        self.mutex.unlock();
        existing.join();  // Wait for completion
        self.mutex.lock();
    }
    
    defer self.mutex.unlock();
    // ...
}
```

Or clear state after join in poll:

```zig
pub fn poll(self: *Self) ?ThreadResult {
    // ...
    if (got_result) {
        self.thread.?.join();
        self.thread = null;  // Clear handle
        return result;
    }
}
```

## Effort

S (20 min)
