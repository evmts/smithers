# Non-Threaded Agent Path Has UAF for Tool Calls

**Severity:** 🟡 Medium  
**Type:** Memory Safety  
**File:** `src/agent/agent.zig`

## Problem

In `agent.zig`:
1. `AgentResponse.addToolCall()` duplicates `id/name/arguments` into `AgentResponse.tool_calls`
2. `tc_slice` for context message uses those slices
3. `AgentResponse.deinit()` frees `tc.id`, `tc.name`, `tc.arguments`

After `AgentResponse.deinit()`, the `Context` contains tool call slices pointing to **freed memory**.

## Impact

- Use-after-free if non-threaded agent path is used
- Currently may not be hit if only threaded path is used
- Landmine for future refactoring

## Fix

Deep-copy tool call strings into Context messages:

```zig
pub fn addToolUseMessage(self: *Self, tool_calls: []const ToolCall) !void {
    var content_parts = std.ArrayList(ContentPart).init(self.allocator);
    
    for (tool_calls) |tc| {
        try content_parts.append(.{
            .tool_use = .{
                .id = try self.allocator.dupe(u8, tc.id),
                .name = try self.allocator.dupe(u8, tc.name),
                .input = try self.allocator.dupe(u8, tc.arguments),
            },
        });
    }
    // ...
}
```

Or change ownership so Context owns them and AgentResponse doesn't free.

## Effort

M (1 hour)
