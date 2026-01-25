# ToolExecutor Ownership Contract Unclear + Leaks

**Severity:** 🟡 Medium  
**Type:** Memory Safety  
**File:** `src/agent/tool_executor.zig`

## Problem

### 1. Ownership of returned strings is implicit

```zig
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

### 2. Tool execution output leaks

Builtin tools allocate output using `ctx.allocator` (e.g., `read_file`, `grep`, `glob`).

In `AgentLoop.poll_tool_completion()`:
- `result_content` is **duplicated** into `self.loading.tool_results`
- But the **original `ToolResult.content`** is never freed

This leaks per tool call. For `read_file`/`bash`, that can be large.

## Impact

- Memory leaks proportional to tool calls
- Unbounded memory growth in long sessions
- If cancel/deinit happens mid-execution, pending strings leak

## Fix

### Use arena for each tool execution

```zig
fn threadFn(ctx: ThreadContext) void {
    var arena = std.heap.ArenaAllocator.init(ctx.allocator);
    defer arena.deinit();
    const a = arena.allocator();

    var tool_registry = RegistryFactory.create(a);
    defer tool_registry.deinit();

    const tmp = tool_registry.execute(ctx.tool_name, input_value);

    // Copy outputs to ctx.allocator so they survive arena.deinit()
    const owned = copyToolResult(ctx.allocator, tmp);

    ctx.executor.mutex.lock();
    ctx.executor.result = owned;
    ctx.executor.mutex.unlock();
}
```

### Or explicit cleanup in poll consumer

```zig
// In poll_tool_completion, after duping into tool_results:
if (result.result.content.len > 0) self.alloc.free(result.result.content);
if (result.result.error_message) |e| self.alloc.free(e);
```

### Add deinit cleanup for pending results

```zig
pub fn deinit(self: *Self) void {
    if (self.thread_tool_id) |id| self.alloc.free(id);
    if (self.thread_tool_name) |name| self.alloc.free(name);
    if (self.thread_input_json) |json| self.alloc.free(json);
    if (self.result) |r| {
        if (r.result.content.len > 0) self.alloc.free(r.result.content);
        // etc.
    }
}
```

## Effort

M (1 hour)
