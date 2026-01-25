# CommandPopup toLowerAlloc Returns Static Empty Slice

**Severity:** 🟢 Low  
**Type:** Memory Safety  
**File:** `src/commands/command_popup.zig#L107-114`

## Problem

```zig
fn toLowerAlloc(self: *Self, str: []const u8) ![]u8 {
    if (str.len == 0) return &[_]u8{};  // Returns static empty slice
    const result = try self.allocator.alloc(u8, str.len);
    // ...
    return result;  // Returns allocated slice
}
```

Returns either:
- Static empty slice (not allocated)
- Allocated slice

Caller uses `defer self.allocator.free(cmd_lower)` which will attempt to free the static slice if str was empty.

## Impact

- Freeing static memory = undefined behavior
- Likely silently ignored by most allocators but technically UB
- Could crash with strict allocators

## Fix

Allocate even for empty:

```zig
fn toLowerAlloc(self: *Self, str: []const u8) ![]u8 {
    const result = try self.allocator.alloc(u8, str.len);
    for (str, 0..) |c, i| {
        result[i] = std.ascii.toLower(c);
    }
    return result;
}
```

Or use sentinel:

```zig
fn toLowerAlloc(self: *Self, str: []const u8) !?[]u8 {
    if (str.len == 0) return null;
    // ...
}

// Caller:
const cmd_lower = self.toLowerAlloc(cmd_name) catch continue;
defer if (cmd_lower) |cl| self.allocator.free(cl);
```

## Effort

S (5 min)
