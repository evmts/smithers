# ToolExecutor Thread Uses Manual Mutex Lock/Unlock

**Severity:** 🟡 Medium  
**Type:** Thread Safety  
**File:** `src/agent/tool_executor.zig#L109-115`

## Problem

```zig
fn threadFn(ctx: ThreadContext) void {
    // ...tool execution...
    
    ctx.executor.mutex.lock();
    ctx.executor.result = .{
        .tool_id = ctx.tool_id,
        .tool_name = ctx.tool_name,
        .result = result,
    };
    ctx.executor.mutex.unlock();  // Manual unlock!
    
    ctx.allocator.free(ctx.input_json);
}
```

If assignment to `ctx.executor.result` panics (unlikely but possible with complex struct), mutex stays locked forever.

## Impact

- Deadlock if thread panics during result write
- Main thread hangs on next poll()
- Similar to 060-agent-thread-mutex-no-defer

## Fix

Use defer:

```zig
fn threadFn(ctx: ThreadContext) void {
    // ...tool execution...
    
    {
        ctx.executor.mutex.lock();
        defer ctx.executor.mutex.unlock();
        
        ctx.executor.result = .{
            .tool_id = ctx.tool_id,
            .tool_name = ctx.tool_name,
            .result = result,
        };
    }
    
    ctx.allocator.free(ctx.input_json);
}
```

## Effort

S (5 min)
