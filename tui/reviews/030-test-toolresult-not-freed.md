# Test ToolResult Memory Not Freed

**Severity:** 🟡 Medium  
**Type:** Test Leak  
**File:** `src/tests/edit_file_test.zig`

## Problem

In bash tool tests, `ToolResult.content` and `error_message` are freed:
```zig
defer if (result.content.len > 0) allocator.free(result.content);
defer if (result.error_message) |e| allocator.free(e);
```

But edit_file tests do **no cleanup** of tool results.

## Impact

- Test failure due to leak detection
- Inconsistent test patterns
- Real leaks if pattern copied to production

## Fix

Add cleanup to edit_file tests:
```zig
const result = edit_file.tool.execute_ctx(value, &ctx);
defer {
    if (result.content.len > 0) allocator.free(result.content);
    if (result.error_message) |e| allocator.free(e);
    if (result.full_output_path) |p| allocator.free(p);
}
```

Better: Add `ToolResult.deinit()` to tool registry and use consistently:
```zig
pub const ToolResult = struct {
    // fields...
    
    pub fn deinit(self: *ToolResult, allocator: std.mem.Allocator) void {
        if (self.content.len > 0) allocator.free(self.content);
        if (self.error_message) |e| allocator.free(e);
        if (self.full_output_path) |p| allocator.free(p);
    }
};
```

## Effort

S (20 min)
