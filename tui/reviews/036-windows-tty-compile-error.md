# WindowsTty.read References Non-Existent Field

> **VENDOR ISSUE**: This is in vendored vaxis code (renderer/src/tty.zig). Cannot fix without forking upstream.

**Severity:** 🔴 Critical  
**Type:** Compile Error  
**File:** `renderer/WindowsTty.zig` (vendored vaxis)

## Problem

```zig
pub fn read(self: *const Tty, buf: []u8) !usize {
    return posix.read(self.fd, buf);  // WindowsTty has no `fd` field!
}
```

`WindowsTty` doesn't have an `fd` field. This will fail to compile on Windows builds.

## Impact

- Cannot build for Windows
- Dead code if Windows path is never tested

## Fix

Either remove the method if unused on Windows, or implement properly:

```zig
pub fn read(self: *const WindowsTty, buf: []u8) !usize {
    var bytes_read: windows.DWORD = 0;
    const success = windows.ReadFile(
        self.stdin,
        buf.ptr,
        @intCast(buf.len),
        &bytes_read,
        null,
    );
    if (success == 0) return error.ReadError;
    return bytes_read;
}
```

## Effort

S (30 min)
