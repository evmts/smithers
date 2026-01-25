# Bash Tool Leaks Child Process on Early Errors

**Severity:** 🟡 Medium  
**Type:** Resource Leak  
**File:** `src/agent/tools/bash.zig#L20-L68`

## Problem

```zig
child.spawn() catch {
    return ToolResult.err("Failed to spawn process");
};

// ... read stdout ...
if (ctx.isCancelled()) {
    _ = child.kill() catch {};
    return ToolResult.err("Cancelled");  // wait() never called!
}

// ... read stderr ...

const result = child.wait() catch {
    return ToolResult.err("Failed to wait for process");  // Child zombie
};
```

If `isCancelled()` returns early or `wait()` fails, child process:
1. May become zombie (no reap)
2. File descriptors leak (stdout/stderr pipes)

## Impact

- Zombie process accumulation over long sessions
- File descriptor exhaustion
- System resource leak

## Fix

Ensure wait() always called with defer:

```zig
child.spawn() catch {
    return ToolResult.err("Failed to spawn process");
};
defer _ = child.wait() catch {};  // Always reap

// ... read stdout ...
if (ctx.isCancelled()) {
    _ = child.kill() catch {};
    // defer will call wait()
    return ToolResult.err("Cancelled");
}
```

Or use errdefer for cleanup on any error path:

```zig
child.spawn() catch {
    return ToolResult.err("Failed to spawn process");
};
errdefer _ = child.kill() catch {};
errdefer _ = child.wait() catch {};
```

## Effort

S (10 min)
