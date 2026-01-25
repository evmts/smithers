# Height Calculation Mismatch for Tool Results

**Severity:** 🟡 Medium  
**Type:** UI Bug  
**File:** `src/components/chat_history.zig`

## Problem

For tool results, rendering uses:
```zig
self.drawCodeWithLineNumbers(...)
```
This **truncates** each line (no wrapping).

But height calculation uses:
```zig
return countLines(msg.content, text_width);
```
This **assumes wrapping** (increments when `col >= width`).

Height is **overestimated** for code/tool results.

## Impact

- Scrolling boundaries wrong
- Messages "jump" when scrolling
- Scroll-to-message lands at wrong position
- Visual glitches during streaming

## Fix

For code/tool results, count newlines only:

```zig
fn countNewlineLines(text: []const u8) usize {
    return 1 + std.mem.count(u8, text, "\n");
}

fn getMessageHeight(self: *Self, msg: Message, text_width: u16) usize {
    if (msg.tool_name != null) {
        // Tool results use code rendering (no wrap)
        return countNewlineLines(msg.content) + 2;  // +2 for header/padding
    }
    // Regular messages wrap
    return countLines(msg.content, text_width) + 1;
}
```

Or change `drawCodeWithLineNumbers` to wrap (harder, requires matching algorithm).

## Effort

S (20 min)
