# Tool Result Details & Streaming

## Priority: Medium

## Problem
Tools return simple success/content. Missing:
- Structured details (diff, line numbers, metadata)
- Partial result streaming during execution
- Rich display information

## Pi Implementation
- Tools return `{ content, details }` where details is tool-specific
- `partialResult` callback for streaming updates
- `EditToolDetails` includes diff + first changed line

## Tool Details Examples

```typescript
// Edit tool
interface EditToolDetails {
  diff: string;
  firstChangedLine?: number;
}

// Read tool  
interface ReadToolDetails {
  totalLines: number;
  truncated: boolean;
}

// Bash tool
interface BashToolDetails {
  exitCode: number;
  duration: number;
}
```

## Streaming Partial Results

```typescript
execute: async (id, args, signal, onPartialResult) => {
  // For long-running tools, stream progress
  onPartialResult({ type: "progress", percent: 50 });
  onPartialResult({ type: "output", text: "..." });
  
  return { content, details };
}
```

## Implementation Plan

1. Extend `ToolResult`:
   ```zig
   pub const ToolResult = struct {
       success: bool,
       content: []const u8,
       error_message: ?[]const u8 = null,
       details_json: ?[]const u8 = null,  // NEW
       // ...
   };
   ```

2. Add partial result callback to `ToolContext`:
   ```zig
   on_partial: ?*const fn([]const u8) void,
   ```

3. Update tools to return details:
   - `edit_file` → diff, first_changed_line
   - `read_file` → total_lines, truncated
   - `bash` → exit_code, duration_ms

4. Display details in chat (collapsible diff view)

## Reference Files
- `reference/pi-mono/packages/coding-agent/src/core/tools/edit.ts`
- `reference/pi-mono/packages/agent/src/agent-loop.ts` (lines 324-332)
