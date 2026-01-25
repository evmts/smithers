# Context Compaction

## Priority: Critical

## Problem
Context grows unbounded in long sessions, eventually hitting token limits or OOM.

## Pi Implementation
- `packages/coding-agent/src/core/compaction/compaction.ts`
- Token estimation via `estimateTokens()` (chars/4 heuristic)
- Cut-point detection preserving turn boundaries
- LLM-generated summaries with file operation tracking
- Split-turn summarization for mid-turn compaction
- Iterative updates to previous summary

## Key Components to Port

```
┌─────────────────────────────────────────────────────────────────┐
│ estimateContextTokens() → check against model limit            │
│ shouldCompact() → trigger when tokens > limit - reserveTokens  │
│ findCutPoint() → find boundary preserving keepRecentTokens     │
│ generateSummary() → LLM call to summarize discarded messages   │
│ CompactionEntry → SQLite table for persisted compaction state  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

1. Add `compaction` table to SQLite schema:
   - `id`, `session_id`, `summary`, `first_kept_msg_id`, `tokens_before`, `details_json`

2. Add token estimation in `loop.zig`:
   - Count chars/4 for each message
   - Track cumulative tokens

3. Add compaction trigger check after each turn

4. Implement summarization (call LLM with compaction prompt)

5. Track file operations (read/modified files) across compactions

## Reference Files
- `reference/pi-mono/packages/coding-agent/src/core/compaction/compaction.ts`
- `reference/pi-mono/packages/coding-agent/src/core/compaction/utils.ts`
