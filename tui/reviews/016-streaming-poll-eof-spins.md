# StreamingState.poll() EOF Handling Can Spin Forever

**Severity:** 🟡 Medium  
**Type:** Logic Bug  
**File:** `src/streaming.zig#L61-L88`

## Problem

```zig
if (bytes_read == 0) {
    if (self.is_done) return true;
    return false;  // keeps polling forever!
}
```

If the stream ends without `[DONE]` (network error, curl exit, server close), this becomes a **busy loop that never completes**.

## Impact

- 100% CPU usage on one core
- Agent thread never finishes
- UI shows loading forever
- Only escape via cancel or app restart

## Fix

Treat EOF as terminal:

```zig
if (bytes_read == 0) {
    // Process any remaining partial line
    if (self.line_pos > 0) {
        const line = self.line_buffer[0..self.line_pos];
        try self.processLine(line);
        self.line_pos = 0;
    }
    
    // EOF means we're done, even without [DONE]
    self.is_done = true;
    if (self.stop_reason == null) {
        self.stop_reason = self.alloc.dupe(u8, "eof") catch null;
    }
    return true;
}
```

Ideally also check child process status:
```zig
if (self.child) |*child| {
    const status = child.wait() catch null;
    if (status != null) {
        self.is_done = true;
        return true;
    }
}
```

## Effort

S (20 min)
