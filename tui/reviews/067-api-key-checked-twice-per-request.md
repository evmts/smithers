# API Key Checked Twice Per Request

**Severity:** 🟢 Low  
**Type:** Code Quality  
**Files:** `src/agent/loop.zig#L133,L198`, `src/agent/anthropic_provider.zig#L84,L120,L313`

## Problem

API key is fetched from environment multiple times:

1. `loop.zig:133` - `start_query_stream` checks for key
2. `loop.zig:198` - `start_continuation_stream` checks again
3. `anthropic_provider.zig:84,120,313` - Each method checks again

```zig
// In loop.zig
const api_key = std.posix.getenv("ANTHROPIC_API_KEY") orelse {
    _ = try database.addMessage(.system, "Error: ANTHROPIC_API_KEY not set");
    // ...
};

// Then passed to provider, which ALSO checks:
const api_key = self.api_key orelse std.posix.getenv("ANTHROPIC_API_KEY") orelse {
    // ...
};
```

## Impact

- Redundant environment lookups (minor perf)
- Inconsistent error messages between loop and provider
- If key changes during session, behavior is undefined

## Fix

Check once at startup and cache:

```zig
// In AgentLoop.init or App.init
const api_key = std.posix.getenv("ANTHROPIC_API_KEY") orelse {
    return error.MissingApiKey;
};
self.api_key = api_key;
```

Or validate in provider only:

```zig
// loop.zig - don't check, let provider handle
self.streaming = ProviderApi.startStream(self.alloc, request_body) catch |err| {
    if (err == error.MissingApiKey) {
        _ = try database.addMessage(.system, "Error: ANTHROPIC_API_KEY not set");
    }
    // ...
};
```

## Effort

S (20 min)
