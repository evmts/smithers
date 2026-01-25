# Memory Leaks in streaming.zig

**Severity:** 🟡 Medium  
**Type:** Memory Safety  
**File:** `src/streaming.zig#L107-L135`

## Problem 1: stop_reason Overwritten Without Free

```zig
if (std.mem.eql(u8, event_type, "message_delta")) {
    if (delta.object.get("stop_reason")) |sr| {
        if (sr == .string) {
            self.stop_reason = self.alloc.dupe(u8, sr.string) catch null;
            // Previous stop_reason leaked!
        }
    }
}
```

Each `message_delta` event with `stop_reason` allocates new memory without freeing the old value.

## Problem 2: Tool ID/Name Overwritten

```zig
if (std.mem.eql(u8, event_type, "content_block_start")) {
    // ...
    self.current_tool_id = self.alloc.dupe(u8, id.string) catch null;
    // Previous current_tool_id leaked if protocol misbehaves!
```

If the protocol sends multiple `content_block_start` without `content_block_stop`, the old values leak.

## Fix

Free before reassigning:

```zig
// For stop_reason
if (sr == .string) {
    if (self.stop_reason) |old| self.alloc.free(old);
    self.stop_reason = self.alloc.dupe(u8, sr.string) catch null;
}

// For tool fields
if (self.current_tool_id) |old| self.alloc.free(old);
self.current_tool_id = self.alloc.dupe(u8, id.string) catch null;
```

## Effort

S (20 min)
