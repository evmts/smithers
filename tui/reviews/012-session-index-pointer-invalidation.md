# Session Index Stores Pointers That Invalidate on Realloc

**Severity:** 🔴 Critical  
**Type:** Memory Safety  
**File:** `src/session/session.zig`

## Problem

```zig
entries: ArrayListUnmanaged(Entry),
index: std.StringHashMapUnmanaged(*Entry),
...
try self.entries.append(...);
const ptr = &self.entries.items[self.entries.items.len - 1];
try self.index.put(..., id, ptr);
```

When `entries` grows and reallocates, **all** previously stored `*Entry` pointers in `index` become dangling.

## Impact

- Use-after-free once entries exceeds initial capacity
- Memory corruption
- Random crashes after ~16+ entries (typical initial capacity)

## Fix

Store indices instead of pointers:

```zig
index: std.StringHashMapUnmanaged(usize),

pub fn addEntry(self: *Self, entry: Entry) !void {
    try self.entries.append(self.allocator, entry);
    const idx = self.entries.items.len - 1;

    if (self.entries.items[idx].getId()) |id| {
        try self.index.put(self.allocator, id, idx);
    }
}

pub fn getEntry(self: *const Self, id: []const u8) ?*Entry {
    if (self.index.get(id)) |idx| {
        return &self.entries.items[idx];
    }
    return null;
}
```

Alternative: allocate each `Entry` separately with `allocator.create(Entry)` if you need stable pointers.

## Effort

S (30 min)
