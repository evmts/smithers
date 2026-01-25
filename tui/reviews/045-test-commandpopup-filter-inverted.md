# Test "CommandPopup prefix filter" Logic Inverted

**Severity:** 🟢 Low  
**Type:** Test Quality  
**File:** `src/tests/command_popup_test.zig`

## Problem

```zig
test "consistency: filter matches command prefix only" {
    try popup.setFilter("it");

    for (popup.filtered_commands.items) |item| {
        const cmd_name = item.cmd.command();
        try testing.expect(!std.mem.startsWith(u8, cmd_name, "it"));
    }
}
```

This test:
1. If filtered list is empty, passes trivially (no iterations)
2. If filter is buggy and returns substring matches like `"exit"`, still passes because `"exit"` does NOT start with `"it"`

The assertion is logically inverted from what the test name claims.

## Impact

- Test doesn't validate intended behavior
- Filter bugs go undetected

## Fix

Option A: Assert filtered list is empty (no builtins start with "it"):
```zig
try popup.setFilter("it");
try testing.expectEqual(@as(usize, 0), popup.filtered_commands.items.len);
```

Option B: Assert prefix matches start at index 0:
```zig
try popup.setFilter("mo");  // matches "model"
for (popup.filtered_commands.items) |item| {
    try testing.expectEqual(@as(?usize, 0), item.match_start);
}
```

## Effort

S (10 min)
