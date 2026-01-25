# Markdown Parser Drops Unmatched Markers

**Severity:** 🟢 Low  
**Type:** Data Loss  
**File:** `src/markdown/parser.zig`

## Problem

In `parseInlineContent`, the parser flushes preceding text before verifying a closing marker exists. If no closing marker is found, the opening marker is skipped and not emitted as literal text.

```zig
// Sees `**` marker
// Flushes text before it
// Looks for closing `**`
// If not found: marker is lost, not added to output
```

## Impact

- Malformed markdown loses characters silently
- `"This is **bold"` becomes `"This is bold"` (missing `**`)
- AI output and user input often contain malformed markdown

## Fix

Only commit to style run after finding closing marker. Otherwise treat marker as normal text:

```zig
fn parseInlineContent(self: *Self, text: []const u8) !void {
    var i: usize = 0;
    while (i < text.len) {
        if (self.tryParseMarker(text, i)) |marker| {
            if (self.findClosingMarker(text, i + marker.len, marker.type)) |close_idx| {
                // Emit preceding text
                try self.emitText(text[self.start..i]);
                // Emit styled content
                try self.emitStyled(text[i + marker.len .. close_idx], marker.style);
                i = close_idx + marker.len;
                self.start = i;
                continue;
            }
        }
        // No valid marker or no closing - treat as normal text
        i += 1;
    }
    // Emit remaining text including any unmatched markers
    try self.emitText(text[self.start..]);
}
```

## Effort

M (1 hour)
