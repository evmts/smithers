# Anthropic Provider Doesn't Kill Child on Read Error

**Severity:** 🟡 Medium  
**Type:** Resource Leak  
**File:** `src/agent/anthropic_provider.zig#L166-206`

## Problem

```zig
try child.spawn();

// ...read loop...
while (reader.readUntilDelimiterOrEof(&line_buf, '\n') catch null) |line| {
    // Process SSE events...
}

_ = child.wait() catch {};  // Wait but no kill
```

If the read loop exits early (due to error, break, or `[DONE]`), the child process (curl) continues running until it naturally terminates. There's no explicit kill.

If `readUntilDelimiterOrEof` returns an error (caught as null), loop exits but curl may still be writing to pipe. With no reader, pipe fills up and curl blocks forever → zombie-ish process.

## Impact

- Hung curl processes accumulate
- Resource exhaustion over long sessions
- Pipe buffer fills causing deadlock

## Fix

Add explicit kill on early exit:

```zig
try child.spawn();
errdefer _ = child.kill() catch {};
defer _ = child.wait() catch {};

while (reader.readUntilDelimiterOrEof(&line_buf, '\n') catch null) |line| {
    if (std.mem.eql(u8, data, "[DONE]")) {
        break;  // Normal exit, wait will clean up
    }
    // ...
}
```

Or always kill before wait:

```zig
defer {
    _ = child.kill() catch {};
    _ = child.wait() catch {};
}
```

## Effort

S (10 min)
