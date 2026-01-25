# Grep Tool Missing Child Wait on Fallback Path

**Severity:** 🟡 Medium  
**Type:** Resource Leak  
**File:** `src/agent/tools/grep.zig#L40-L56`

## Problem

```zig
child.spawn() catch {
    // Fall back to basic grep
    return executeBasicGrep(ctx, pattern, search_path);
};

// ... read stdout ...

const result = child.wait() catch {
    return ToolResult.err("Failed to wait for ripgrep");  // Child zombie
};
```

If `child.wait()` fails, child process becomes zombie. Additionally, no `defer` ensures cleanup on all paths.

## Impact

- Zombie processes accumulate
- File descriptor leak for pipes
- Similar to 051-bash-child-process-leak

## Fix

```zig
child.spawn() catch {
    return executeBasicGrep(ctx, pattern, search_path);
};
defer _ = child.wait() catch {};  // Always reap

// ... rest of function, can early return safely ...
```

## Effort

S (5 min)
