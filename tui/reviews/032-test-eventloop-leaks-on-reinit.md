# Test EventLoop DI Leaks on suspendTui/reinitTty

**Severity:** 🟡 Medium  
**Type:** Test Leak  
**File:** `src/tests/event_loop_test.zig`

## Problem

In `TestEventLoop`:
- `suspendTui()` does `self.loop = ...` without `self.loop.deinit()` first
- `reinitTty()` overwrites `self.tty` and `self.loop` without deinit

`MockLoop` owns `ArrayList` (`event_queue`) and `MockTty` owns `ArrayList` (`MockWriter.written`). Overwriting without deinit leaks under `std.testing.allocator`.

## Impact

- Test failure due to leak detection
- False positives hide real leaks

## Fix

```zig
pub fn suspendTui(self: *Self) !void {
    // Cleanup old resources first
    self.loop.stop();
    self.loop.deinit();
    self.tty.deinit();
    
    // Recreate
    self.tty = try Tty.init(&self.tty_buffer);
    self.loop = MockLoop.initWithAllocator(self.allocator, &self.tty, &self.vx);
    try self.loop.init();
    try self.loop.start();
    // ...
}

pub fn reinitTty(self: *Self) !void {
    // Same pattern - deinit before reinit
    self.loop.deinit();
    self.tty.deinit();
    
    self.tty = try Tty.init(&self.tty_buffer);
    self.loop = MockLoop.initWithAllocator(self.allocator, &self.tty, &self.vx);
    try self.loop.init();
    try self.loop.start();
}
```

## Effort

S (15 min)
