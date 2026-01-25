# Unchecked @intCast on External Input

**Severity:** 🟡 Medium  
**Type:** Input Validation  
**Files:** `src/agent/tools/list_dir.zig#L14`, `src/agent/tools/read_file.zig#L20-21`

## Problem

```zig
// list_dir.zig:14
const depth = @as(usize, @intCast(@max(1, @min(MAX_DEPTH, ctx.getInt("depth") orelse DEFAULT_DEPTH))));

// read_file.zig:20-21
const offset = @as(usize, @intCast(ctx.getInt("offset") orelse 0));
const limit = @as(usize, @intCast(ctx.getInt("limit") orelse DEFAULT_LIMIT));
```

`ctx.getInt()` returns `i64`. If negative values are passed:
- `@intCast` to `usize` will panic or wrap in release mode
- `@max(1, ...)` only helps for `depth`, not for `offset`/`limit`

## Impact

- Panic on negative input from malicious/buggy LLM
- Potential wraparound to huge values causing DoS
- Undefined behavior in release mode

## Fix

Validate before cast:

```zig
// read_file.zig
const raw_offset = ctx.getInt("offset") orelse 0;
const offset: usize = if (raw_offset < 0) 0 else @intCast(raw_offset);

const raw_limit = ctx.getInt("limit") orelse @as(i64, DEFAULT_LIMIT);
const limit: usize = if (raw_limit <= 0) DEFAULT_LIMIT else @intCast(@min(raw_limit, MAX_LIMIT));
```

Or use `std.math.cast`:

```zig
const offset = std.math.cast(usize, ctx.getInt("offset") orelse 0) orelse 0;
```

## Effort

S (15 min)
