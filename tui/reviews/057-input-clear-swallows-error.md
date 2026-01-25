# Input Clear Swallows Error

**Severity:** 🟢 Low  
**Type:** Error Handling  
**File:** `src/components/input.zig#L239-241`

## Problem

```zig
pub fn clear(self: *Self) void {
    self.editor.clear() catch {};
}
```

If `editor.clear()` fails, input remains in inconsistent state but caller thinks it succeeded.

## Impact

- User types new message but old text remains
- Confusing UX but not critical
- Low severity since clear is unlikely to fail

## Related

Check if `editor.clear()` can actually fail. If not, signature should be `void` not `!void`.

## Fix

If clear can fail, propagate:

```zig
pub fn clear(self: *Self) !void {
    try self.editor.clear();
}
```

Or if clear shouldn't fail, fix the editor:

```zig
// editor.zig
pub fn clear(self: *Self) void {  // Not !void
    for (self.lines.items) |*line| {
        line.clearRetainingCapacity();  // Never fails
    }
    // ...
}
```

## Effort

S (10 min)
