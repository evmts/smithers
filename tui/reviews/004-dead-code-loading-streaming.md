# Dead Code: LoadingState.streaming Field

**Severity:** 🟡 Medium  
**Type:** Dead Code  
**File:** `src/loading.zig#L29`

## Problem

```zig
pub fn LoadingState(comptime Clk: type, comptime ToolExec: type) type {
    return struct {
        // ...
        streaming: ?streaming.StreamingState = null,  // UNUSED
```

There are two streaming states:
1. `LoadingState.streaming` - appears unused
2. `AgentLoop.streaming` - actually used for API calls

The cleanup() method handles `loading.streaming` but it's never set.

## Impact

- Confusion about which streaming state is authoritative
- Wasted memory
- Maintenance burden

## Fix

Delete the field and remove streaming.zig import from loading.zig:

```zig
// loading.zig - DELETE these:
// const streaming = @import("streaming.zig");
// streaming: ?streaming.StreamingState = null,

// In cleanup() - DELETE:
// if (self.streaming) |*s| s.cleanup();
// self.streaming = null;
```

## Related

Also unify duplicate `ToolCallInfo` structs:
- `streaming.zig:3` 
- `provider_interface.zig:10`

Pick one (prefer provider_interface) and reuse.

## Effort

S (15 min)
