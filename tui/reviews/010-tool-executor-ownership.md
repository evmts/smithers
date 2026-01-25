# ToolExecutor Ownership Contract Unclear

**Severity:** 🟢 Low  
**Type:** Memory Safety  
**File:** `src/agent/tool_executor.zig`

## Problem

Ownership of returned strings is implicit:

```zig
pub fn execute(self: *Self, tool_id: []const u8, tool_name: []const u8, input_json: []const u8) !void {
    // Dupes tool_id, tool_name, input_json for thread
    self.thread_tool_id = try self.alloc.dupe(u8, tool_id);
    self.thread_tool_name = try self.alloc.dupe(u8, tool_name);
    self.thread_input_json = try self.alloc.dupe(u8, input_json);
}

pub fn poll(self: *Self) ?ThreadResult {
    // Returns pointers to duped strings
    return .{
        .tool_id = self.thread_tool_id.?,
        .tool_name = self.thread_tool_name.?,
        // ...
    };
}
```

Caller must free `tool_id` and `tool_name` from result, but this isn't documented or enforced.

## Impact

- Memory leaks if caller forgets to free
- If cancel/deinit happens mid-execution, pending strings may leak

## Fix

1. Document ownership:
```zig
/// Returns result. Caller owns tool_id, tool_name, and must free them.
pub fn poll(self: *Self) ?ThreadResult {
```

2. Add helper:
```zig
pub fn freeResult(self: *Self, result: ThreadResult) void {
    self.alloc.free(result.tool_id);
    self.alloc.free(result.tool_name);
    // content is separate
}
```

3. In deinit, clean up pending:
```zig
pub fn deinit(self: *Self) void {
    if (self.thread_tool_id) |id| self.alloc.free(id);
    if (self.thread_tool_name) |name| self.alloc.free(name);
    if (self.thread_input_json) |json| self.alloc.free(json);
    // ...
}
```

## Effort

S (20 min)
