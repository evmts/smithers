# Database Row Allocations Leak (role, status strings)

**Severity:** 🟡 Medium  
**Type:** Memory Leak  
**File:** `src/db.zig`

## Problem

When using `iterator.nextAlloc()` / `oneAlloc()`, SQLite allocates memory for each TEXT column. The code parses `role` and `status` strings into enums but **never frees** the original strings.

### getMessages()

```zig
while (try iter.nextAlloc(allocator, .{})) |row| {
    const role = Role.fromString(row.role) orelse .user;  // parsed
    const status = MessageStatus.fromString(row.status);   // parsed
    // row.role and row.status are NEVER freed!
    try messages.append(allocator, .{
        .role = role,
        .content = row.content,  // kept
        // ...
    });
}
```

### getNextPendingMessage()

Same pattern - `row.role` and `row.status` leaked.

### getActiveAgentRun()

`row.status` parsed to enum, never freed.

## Impact

- Memory leak proportional to message count
- Grows with every `getMessages()` call
- Significant in long-running sessions

## Fix

Free parsed strings after converting:

```zig
while (try iter.nextAlloc(allocator, .{})) |row| {
    const role = Role.fromString(row.role) orelse .user;
    const status = MessageStatus.fromString(row.status);

    // Free after parsing
    allocator.free(row.role);
    allocator.free(row.status);

    try messages.append(allocator, .{
        .id = row.id,
        .role = role,
        .content = row.content,
        .status = status,
        // ...
    });
}
```

## Effort

S (20 min)
