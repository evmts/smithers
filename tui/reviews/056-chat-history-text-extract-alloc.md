# Chat History Text Extraction Swallows Allocation Errors

**Severity:** 🟢 Low  
**Type:** Error Handling  
**File:** `src/components/chat_history.zig#L195-206`

## Problem

```zig
// Extract text from cells
var col: u16 = start_col;
while (col < end_col and col < renderer.width()) : (col += 1) {
    if (win.readCell(col, row)) |cell| {
        if (cell.char.grapheme.len > 0 and cell.char.grapheme[0] != 0) {
            result.appendSlice(self.allocator, cell.char.grapheme) catch {};  // Silent
        }
    }
}

if (row_i32 < bounds.max_y) {
    result.append(self.allocator, '\n') catch {};  // Silent
}
// ...
return result.toOwnedSlice(self.allocator) catch null;
```

Text extraction for copy/selection returns partial or null on allocation failure without indication.

## Impact

- Silent data loss when copying text under memory pressure
- User gets incomplete copy without warning
- Less critical since it's user-facing copy, not core logic

## Fix

Either return error or log:

```zig
result.appendSlice(self.allocator, cell.char.grapheme) catch |err| {
    obs.global.logSimple(.warn, @src(), "chat.copy", "allocation failed");
    return null;  // Early exit, user can retry
};
```

## Effort

S (10 min)
