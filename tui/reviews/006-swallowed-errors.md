# Swallowed Errors Throughout Codebase

**Severity:** 🟡 Medium  
**Type:** Error Handling  
**Files:** `src/agent/loop.zig`, `src/agent_thread.zig`, `src/app.zig`

## Problem

Critical operations use `catch {}` or `catch |err| { log; continue }` which hides failures:

```zig
// agent_thread.zig#L111
const state_changed = self.agent_loop.tick(self.database) catch |err| blk: {
    // logged but returns false - loading stays true forever
    break :blk false;
};

// loop.zig - many places
database.updateMessageContent(msg_id, display_text) catch {};
database.updateAgentRunStatus(rid, .tools) catch {};

// app.zig#L161
self.chat_history.reload(&self.database) catch {};
```

## Impact

- Silent corruption
- "Stuck loading" states with no indication why
- Hard to debug production issues

## Fix

On agent tick error, force cleanup and notify user:

```zig
// agent_thread.zig
const state_changed = self.agent_loop.tick(self.database) catch |err| blk: {
    obs.global.logSimple(.err, @src(), "agent_thread", err_msg);
    // Force cleanup on error
    self.loading.cleanup(self.alloc);
    _ = self.database.addMessage(.system, "Error: Agent failed. See logs.") catch {};
    self.notifyStateChanged();
    break :blk true;
};
```

For DB updates during streaming, at minimum log:

```zig
database.updateMessageContent(msg_id, display_text) catch |err| {
    obs.global.logSimple(.err, @src(), "db.update", @errorName(err));
};
```

## Effort

M (1 hour)
