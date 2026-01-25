# Filesystem Abstraction Breaks for Absolute Paths

**Severity:** 🟢 Low  
**Type:** Correctness  
**File:** `src/filesystem.zig`

## Problem

```zig
pub fn openFile(path: []const u8, flags: OpenFlags) !File {
    return std.fs.cwd().openFile(path, flags);
}
```

Tools pass absolute paths (e.g., `/home/user/file.txt`), but `cwd().openFile()` may not handle absolute paths correctly depending on Zig's semantics.

Meanwhile `makeDirAbsolute` uses absolute path APIs.

## Impact

- Tools may fail to open files with absolute paths
- Inconsistent behavior between operations
- `read_file`, `write_file`, `edit_file` tools affected

## Fix

Detect and route absolute paths:

```zig
pub fn openFile(path: []const u8, flags: OpenFlags) !File {
    if (std.fs.path.isAbsolute(path)) {
        return std.fs.openFileAbsolute(path, .{
            .mode = if (flags.write) .read_write else .read_only,
        });
    }
    return std.fs.cwd().openFile(path, .{
        .mode = if (flags.write) .read_write else .read_only,
    });
}

pub fn readFileAlloc(allocator: std.mem.Allocator, path: []const u8) ![]u8 {
    if (std.fs.path.isAbsolute(path)) {
        const file = try std.fs.openFileAbsolute(path, .{});
        defer file.close();
        return file.readToEndAlloc(allocator, std.math.maxInt(usize));
    }
    return std.fs.cwd().readFileAlloc(allocator, path, std.math.maxInt(usize));
}
```

## Effort

S (20 min)
