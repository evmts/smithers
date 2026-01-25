# Test "anthropic_provider exports" Doesn't Assert

**Severity:** 🟢 Low  
**Type:** Test Quality  
**File:** `src/tests/anthropic_provider_test.zig`

## Problem

```zig
test "anthropic_provider exports expected types" {
    const has_streaming = @hasDecl(anthropic, "StreamingState") or
        @hasDecl(anthropic, "AnthropicStreamingState") or
        @hasDecl(anthropic, "startStream");

    _ = has_streaming;  // Discarded! No assertion!
}
```

Computes `has_streaming` then discards it. Test passes even if none of those decls exist.

## Impact

- False confidence in test coverage
- Regressions not caught

## Fix

Actually assert:

```zig
test "anthropic_provider exports expected types" {
    const has_streaming = @hasDecl(anthropic, "StreamingState") or
        @hasDecl(anthropic, "AnthropicStreamingState") or
        @hasDecl(anthropic, "startStream");

    try std.testing.expect(has_streaming);
}
```

Or rename to indicate it's a smoke test:
```zig
test "anthropic_provider module compiles" {
    _ = anthropic;  // just verify import works
}
```

## Effort

S (5 min)
