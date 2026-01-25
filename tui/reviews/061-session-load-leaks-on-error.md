# Session Load Leaks on MissingHeader Error

**Severity:** 🟡 Medium  
**Type:** Memory Leak  
**File:** `src/session/session.zig#L296-318`

## Problem

```zig
var header: ?SessionHeader = null;
var entries = ArrayListUnmanaged(Entry){};
var index = std.StringHashMapUnmanaged(*Entry){};

while (lines.next()) |line| {
    // ... populate entries and index ...
}

if (header == null) {
    return error.MissingHeader;  // entries and index LEAKED!
}
```

If session file lacks header, allocated entries and index are never freed.

## Impact

- Memory leak proportional to file size
- Can be triggered by corrupted session files
- Repeated load attempts accumulate leaked memory

## Fix

Use errdefer for cleanup:

```zig
var entries = ArrayListUnmanaged(Entry){};
errdefer {
    for (entries.items) |*e| e.deinit(self.allocator);
    entries.deinit(self.allocator);
}

var index = std.StringHashMapUnmanaged(*Entry){};
errdefer index.deinit(self.allocator);

while (lines.next()) |line| {
    // ...
}

if (header == null) {
    return error.MissingHeader;  // errdefer cleans up
}
```

## Effort

S (15 min)
