# Review Followup Fixes

**Date:** 2026-01-25  
**Type:** Code Review Followup  
**Status:** ✅ FIXED

## Summary

After initial fixes for 8 thread safety and crash recovery issues, Oracle review identified 3 additional problems:

## Issue A: Debounce Drops Final Reload

**Severity:** 🟡 Medium  
**Problem:** `consumeStateChanged()` uses `swap(false)` which clears the flag even when reload is throttled, causing the final UI update to be lost.

**Fix:** Split into non-destructive `hasStateChanged()` + explicit `clearStateChanged()`. Flag is only cleared after successful reload.

```diff
-if (self.agent_thread.consumeStateChanged()) {
+if (self.agent_thread.hasStateChanged()) {
     if (should_reload) {
         self.chat_history.reload(&self.database);
+        self.agent_thread.clearStateChanged();  // Only clear on success
     }
 }
```

**Files:** `agent_thread.zig`, `app.zig`

## Issue B: Continuation Failure Leaves Stuck Status

**Severity:** 🟡 Medium  
**Problem:** If continuation stream fails to start (API key missing, network error), `agent_runs` row stays in `.continuing` status forever.

**Fix:** Mark agent run as failed before cleanup in all error paths:

```zig
if (self.loading.agent_run_id) |rid| {
    database.failAgentRun(rid) catch {};
}
self.loading.cleanup(self.alloc);
```

**Files:** `agent/loop.zig`

## Issue C: Scratch Arena UAF Risk (Non-Issue)

**Reviewed:** Provider already copies `request_body` synchronously via `alloc.dupe(u8, request_body)` in `startStream()`. No fix needed.

**Verified in:** `anthropic_provider.zig:759`

## Pre-existing Build Issue

Fixed missing `buildEditDetailsJson` function in `edit_diff.zig` that was blocking test compilation (unrelated to thread safety work).

## Tests Added

Added 9 new tests to `thread_safety_test.zig`:
- `AgentThread pattern: hasStateChanged is non-destructive`
- `AgentThread pattern: clearStateChanged clears flag`
- `Debounce: throttled check doesn't lose update`
- `AgentRunStatus: error_state exists for failed runs`
- `AgentRunStatus: fromString parses error`
- `Continuation failure path: status transitions`
- `Loading: full lifecycle with cancellation`
- `Loading: pending_continuation lifecycle`

**Total tests:** 589/589 passed

## Oracle Review Notes

Oracle identified one additional concern about UI reading Loading internals without locks. Current code appears safe because:
1. UI reads atomic flags (`isLoading`, `hasPendingWork`) which are lock-free safe
2. UI doesn't directly read non-atomic fields like `pending_tools`, `tool_results`

If future rendering code needs Loading details, pass a snapshot copied under lock.
