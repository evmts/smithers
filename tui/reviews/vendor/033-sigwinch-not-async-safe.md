# POSIX SIGWINCH Handler Not Async-Signal-Safe

> **VENDOR ISSUE**: This is in vendored vaxis code (renderer/src/tty.zig). Cannot fix without forking upstream.

**Severity:** 🔴 Critical  
**Type:** Concurrency / UB  
**File:** `renderer/PosixTty.zig` (vendored vaxis)

## Problem

```zig
fn handleWinch(context: *anyopaque) void {
    handler_mutex.lock();  // NOT async-signal-safe
    defer handler_mutex.unlock();
    ...
    handler.callback(handler.context);  // arbitrary code in signal
}
```

In a POSIX signal handler you must NOT:
- Lock a mutex
- Call condition variables
- Call arbitrary callbacks
- Perform allocations
- Do logging

Doing so risks deadlock and UB if the signal interrupts a thread holding the mutex or inside runtime code.

## Impact

- Deadlock if signal fires while mutex held
- Memory corruption if signal fires during allocation
- Undefined behavior

## Fix

Use self-pipe pattern:

```zig
// During init
const pipe_fds = try std.posix.pipe();
signal_read_fd = pipe_fds[0];
signal_write_fd = pipe_fds[1];

// Signal handler - ONLY write a byte (async-signal-safe)
fn handleWinch(_: c_int) callconv(.C) void {
    _ = std.posix.write(signal_write_fd, &[_]u8{1}) catch {};
}

// Event loop polls signal_read_fd, calls callbacks from normal context
```

This is the standard approach in robust TUIs.

## Effort

L (half day) - requires event loop integration
