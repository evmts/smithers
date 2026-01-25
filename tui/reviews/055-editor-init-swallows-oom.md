# Editor Init Swallows OOM

**Severity:** 🟡 Medium  
**Type:** Error Handling  
**File:** `src/editor/editor.zig#L24-35`

## Problem

```zig
pub fn init(allocator: Allocator) Self {
    var lines = ArrayListUnmanaged(ArrayListUnmanaged(u8)){};
    lines.append(allocator, ArrayListUnmanaged(u8){}) catch {};  // OOM swallowed!

    return .{
        .lines = lines,
        .kill_ring = KillRing.init(allocator),
        .undo_stack = UndoStack.init(allocator),
        .history = InputHistory.init(allocator),
        .allocator = allocator,
    };
}
```

If initial line allocation fails, editor starts with empty `lines` array. Any subsequent operation that assumes at least one line will fail or panic.

## Impact

- Crash on first keystroke after OOM during init
- Hard to diagnose as failure is deferred
- Inconsistent editor state

## Fix

Return error from init:

```zig
pub fn init(allocator: Allocator) !Self {
    var lines = ArrayListUnmanaged(ArrayListUnmanaged(u8)){};
    try lines.append(allocator, ArrayListUnmanaged(u8){});

    return .{
        .lines = lines,
        .kill_ring = KillRing.init(allocator),
        .undo_stack = UndoStack.init(allocator),
        .history = InputHistory.init(allocator),
        .allocator = allocator,
    };
}
```

Update callers to handle error.

## Effort

S (20 min)
