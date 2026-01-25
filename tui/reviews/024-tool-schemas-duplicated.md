# Tool Schemas Duplicated and Inconsistent

**Severity:** 🟡 Medium  
**Type:** Maintainability / Correctness  
**Files:** `src/agent/anthropic_provider.zig`, `src/agent/tool_executor.zig`, `src/agent/loop.zig`

## Problem

Multiple different JSON tool schema definitions:

1. **anthropic_provider.zig** - `old_text/new_text` for edit_file, no offset/limit for read_file
2. **tool_executor.zig** - `old_str/new_str`, read_file has offset/limit
3. **loop.zig** - also `old_str/new_str`, offset/limit

The actual tool implementations use specific field names. Schema mismatches cause silent failures.

## Impact

- "Tool failed to parse args" errors
- LLM uses wrong field names based on which schema it sees
- Hard to debug which schema is being sent
- Maintenance nightmare keeping them in sync

## Fix

Single source of truth:

```zig
// src/agent/tools/schema.zig
pub const tools_json = 
    \\[{"name":"read_file",...},...]
;

// Then import everywhere:
const schema = @import("tools/schema.zig");
// Use schema.tools_json
```

Or generate schema from tool definitions:

```zig
pub fn generateSchema(comptime tools: []const ToolDef) []const u8 {
    // comptime generate JSON from tool structs
}
```

## Effort

M (1 hour)
