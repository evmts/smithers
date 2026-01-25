# Help formatCommands Double Free

**Severity:** 🔴 Critical  
**Type:** Memory Safety  
**File:** `src/help.zig#L120-130`

## Problem

```zig
pub fn formatCommands(allocator: std.mem.Allocator) ![]u8 {
    var result = std.ArrayList(u8).init(allocator);
    defer result.deinit();  // Frees internal buffer!
    
    try result.appendSlice("Available Commands:\n");
    for (COMMANDS) |cmd| {
        try result.writer().print("  {s:<12} {s}\n", .{ cmd.name, cmd.description });
    }
    
    return result.toOwnedSlice();  // Returns buffer, then defer frees it!
}
```

`toOwnedSlice()` transfers ownership to caller, then `defer result.deinit()` runs and frees the same memory. Caller gets a dangling pointer.

## Impact

- Use-after-free when caller uses returned slice
- Double-free when caller tries to free it
- Memory corruption

## Fix

Remove the defer:

```zig
pub fn formatCommands(allocator: std.mem.Allocator) ![]u8 {
    var result = std.ArrayList(u8).init(allocator);
    errdefer result.deinit();  // Only on error path
    
    try result.appendSlice("Available Commands:\n");
    for (COMMANDS) |cmd| {
        try result.writer().print("  {s:<12} {s}\n", .{ cmd.name, cmd.description });
    }
    
    return result.toOwnedSlice();  // Caller owns this now
}
```

## Effort

S (5 min)
