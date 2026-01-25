# scrollUpMessage/scrollDownMessage Can Overflow u16

**Severity:** 🟡 Medium  
**Type:** Overflow  
**File:** `src/components/chat_history.zig`

## Problem

```zig
var cumulative_height: u16 = 0;
...
cumulative_height += msg_height;
```

With enough messages or long content, `u16` overflows.
- Debug/Safe builds: trap (crash)
- ReleaseFast: silent wrap (wrong scroll position)

Also `countLines()` returns `u16` with internal counters that can overflow.

## Impact

- Crash in debug builds with many messages
- Wrong scroll positions in release builds
- Scroll-to-message breaks after ~65k lines

## Fix

Use `usize` internally, clamp when assigning:

```zig
scroll_offset: usize,  // change from u16

pub fn scrollUpMessage(self: *Self, text_width: u16) void {
    var cumulative: usize = 0;
    for (self.messages) |msg| {
        const msg_height = self.getMessageHeight(msg, text_width);
        cumulative += msg_height;
        if (cumulative > self.scroll_offset) {
            self.scroll_offset = cumulative;
            return;
        }
    }
}

// For APIs requiring u16:
fn getScrollOffsetU16(self: *Self) u16 {
    return @intCast(@min(self.scroll_offset, std.math.maxInt(u16)));
}
```

## Effort

S (30 min)
