# App Runs agent_thread.deinit Even If start() Fails

**Severity:** 🟢 Low  
**Type:** Error Handling  
**File:** `src/app.zig#L144-146`

## Problem

```zig
try self.event_loop.start();

// ...
try self.agent_thread.start();
defer self.agent_thread.deinit();  // Always runs
```

If `agent_thread.start()` fails, the `defer` still runs `deinit()`. Depending on `deinit()` implementation, this could:
1. Try to join a thread that was never spawned (undefined)
2. Access uninitialized state

## Impact

- Likely benign since `deinit()` checks for null thread
- But violates "only cleanup what was initialized" principle

## Current Mitigation

Looking at `agent_thread.deinit()`:
```zig
pub fn deinit(self: *Self) void {
    if (self.thread) |t| {
        t.join();
    }
    self.thread = null;
}
```

Thread is null-checked, so this is safe. Low priority.

## Fix

Use errdefer pattern:

```zig
try self.agent_thread.start();
errdefer self.agent_thread.requestStop();  // Signal stop on error

// ... main loop ...

self.agent_thread.deinit();  // Explicit deinit at end
```

Or keep defer but document the null-safety requirement.

## Effort

S (10 min)
