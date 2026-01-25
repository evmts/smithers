# Overlay Stack push() Returns Unstable Pointers

**Severity:** 🔴 Critical  
**Type:** Memory Safety  
**File:** `src/overlay/overlay.zig`

## Problem

```zig
pub fn push(self: *Self, ...) !*Entry {
    try self.entries.append(self.allocator, .{ ... });
    return &self.entries.items[self.entries.items.len - 1];
}
```

Returns pointer into `ArrayListUnmanaged` backing buffer. Any subsequent `append()` can reallocate and move the buffer, invalidating **all** previously returned pointers.

## Impact

- Use-after-free when accessing returned `*Entry` after more pushes
- `remove(entry: *Entry)` pointer comparisons fail
- Runtime crashes, memory corruption

## Fix

Heap-allocate entries for stable pointers:

```zig
pub const Stack = struct {
    entries: std.ArrayListUnmanaged(*Entry),  // pointers, not values
    allocator: Allocator,
    
    pub fn push(self: *Self, ...) !*Entry {
        const e = try self.allocator.create(Entry);
        e.* = .{ ... };
        try self.entries.append(self.allocator, e);
        return e;
    }
    
    pub fn pop(self: *Self) ?Entry {
        const e = self.entries.popOrNull() orelse return null;
        const value = e.*;
        self.allocator.destroy(e);
        return value;
    }
    
    pub fn remove(self: *Self, entry: *Entry) bool {
        for (self.entries.items, 0..) |e, i| {
            if (e == entry) {
                _ = self.entries.orderedRemove(i);
                self.allocator.destroy(entry);
                return true;
            }
        }
        return false;
    }
    
    pub fn deinit(self: *Self) void {
        for (self.entries.items) |e| self.allocator.destroy(e);
        self.entries.deinit(self.allocator);
    }
};
```

## Effort

M (1 hour)
