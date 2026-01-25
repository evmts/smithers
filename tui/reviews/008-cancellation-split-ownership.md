# Cancellation Logic Split Between Threads

**Severity:** 🟡 Medium  
**Type:** Thread Safety  
**Files:** `src/keys/handler.zig`, `src/agent/loop.zig`

## Problem

Cancellation is performed by both threads:

**Main thread (handler.zig#L85-93):**
```zig
ctx.loading.requestCancel();
if (ctx.loading.agent_run_id) |rid| {
    ctx.database.failAgentRun(rid) catch {};  // DB write without mutex
}
_ = try ctx.database.addMessage(.system, "Interrupted.");
```

**Agent thread (loop.zig#L50-64):**
```zig
if (self.loading.isCancelRequested()) {
    if (self.streaming) |*stream| {
        ProviderApi.cleanup(stream, self.alloc);  // kills curl
        self.streaming = null;
    }
    self.loading.cleanup(self.alloc);
}
```

Both threads write to DB and modify state simultaneously.

## Impact

- Race between main thread's `failAgentRun` and agent thread's cleanup
- Potential double-free if both try to cleanup
- Interleaved DB state

## Fix

Make agent thread own all cancellation side effects:

```zig
// handler.zig - ONLY set flag
if (ctx.loading.isLoading()) {
    ctx.loading.requestCancel();
    // Don't touch DB or agent_run_id here
}

// loop.zig - do ALL cleanup
if (self.loading.isCancelRequested()) {
    if (self.loading.agent_run_id) |rid| {
        database.failAgentRun(rid) catch {};
    }
    _ = database.addMessage(.system, "Interrupted.") catch {};
    // ... rest of cleanup
}
```

## Effort

S (20 min)
