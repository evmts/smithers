# AgentThread Mutex Not Using Defer

**Severity:** 🟡 Medium  
**Type:** Thread Safety  
**File:** `src/agent_thread.zig#L110-117, L131-147`

## Problem

```zig
self.mutex.lock();
const state_changed = self.agent_loop.tick(self.database) catch |err| blk: {
    // ...
    break :blk false;
};
self.mutex.unlock();  // Manual unlock - no defer!
```

Multiple places use manual lock/unlock pattern. If any code between lock and unlock panics:
1. Mutex stays locked forever
2. Main thread deadlocks on next access

Same issue at lines 131-147:
```zig
self.mutex.lock();
// Many operations that could fail/panic
self.mutex.unlock();
```

## Impact

- Deadlock on panic
- Hard to diagnose hung application
- Classic mutex safety violation

## Fix

Use defer for unlock:

```zig
{
    self.mutex.lock();
    defer self.mutex.unlock();
    
    const state_changed = self.agent_loop.tick(self.database) catch |err| blk: {
        // ...
        break :blk false;
    };
    
    if (state_changed) {
        self.notifyStateChanged();
    }
}
```

Or use held pattern:

```zig
const held = self.mutex.lock();
defer held.unlock();
```

## Effort

M (30 min) - many instances to update
