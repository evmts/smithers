# Session Parse Silently Skips Malformed Entries

**Severity:** 🟡 Medium  
**Type:** Error Handling  
**File:** `src/session/session.zig#L302`

## Problem

```zig
while (lines.next()) |line| {
    if (line.len == 0) continue;
    
    const entry = self.parseEntry(line) catch continue;  // Silent skip!
    
    if (entry) |e| {
        // ...
    }
}
```

Any parse error causes entry to be silently dropped. No warning, no counter, no recovery.

## Impact

- Session corruption goes unnoticed
- User loses messages/context without knowing
- Debugging session issues nearly impossible

## Fix

Log and count parse failures:

```zig
var parse_errors: usize = 0;

while (lines.next()) |line| {
    if (line.len == 0) continue;
    
    const entry = self.parseEntry(line) catch |err| {
        parse_errors += 1;
        obs.global.logSimple(.warn, @src(), "session.parse", 
            std.fmt.allocPrint(self.allocator, 
                "Failed to parse entry: {s}", .{@errorName(err)}) catch "parse error");
        continue;
    };
    // ...
}

if (parse_errors > 0) {
    obs.global.logSimple(.warn, @src(), "session.load", 
        std.fmt.allocPrint(self.allocator,
            "Skipped {d} malformed entries", .{parse_errors}) catch "skipped entries");
}
```

Consider also returning parse_errors count to caller for UI display.

## Effort

S (20 min)
