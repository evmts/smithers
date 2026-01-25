# Steering & Follow-Up Message Queues

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
