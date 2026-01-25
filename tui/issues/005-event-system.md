# Event System

## Priority: Medium

## Problem
Current architecture uses direct mutation + reload pattern. UI updates are tightly coupled to agent loop internals.

## Pi Implementation
- `packages/agent/src/types.ts` - `AgentEvent` union type
- `EventStream` class with async iteration
- Subscriber pattern via `agent.subscribe(fn)`

## Event Types

```
agent_start
turn_start
message_start { message }
message_update { message, assistantMessageEvent }
message_end { message }
tool_execution_start { toolCallId, toolName, args }
tool_execution_update { toolCallId, toolName, partialResult }
tool_execution_end { toolCallId, toolName, result, isError }
turn_end { message, toolResults }
agent_end { messages }
```

## Benefits

1. **Decoupled UI**: Render logic subscribes to events, no polling
2. **Logging/Telemetry**: Easy to add event listeners
3. **Testing**: Assert on event sequence
4. **Streaming UI**: Partial updates without full reload

## Implementation Plan

1. Define event enum in `agent/types.zig`:
   ```zig
   pub const AgentEvent = union(enum) {
       agent_start,
       turn_start,
       message_start: *const Message,
       message_update: MessageUpdate,
       message_end: *const Message,
       tool_start: ToolStart,
       tool_update: ToolUpdate,
       tool_end: ToolEnd,
       turn_end: TurnEnd,
       agent_end,
   };
   ```

2. Add event queue to `Loading`:
   ```zig
   events: std.ArrayListUnmanaged(AgentEvent),
   ```

3. Push events from `loop.zig` at appropriate points

4. Poll events in main thread, update UI accordingly

5. Remove `state_changed` bool, use event presence instead

## Reference Files
- `reference/pi-mono/packages/agent/src/types.ts`
- `reference/pi-mono/packages/agent/src/agent-loop.ts`
