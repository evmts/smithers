# CommandPopup Filter Init With Static Slice

**Severity:** 🟢 Low  
**Type:** Memory Safety  
**File:** `src/commands/command_popup.zig#L37, L45-48`

## Problem

```zig
pub fn init(allocator: std.mem.Allocator) Self {
    var self = Self{
        // ...
        .filter = &[_]u8{},  // Static empty slice
        // ...
    };
}

pub fn deinit(self: *Self) void {
    if (self.filter.len > 0) {  // Check prevents freeing static
        self.allocator.free(self.filter);
    }
}
```

`filter` starts as static slice. The `len > 0` check in deinit prevents freeing it. However:

1. If `setFilter("")` is called, it might allocate empty slice
2. Inconsistent ownership: sometimes static, sometimes allocated

## Impact

- Currently safe due to length check
- Fragile: any change to setFilter could break invariant
- Same pattern as 069

## Fix

Always use allocated slices:

```zig
pub fn init(allocator: std.mem.Allocator) !Self {
    return Self{
        // ...
        .filter = try allocator.alloc(u8, 0),  // Empty but allocated
        // ...
    };
}

pub fn deinit(self: *Self) void {
    self.allocator.free(self.filter);  // Always safe
    self.filtered_commands.deinit(self.allocator);
}
```

Or use optional:

```zig
.filter: ?[]u8 = null,

pub fn deinit(self: *Self) void {
    if (self.filter) |f| self.allocator.free(f);
}
```

## Effort

S (10 min)
