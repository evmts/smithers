# CLI Prints Portions of API Key

**Severity:** 🟡 Medium  
**Type:** Security  
**File:** `src/cli.zig`

## Problem

```zig
std.debug.print("API key: {s}...{s} (len={d})\n", .{
    key[0..4],
    key[key.len-4..],
    key.len,
});
```

Even partial key output is a secret leak in:
- Terminal scrollback
- Shell history
- Log files
- Screen recordings

## Impact

- Partial key exposure aids brute force
- Key length reveals key type
- Compliance violation (secret logging)

## Fix

Never print any part of secrets:

```zig
std.debug.print("API key: present (set)\n", .{});
// or at most:
std.debug.print("API key: {s} ({d} chars)\n", .{
    if (key.len > 0) "configured" else "missing",
    key.len,  // even this is questionable
});
```

Best practice: only log presence, not content or length.

## Effort

S (5 min)
