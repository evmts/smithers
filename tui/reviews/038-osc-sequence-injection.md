# Untrusted String Injection in OSC/CSI Sequences

> **VENDOR ISSUE**: This is in vendored vaxis code (renderer/src/ctlseqs.zig, renderer/src/Vaxis.zig). Cannot fix without forking upstream.

**Severity:** 🟡 Medium  
**Type:** Security  
**File:** `renderer/ctlseqs.zig` (vendored vaxis)

## Problem

Format strings take `{s}` (user-provided bytes):
- `osc2_set_title = "\x1b]2;{s}\x1b\\"`
- `osc8 = "\x1b]8;{s};{s}\x1b\\"`
- `osc9_notify`, `osc777_notify`
- `osc52_clipboard_copy = "\x1b]52;c;{s}\x1b\\"`

If `{s}` contains arbitrary bytes, attacker can inject ESC/BEL/ST terminators and smuggle additional control sequences.

## Impact

- Misleading UI output
- Clipboard manipulation (OSC 52)
- Hyperlink injection (OSC 8)
- Terminal escape sequence injection

## Fix

Provide sanitization layer:

```zig
pub fn sanitizeForOsc(input: []const u8, buf: *[256]u8) []const u8 {
    var i: usize = 0;
    for (input) |c| {
        if (i >= buf.len) break;
        // Strip control characters that can terminate sequences
        if (c == 0x1b or c == 0x07 or c == 0x9c) continue;
        buf[i] = c;
        i += 1;
    }
    return buf[0..i];
}

// Usage
var buf: [256]u8 = undefined;
const safe_title = sanitizeForOsc(user_title, &buf);
try writer.print(osc2_set_title, .{safe_title});
```

For OSC 52, enforce base64 and length limits.

## Effort

M (1 hour)
