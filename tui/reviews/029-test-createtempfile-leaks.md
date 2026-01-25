# Test createTempFile() Leaks Filename Allocation

**Severity:** 🟡 Medium  
**Type:** Test Leak  
**File:** `src/tests/edit_file_test.zig`

## Problem

```zig
fn createTempFile(allocator: std.mem.Allocator) ![]const u8 {
    const filename = try std.fmt.allocPrint(allocator, "edit_file_test_{d}.txt", .{rand});
    // filename NEVER freed!
    return try std.fmt.allocPrint(allocator, "/tmp/{s}", .{filename});
}
```

`filename` is allocated but never freed. With `std.testing.allocator`, test fails with leak detection.

## Impact

- Test failure due to leak detection
- CI blocks on test run

## Fix

```zig
fn createTempFile(allocator: std.mem.Allocator) ![]const u8 {
    const filename = try std.fmt.allocPrint(allocator, "edit_file_test_{d}.txt", .{rand});
    defer allocator.free(filename);  // ADD THIS
    
    return try std.fmt.allocPrint(allocator, "/tmp/{s}", .{filename});
}
```

Or avoid intermediate allocation:
```zig
fn createTempFile(allocator: std.mem.Allocator) ![]const u8 {
    return std.fmt.allocPrint(allocator, "/tmp/edit_file_test_{d}.txt", .{rand});
}
```

## Effort

S (5 min)
