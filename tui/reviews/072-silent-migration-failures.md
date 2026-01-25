# Silent Migration Failures

**Severity:** 🟢 Low  
**Type:** Observability  
**File:** `src/db.zig`  
**Status:** ✅ FIXED

## Problem

Schema migrations silently ignored all errors:

```zig
// BEFORE: Swallows ALL errors including permission/corruption
db.exec("ALTER TABLE messages ADD COLUMN tool_name TEXT", .{}, .{}) catch {};
db.exec("ALTER TABLE messages ADD COLUMN tool_input TEXT", .{}, .{}) catch {};
db.exec("ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'sent'", .{}, .{}) catch {};
```

`SQLiteError` is expected for "duplicate column" (idempotent migration), but permission errors, disk full, corruption etc. were also silently ignored.

## Impact

- DB corruption goes unnoticed
- Permission issues silently fail
- Hard to debug why features don't work

## Fix

Log non-SQLiteError errors:

```zig
// AFTER: Log unexpected errors, ignore expected "duplicate column"
db.exec("ALTER TABLE messages ADD COLUMN tool_name TEXT", .{}, .{}) catch |err| {
    if (err != error.SQLiteError) {
        obs.global.logSimple(.err, @src(), "db.migration", @errorName(err));
    }
};
```

## Tests

See `src/tests/thread_safety_test.zig`:
- `Database: init succeeds with in-memory db` (verifies migrations don't fail)

## Commit

`fix(tui): address all review issues - thread safety, crash recovery, lock discipline`
