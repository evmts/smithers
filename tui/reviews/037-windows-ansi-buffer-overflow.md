# Windows Escape Sequence Buffer Overflow

**Severity:** 🟡 Medium  
**Type:** Memory Safety  
**File:** `renderer/WindowsTty.zig` (vendored vaxis)

## Problem

```zig
fn eventFromRecord(state: *State, event: INPUT_RECORD) !?Event {
    state.ansi_buf[state.ansi_idx] = event.uChar.AsciiChar;
    state.ansi_idx += 1;
    // No bounds check on ansi_idx vs ansi_buf.len (128)!
    const result = try parser.parse(state.ansi_buf[0..state.ansi_idx], ...);
}
```

No bounds check on `ansi_idx` relative to `ansi_buf.len`. A long or malformed sequence can overrun the buffer.

## Impact

- Buffer overflow
- Memory corruption
- Potential security issue from malicious input

## Fix

Add bounds check and reset:

```zig
fn eventFromRecord(state: *State, event: INPUT_RECORD) !?Event {
    if (state.ansi_idx >= state.ansi_buf.len) {
        state.ansi_idx = 0;  // reset on overflow
        return null;
    }
    state.ansi_buf[state.ansi_idx] = event.uChar.AsciiChar;
    state.ansi_idx += 1;
    
    const result = try parser.parse(state.ansi_buf[0..state.ansi_idx], ...);
    // Also reset on invalid input, not just incomplete
}
```

## Effort

S (15 min)
