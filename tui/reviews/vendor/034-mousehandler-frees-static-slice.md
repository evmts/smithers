# MouseHandler Frees Non-Owned Static Slice

> **VENDOR ISSUE**: This is in vendored vaxis code (renderer/src/vxfw/App.zig). Cannot fix without forking upstream.

**Severity:** 🔴 Critical  
**Type:** Memory Safety  
**File:** `renderer/MouseHandler.zig` (vendored vaxis)

## Problem

```zig
pub fn init() MouseHandler {
    return .{
        last_hit_list: []vxfw.HitResult = &.{},  // static empty slice
        ...
    };
}

fn updateMouse(self: *Self, ...) void {
    app.allocator.free(self.last_hit_list);  // freeing static memory!
    ...
}

pub fn deinit(self: *Self) void {
    gpa.free(self.last_hit_list);  // also freeing static memory!
}
```

Initial `last_hit_list` is `&.{}` (static empty slice). Calling `free()` on it is allocator misuse.

## Impact

- Allocator corruption
- Crash in debug allocators
- Undefined behavior

## Fix

Track ownership explicitly:

```zig
last_hit_list: []vxfw.HitResult = &.{},
last_hit_list_owned: bool = false,

fn updateMouse(self: *Self, ...) void {
    if (self.last_hit_list_owned) {
        app.allocator.free(self.last_hit_list);
    }
    self.last_hit_list = try app.allocator.dupe(...);
    self.last_hit_list_owned = true;
}

pub fn deinit(self: *Self) void {
    if (self.last_hit_list_owned) {
        gpa.free(self.last_hit_list);
    }
}
```

## Effort

S (20 min)
