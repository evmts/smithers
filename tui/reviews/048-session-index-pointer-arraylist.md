# Session Index Stores Dangling Pointers on ArrayList Realloc

**Severity:** 🔴 Critical  
**Type:** Memory Safety  
**File:** `src/session/session.zig#L166-L172`

## Problem

```zig
pub fn addEntry(self: *Self, entry: Entry) !void {
    try self.entries.append(self.allocator, entry);  // May realloc!
    const ptr = &self.entries.items[self.entries.items.len - 1];
    
    if (ptr.getId()) |id| {
        try self.index.put(self.allocator, id, ptr);  // Stores pointer
    }
    // ...
}
```

When `entries` ArrayList reallocates, all existing pointers in `self.index` become dangling. Same issue in parse function at line 309-311.

## Impact

- Use-after-free when looking up entries by ID
- Random crashes after session grows past initial capacity
- Data corruption

## Fix

**Option A: Store indices instead of pointers**

```zig
index: std.StringHashMapUnmanaged(usize),  // Store index, not pointer

pub fn addEntry(self: *Self, entry: Entry) !void {
    const idx = self.entries.items.len;
    try self.entries.append(self.allocator, entry);
    
    if (self.entries.items[idx].getId()) |id| {
        try self.index.put(self.allocator, id, idx);
    }
}

pub fn getEntry(self: *const Self, id: []const u8) ?*Entry {
    const idx = self.index.get(id) orelse return null;
    return &self.entries.items[idx];
}
```

**Option B: Pre-allocate and never realloc**

```zig
pub fn init(allocator: Allocator) !Self {
    var entries = ArrayListUnmanaged(Entry){};
    try entries.ensureTotalCapacity(allocator, 10000);  // Fixed max
    // ...
}
```

## Effort

M (1 hour) for Option A
