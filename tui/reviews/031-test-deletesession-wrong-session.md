# Test deleteSession Deletes Current Session

**Severity:** 🟢 Low  
**Type:** Test Logic  
**File:** `src/tests/db_test.zig`

## Problem

```zig
const session_to_delete = try database.createSession("temporary");
database.switchSession(session_to_delete);
// ... add messages ...
database.switchSession(database.current_session_id);  // Still session_to_delete!
try database.deleteSession(session_to_delete);
```

`database.current_session_id` is still `session_to_delete` at this point. Not switching away before deleting.

## Impact

- If implementation disallows deleting active session: test fails
- If allowed: test passes but doesn't test intended scenario
- May leave database in inconsistent state

## Fix

```zig
const original = database.getCurrentSessionId();

const session_to_delete = try database.createSession("temporary");
database.switchSession(session_to_delete);
// ... add messages ...

database.switchSession(original);  // Switch BACK first
try database.deleteSession(session_to_delete);

// Verify original session still works
try std.testing.expectEqual(original, database.getCurrentSessionId());
```

## Effort

S (10 min)
