# UAF in Action.start_ai_query Payload

**Severity:** 🔴 Critical  
**Type:** Memory Safety  
**File:** `src/keys/handler.zig#L226-L285`

## Problem

```zig
} else if (try ctx.input.handleEvent(...)) |command| {
    defer self.alloc.free(command);  // freed here
    ...
    return .{ .start_ai_query = command };  // dangling pointer returned
}
```

`command` is freed before the `Action` union is consumed by caller. The union contains a dangling pointer.

## Impact

- Use-after-free when caller accesses payload
- Memory corruption
- Undefined behavior

## Fix

Remove the payload - it's redundant since `loading.pending_query` already stores the query:

```zig
// In Action enum definition
pub const Action = union(enum) {
    none,
    exit,
    suspend_tui,
    redraw,
    reload_chat,
    start_ai_query,  // no payload
};

// In handleKey
return .start_ai_query;  // no payload
```

## Effort

S (15 min)
