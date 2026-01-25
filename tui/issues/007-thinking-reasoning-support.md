# Thinking/Reasoning Mode Support

## Priority: Medium

## Problem
No support for extended thinking modes. Claude 3.5+ and other models support thinking blocks that improve reasoning quality.

## Pi Implementation
- `packages/ai/src/types.ts` - `ThinkingLevel` type
- `packages/ai/src/stream.ts` - `mapOptionsForApi()` per-provider mapping
- Thinking budgets configurable per level
- Parse thinking blocks from response

## Thinking Levels

```
off      → no thinking
minimal  → 1024 tokens
low      → 2048 tokens
medium   → 8192 tokens
high     → 16384 tokens
xhigh    → provider max (clamped to high for unsupported)
```

## Provider-Specific Mapping

| Provider | Parameter |
|----------|-----------|
| Anthropic | `thinking.budget_tokens` + adjust `max_tokens` |
| OpenAI | `reasoning_effort` |
| Google | `thinking.budgetTokens` or `thinking.level` |
| Bedrock | Same as Anthropic for Claude models |

## Implementation Plan

1. Add thinking level to config:
   ```zig
   pub const ThinkingLevel = enum { off, minimal, low, medium, high };
   ```

2. Update request body in `loop.zig`:
   ```json
   {
     "thinking": {
       "type": "enabled",
       "budget_tokens": 8192
     }
   }
   ```

3. Parse thinking blocks from response:
   ```zig
   if (content_block.type == .thinking) {
       // Store but don't display by default
   }
   ```

4. Add `/thinking <level>` command

5. Add thinking indicator in UI (collapsible)

## Reference Files
- `reference/pi-mono/packages/ai/src/stream.ts` (lines 210-320)
- `reference/pi-mono/packages/ai/src/types.ts`
