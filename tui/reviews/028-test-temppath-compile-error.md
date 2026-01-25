# Test tempPath() Uses ++ Incorrectly - Compile Error

**Severity:** 🔴 Critical  
**Type:** Compile Error  
**File:** `src/tests/filesystem_test.zig`

## Problem

```zig
fn tempPath(name: []const u8) []const u8 {
    return "/tmp/" ++ name;  // COMPILE ERROR
}
```

`++` is compile-time concatenation and requires RHS to be known at comptime. With `name: []const u8` (runtime), this fails.

## Impact

- Tests won't compile
- CI/CD blocked

## Fix

Option A: Make argument comptime (if only passing literals):
```zig
fn tempPath(comptime name: []const u8) []const u8 {
    return "/tmp/" ++ name;
}
```

Option B: Don't use helper, pass full literals:
```zig
const handle = try StdFs.openFile("/tmp/fs_test_read.txt", .{});
```

Option C: Allocate at runtime:
```zig
fn tempPathAlloc(allocator: std.mem.Allocator, name: []const u8) ![]u8 {
    return std.fmt.allocPrint(allocator, "/tmp/{s}", .{name});
}
// Usage: defer allocator.free(path);
```

## Effort

S (10 min)
