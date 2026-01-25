# Chat History Parses Markdown Twice

**Severity:** 🟢 Low  
**Type:** Performance  
**File:** `src/components/chat_history.zig#L387, L542`

## Problem

When rendering messages and calculating heights, markdown is parsed twice:

1. `drawAssistantMessage` calls `parser.parse()` at line ~387
2. `getMessageHeight` also calls `parser.parse()` at line ~539-542

Both parse the same content independently.

```zig
// In getMessageHeight (line 538-543)
var parser = md.MarkdownParser.init(self.allocator);
var result = parser.parse(trimmed) catch {
    return countLines(msg.content, text_width);
};
defer result.deinit();
return @intCast(result.lines.len);

// In drawAssistantMessage (line 386-387) 
} catch {
    // ... error handling
};
defer result.deinit();
```

## Impact

- Wasted CPU cycles parsing same content twice
- Temporary allocations doubled
- Slower rendering for long messages

## Fix

Cache parsed markdown result per message:

```zig
const CachedParse = struct {
    msg_id: i64,
    result: md.ParseResult,
};

cached_parse: ?CachedParse = null,

fn getParsedMarkdown(self: *Self, msg: Message) ?md.ParseResult {
    if (self.cached_parse) |c| {
        if (c.msg_id == msg.id) return c.result;
        c.result.deinit();
    }
    
    var parser = md.MarkdownParser.init(self.allocator);
    const result = parser.parse(msg.content) catch return null;
    self.cached_parse = .{ .msg_id = msg.id, .result = result };
    return result;
}
```

Or compute height during draw and store it.

## Effort

M (30 min)
