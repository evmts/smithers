# Selection Negative Coordinate Cast

**Severity:** 🟡 Medium  
**Type:** Input Validation  
**File:** `src/selection.zig#L50-51`

## Problem

```zig
pub fn update(self: *Self, x: u16, y: u16, scroll_offset: u16) void {
    if (self.is_selecting) {
        self.focus_x = x;
        self.focus_y = @as(i32, y) + @as(i32, scroll_offset);
        const anchor_y_u: u16 = if (self.anchor_y >= 0) @intCast(self.anchor_y) else 0;
        const focus_y_u: u16 = if (self.focus_y >= 0) @intCast(self.focus_y) else 0;
        // ...
    }
}
```

`anchor_y` and `focus_y` are `i32` but converted to `u16` via `@intCast`. If values exceed `u16` max (65535), cast panics/truncates.

## Impact

- Panic on very tall content with large scroll offset
- `y + scroll_offset` could exceed u16 max
- Selection breaks on documents > 65535 lines

## Fix

Use `std.math.cast` or clamp:

```zig
const anchor_y_u: u16 = std.math.cast(u16, @max(0, self.anchor_y)) orelse std.math.maxInt(u16);
const focus_y_u: u16 = std.math.cast(u16, @max(0, self.focus_y)) orelse std.math.maxInt(u16);
```

Or keep as i32/i64 throughout selection logic to support large documents.

## Effort

S (15 min)
