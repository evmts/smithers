# openExternalEditor Uses Fixed Temp File Path

**Severity:** 🟢 Low  
**Type:** Security / Reliability  
**File:** `src/editor.zig`

## Problem

```zig
const tmp_path = "/tmp/smithers-edit.txt";
```

## Impact

- Two instances collide and overwrite each other
- Symlink attack possible (user could symlink to sensitive file)
- Leftover file may contain sensitive content if cleanup fails
- Race condition between write and editor open

## Fix

Use unique temp file:

```zig
fn getTempPath(allocator: std.mem.Allocator) ![]u8 {
    const pid = std.os.linux.getpid();  // or std.process.id()
    const ts = std.time.milliTimestamp();
    return std.fmt.allocPrint(allocator, "/tmp/smithers-edit-{d}-{d}.txt", .{pid, ts});
}
```

Or use proper temp file helper with exclusive create:

```zig
const tmp_dir = std.fs.openDirAbsolute("/tmp", .{}) catch return error.TempDirUnavailable;
defer tmp_dir.close();

var buf: [32]u8 = undefined;
const tmp_name = std.fmt.bufPrint(&buf, "smithers-{x}", .{std.crypto.random.int(u64)}) catch unreachable;

const file = tmp_dir.createFile(tmp_name, .{ .exclusive = true }) catch return error.TempFileCreate;
```

## Effort

S (15 min)
