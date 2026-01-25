# Mock Renderer subRegion Copies ArrayList (Memory Corruption)

**Severity:** 🔴 Critical  
**Type:** Memory Safety (Tests)  
**Files:** Various test mocks

## Problem

```zig
pub fn subRegion(self: MockRenderer, ...) MockRenderer {
    return .{
        .w = w,
        .h = h,
        .draw_calls = self.draw_calls,  // ArrayList copied by value!
    };
}
```

Copying `std.ArrayList` by value creates two independent "views" of the same backing buffer with independent `len/cap` fields.

## Impact

- Appending in sub-renderer updates its `len`, not parent's
- If append triggers reallocation, parent's `items.ptr` becomes stale
- Use-after-free or leaked buffer
- Test flakiness and hard-to-debug allocator issues

## Fix

Store pointers to shared lists:

```zig
const MockRenderer = struct {
    w: u16,
    h: u16,
    draw_calls: *std.ArrayList(DrawCall),  // pointer, not value

    pub fn init(allocator: Allocator, w: u16, h: u16) !struct {
        renderer: MockRenderer,
        draw_calls: std.ArrayList(DrawCall),
    } {
        var dc = std.ArrayList(DrawCall).init(allocator);
        return .{
            .renderer = .{ .w = w, .h = h, .draw_calls = &dc },
            .draw_calls = dc,
        };
    }

    pub fn subRegion(self: MockRenderer, ...) MockRenderer {
        var r = self;
        r.w = w;
        r.h = h;
        return r;  // pointer is copied, not ArrayList
    }
};
```

## Effort

M (1 hour) - affects many test files
