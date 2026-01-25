# JSON Logging Not Valid When Messages Contain Quotes/Newlines

**Severity:** 🟢 Low  
**Type:** Observability  
**File:** `src/obs.zig`

## Problem

`escapeJson()` currently returns input unchanged:

```zig
fn escapeJson(input: []const u8) []const u8 {
    return input;  // NOT ESCAPED!
}
```

JSON Lines output is malformed when:
- `msg` contains `"` or `\`
- `msg` contains newlines
- `msg` contains control characters

## Impact

- Log parsers fail on malformed JSON
- Ring buffer dumps are unparseable
- Debug tooling breaks
- Log aggregation fails

## Fix

Implement real escaping into bounded buffer:

```zig
fn escapeJson(input: []const u8, buf: *[512]u8) []const u8 {
    var i: usize = 0;
    for (input) |c| {
        if (i + 2 >= buf.len) break;
        switch (c) {
            '"' => { buf[i] = '\\'; buf[i+1] = '"'; i += 2; },
            '\\' => { buf[i] = '\\'; buf[i+1] = '\\'; i += 2; },
            '\n' => { buf[i] = '\\'; buf[i+1] = 'n'; i += 2; },
            '\r' => { buf[i] = '\\'; buf[i+1] = 'r'; i += 2; },
            '\t' => { buf[i] = '\\'; buf[i+1] = 't'; i += 2; },
            else => { buf[i] = c; i += 1; },
        }
    }
    return buf[0..i];
}
```

Or use `std.json.stringify` into a writer.

## Effort

S (20 min)
