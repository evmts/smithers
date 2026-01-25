# Interactive Mock Uses Timestamp Modulo for Randomness

**Severity:** 🟢 Low  
**Type:** Code Quality  
**File:** `src/modes/interactive.zig#L282`

## Problem

```zig
const idx = @as(usize, @intCast(@mod(std.time.timestamp(), mock_responses.len)));
self.pending_response = try self.allocator.dupe(u8, mock_responses[idx]);
```

Using `timestamp() % N` for "random" selection:
1. Predictable - same response each second
2. If `timestamp()` returns negative (rare but possible), `@mod` differs from `%`
3. `@intCast` to usize on negative result would panic

## Impact

- Low severity: only affects mock/demo mode
- Predictable responses during testing
- Potential panic on systems with negative epoch (unlikely)

## Fix

Use proper PRNG or atomic counter:

```zig
var prng = std.rand.DefaultPrng.init(@intCast(std.time.nanoTimestamp()));
const idx = prng.random().uintLessThan(usize, mock_responses.len);
```

Or simple counter:

```zig
var counter: usize = 0;  // field
const idx = counter;
counter = (counter + 1) % mock_responses.len;
```

## Effort

S (5 min)
