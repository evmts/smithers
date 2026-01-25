# Bash Tool Swallows Allocation Failures

**Severity:** 🟡 Medium  
**Type:** Error Handling  
**File:** `src/agent/tools/bash.zig#L49-L111`

## Problem

Multiple `catch {}` on allocation-sensitive operations:

```zig
stdout_list.appendSlice(ctx.allocator, buf[0..n]) catch {};  // L49
combined.appendSlice(ctx.allocator, stdout_list.items) catch {};  // L73
combined.appendSlice(ctx.allocator, "\n--- stderr ---\n") catch {};  // L76
combined.appendSlice(ctx.allocator, stderr_list.items) catch {};  // L78
output.appendSlice(ctx.allocator, trunc_result.content) catch {};  // L93, L107
output.appendSlice(ctx.allocator, notice) catch {};  // L100, L110
```

If OOM occurs mid-collection, partial/empty output is returned as "success".

## Impact

- Silent data loss during memory pressure
- Misleading tool results (truncated output looks like command produced less)
- Hard to debug in production

## Fix

Propagate errors or return explicit failure:

```zig
fn executeBash(ctx: ToolContext) ToolResult {
    // ...
    stdout_list.appendSlice(ctx.allocator, buf[0..n]) catch |err| {
        return ToolResult.err("Out of memory collecting output");
    };
    // ...
}
```

Or use arena for simpler cleanup:

```zig
fn executeBash(ctx: ToolContext) ToolResult {
    var arena = std.heap.ArenaAllocator.init(ctx.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    
    // All allocations use arena, single failure path
    // ...
}
```

## Effort

S (30 min)
