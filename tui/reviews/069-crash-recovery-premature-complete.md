# Crash Recovery: Premature Completion

**Severity:** 🟡 Medium  
**Type:** Correctness  
**File:** `src/agent/loop.zig`, `src/db.zig`  
**Status:** ✅ FIXED

## Problem

`build_continuation_request()` marked agent run as `complete` before the continuation stream even started:

```zig
// BEFORE: Bug - marks complete before continuation finishes
if (self.loading.agent_run_id) |rid| {
    database.completeAgentRun(rid) catch |err| { ... };
    self.loading.agent_run_id = null;  // Lost tracking!
}
```

If crash occurred during continuation stream, recovery code would not see an active run.

## Impact

- Partial/placeholder assistant messages persisted as "complete"
- Crash during continuation leaves inconsistent state
- No way to resume interrupted continuation

## Fix

1. Added `continuing` status to `AgentRunStatus` enum
2. Changed to mark run as `continuing` (not `complete`)
3. Keep `agent_run_id` until stream actually finishes

```zig
// AFTER: Track continuation phase
if (self.loading.agent_run_id) |rid| {
    database.updateAgentRunStatus(rid, .continuing) catch |err| { ... };
    // Keep agent_run_id so we can mark complete when continuation finishes
}
```

## Tests

See `src/tests/thread_safety_test.zig`:
- `AgentRunStatus: continuing status exists`
- `AgentRunStatus: fromString parses continuing`
- `AgentRunStatus: all statuses round-trip`

## Commit

`fix(tui): address all review issues - thread safety, crash recovery, lock discipline`
