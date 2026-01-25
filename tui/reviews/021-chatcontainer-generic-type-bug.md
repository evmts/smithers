# ChatContainer Uses Generic ChatHistory Symbol Incorrectly

**Severity:** 🔴 Critical  
**Type:** Compile Error  
**File:** `src/ui/chat.zig`

## Problem

```zig
const ChatHistory = @import("../components/chat_history.zig").ChatHistory;

pub fn ChatContainer(comptime R: type) type {
    return struct {
        chat_history: *ChatHistory,  // WRONG - ChatHistory is a function, not a type
        ...
    };
}
```

`ChatHistory` is a **generic function** (`pub fn ChatHistory(comptime R: type) type`), not a concrete type.

## Impact

- Compile error
- Cannot build if this code path is used

## Fix

Apply the generic parameter:

```zig
pub fn ChatContainer(comptime R: type) type {
    const ChatHistoryT = @import("../components/chat_history.zig").ChatHistory(R);

    return struct {
        chat_history: *ChatHistoryT,
        title: ?[]const u8 = null,
        show_border: bool = true,

        const Self = @This();

        pub fn init(chat_history: *ChatHistoryT) Self {
            return .{ .chat_history = chat_history };
        }

        // rest unchanged...
    };
}
```

## Effort

S (10 min)
