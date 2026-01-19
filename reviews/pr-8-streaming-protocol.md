# PR #8 Review: Streaming Protocol

**PR:** issue/streaming-protocol
**Status:** Approve with comments

---

## Summary

Implements V3StreamPart-inspired streaming protocol:
- `SmithersStreamPart` types in `src/streaming/types.ts`
- `ClaudeStreamParser` for parsing CLI output
- `LogWriter.appendStreamPart()` for NDJSON logging
- Database integration for stream events
- New Claude props: `experimentalTypedStreaming`, `legacyLogFormat`, `recordStreamEvents`

## Positive

1. **Rich observability** - Typed events enable debugging, metrics, UI
2. **Backward compatible** - `onProgress` still works, legacy logs optional
3. **Database integration** - `agent_stream_events` table + `stream_summary` JSON
4. **Phase execution gating** - `ExecutionGateProvider` cleanly gates children
5. **NDJSON format** - Easy to parse with jq, grep, etc.

## Issues

### 1. Stream Parser Complexity
`ClaudeStreamParser` handles multiple JSON formats (Claude API, CLI-specific):
```typescript
mapClaudeEventToStreamPart(event: any): SmithersStreamPart[]
```
The `any` type loses type safety. Define explicit input types for known event shapes.

### 2. DB Schema Migration
`agent_stream_events` table added but no migration script. Existing DBs will fail on:
```sql
INSERT INTO agent_stream_events ...
```
Add schema migration or `CREATE TABLE IF NOT EXISTS`.

### 3. Output Parser Duplication
`parseStreamJson()` in output-parser.ts duplicates some ClaudeStreamParser logic. Consider consolidating.

### 4. ExecutionGateProvider Location
Added to `src/reconciler/hooks.ts` but it's a component, not a hook. Should be in `src/components/ExecutionGate.tsx`.

### 5. Missing Type Export
`SmithersStreamPart` not exported from main index. Add:
```typescript
export type { SmithersStreamPart } from './streaming/types.js'
```

## Verdict

**APPROVE** - Major improvement to observability. Schema migration concern is most important to address.

---

## Action Items
- [ ] Add `CREATE TABLE IF NOT EXISTS` for agent_stream_events
- [ ] Define explicit input types for stream parser
- [ ] Move ExecutionGateProvider to components/
- [ ] Export SmithersStreamPart from index.ts

## Status: RESOLVED

**Evidence:** The streaming protocol features reviewed here were never implemented:

- No `src/streaming/` directory exists
- No `SmithersStreamPart` type in codebase
- No `ClaudeStreamParser` class
- No `agent_stream_events` table in `src/db/schema.sql`
- No `ExecutionGateProvider` component
- No `experimentalTypedStreaming`, `legacyLogFormat`, or `recordStreamEvents` props

The PR appears to have been abandoned or superseded. The design spec still exists at `issues/streaming-protocol.md` but was never merged. This review is now moot.
