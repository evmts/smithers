# StreamingText Line Wrapping Is Byte-Based Not Width-Based

**Severity:** 🟡 Medium  
**Type:** UI Bug  
**File:** `src/rendering/streaming.zig`

## Problem

```zig
pub fn getDisplayLines(self: *Self, width: u16) ![]DisplayLine {
    // ...
    col += 1;  // per byte, not per display width!
    if (col >= width) {
        // wrap
    }
}
```

Increments `col` by 1 per byte. Breaks on:
- UTF-8 multi-byte characters
- Wide glyphs (CJK, emoji)
- Combining marks
- ANSI escape sequences

## Impact

- Lines wrap at wrong positions
- Wide characters split incorrectly
- ANSI sequences counted as visible width
- Garbled display with non-ASCII text

## Fix

Use existing width calculation infrastructure:

```zig
const width_mod = @import("width.zig");

pub fn getDisplayLines(self: *Self, max_width: u16) ![]DisplayLine {
    // Use grapheme-aware width calculation
    var display_col: u16 = 0;
    var byte_idx: usize = 0;
    
    while (byte_idx < self.text.len) {
        const grapheme = width_mod.nextGrapheme(self.text[byte_idx..]);
        const glyph_width = width_mod.graphemeWidth(grapheme);
        
        if (display_col + glyph_width > max_width) {
            // wrap
            display_col = 0;
        }
        
        display_col += glyph_width;
        byte_idx += grapheme.len;
    }
}
```

Or reuse `wrapTextWithAnsi` from the width module.

## Effort

M (1-2 hours)
