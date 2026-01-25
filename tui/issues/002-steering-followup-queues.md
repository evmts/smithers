# Steering & Follow-Up Message Queues

## Status: ✅ IMPLEMENTED

## Priority: High

## Problem
Currently only supports cancel (abort entire run). Users cannot:
- Interrupt mid-tool execution to redirect agent
- Queue follow-up messages while agent is working

## Pi Implementation
- `packages/agent/src/agent.ts` - `steer()` and `followUp()` methods
- `steeringQueue` / `followUpQueue` arrays
- `getSteeringMessages()` callback checked after each tool
- Remaining tools skipped when steering message arrives

## Behavior

```
User types while agent running:
  ├─ steer() → inject immediately, skip remaining tools
  └─ followUp() → queue for after agent stops

Modes:
  ├─ "all" → send all queued messages at once
  └─ "one-at-a-time" → one message per turn
```

## Implementation Plan

1. Add to `Loading` struct:
   ```zig
   steering_queue: std.ArrayListUnmanaged([]const u8),
   followup_queue: std.ArrayListUnmanaged([]const u8),
   ```

2. Add input handling during agent run:
   - Check for Enter key → add to steering queue
   - Set flag to skip remaining pending tools

3. Modify `poll_tool_completion`:
   - Check steering queue after each tool
   - If non-empty, skip remaining tools, inject steering message

4. Modify `poll_active_stream` completion:
   - Check followup queue when no more tools
   - If non-empty, start new turn with followup message

## Reference Files
- `reference/pi-mono/packages/agent/src/agent.ts` (lines 99-228)
- `reference/pi-mono/packages/agent/src/agent-loop.ts` (lines 363-375)

## Implementation Summary

### Files Modified

1. **`tui/src/loading.zig`**
   - Added `steering_queue` and `followup_queue` ArrayListUnmanaged fields
   - Added `steering_mode` and `followup_mode` enums (all | one_at_a_time)
   - Added methods: `steer()`, `followUp()`, `getSteeringMessages()`, `getFollowUpMessages()`
   - Added helpers: `hasSteeringMessages()`, `hasFollowUpMessages()`, `clearSteeringQueue()`, `clearFollowUpQueue()`, `clearAllQueues()`
   - Updated `cleanup()` to free queue memory
   - Updated `updatePendingWorkFlag()` to include queue state

2. **`tui/src/agent/loop.zig`**
   - Modified `poll_tool_completion()`: after each tool, checks steering queue. If non-empty, skips remaining tools with "Skipped due to queued user message" and calls `build_continuation_request_with_steering()`
   - Modified `poll_active_stream()` completion: checks followup queue. If non-empty, starts new turn with followup message instead of full cleanup
   - Added `build_continuation_request_with_steering()`: builds continuation with tool results + steering messages as text content

3. **`tui/src/keys/handler.zig`**
   - Modified message submission: when agent is loading, calls `loading.steer()` instead of `addPendingMessage()`

4. **`tui/src/tests/loading_test.zig`**
   - Added 12 new tests for steering/followup queue functionality

### Behavior
- User types while agent running → message queued via `steer()` → after current tool completes, remaining tools skipped, steering message injected
- If agent completes without steering but has followup messages → new turn started automatically with followup as query
