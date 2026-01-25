# List Dir Tool Swallows All Allocation Errors

**Severity:** 🟡 Medium  
**Type:** Error Handling  
**File:** `src/agent/tools/list_dir.zig#L63-74`

## Problem

```zig
for (entries.items) |entry| {
    // Indent based on depth
    var i: usize = 0;
    while (i < entry.indent) : (i += 1) {
        output.appendSlice(ctx.allocator, "  ") catch {};  // Silent
    }
    
    output.appendSlice(ctx.allocator, entry.name) catch {};  // Silent
    
    switch (entry.kind) {
        .directory => output.append(ctx.allocator, '/') catch {},  // Silent
        .sym_link => output.append(ctx.allocator, '@') catch {},   // Silent
        else => {},
    }
    
    output.append(ctx.allocator, '\n') catch {};  // Silent
}
```

If OOM during output formatting, returns partial/empty results as success.

## Impact

- Silent data loss
- Misleading results under memory pressure
- Same issue pattern as bash and grep tools

## Fix

Use errdefer and propagate errors:

```zig
fn executeListDir(ctx: ToolContext) ToolResult {
    var output = std.ArrayListUnmanaged(u8){};
    errdefer output.deinit(ctx.allocator);
    
    for (entries.items) |entry| {
        output.appendSlice(ctx.allocator, entry.name) catch {
            return ToolResult.err("Out of memory");
        };
        // ...
    }
}
```

## Effort

S (20 min)
