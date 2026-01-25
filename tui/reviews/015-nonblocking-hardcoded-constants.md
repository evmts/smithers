# Streaming Nonblocking Setup Uses Hardcoded Platform Constants

**Severity:** 🟡 Medium  
**Type:** Portability  
**File:** `src/streaming.zig`, `src/agent/anthropic_provider.zig`

## Problem

```zig
const F_GETFL = 3;
const F_SETFL = 4;
const O_NONBLOCK: usize = 0x0004;
const flags = std.posix.fcntl(fd, F_GETFL, 0) catch 0;
_ = std.posix.fcntl(fd, F_SETFL, flags | O_NONBLOCK) catch {};
```

`O_NONBLOCK` is `0x0004` on macOS but **`0x800` on Linux**. This breaks nonblocking behavior on Linux, causing the agent thread to hang.

## Impact

- Streaming hangs on Linux
- Agent thread blocks indefinitely in `poll()`
- Application appears frozen

## Fix

Use platform-provided constants:

```zig
const flags = std.posix.fcntl(fd, std.posix.F.GETFL, 0) catch 0;
_ = std.posix.fcntl(fd, std.posix.F.SETFL, flags | std.posix.O.NONBLOCK) catch {};
```

Or if those aren't available in your Zig version:

```zig
const O_NONBLOCK = if (@import("builtin").os.tag == .macos) 
    0x0004 
else 
    0x800;
```

## Effort

S (10 min)
