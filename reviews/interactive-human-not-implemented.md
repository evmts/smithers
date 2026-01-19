## Scope: major

# useHumanInteractive Hook Not Implemented

## Status: FEATURE GAP

## Summary
Complete design exists for `useHumanInteractive` hook (design-complete status as of commit e01a096), but implementation has not begun. Hook enables interactive Claude Code sessions for complex human-in-the-loop scenarios requiring exploration, multi-turn dialogue, and AI assistance.

## Design Status
- **Design document**: `/Users/williamcory/smithers/issues/use-human-interactive.md` (1391 lines)
- **Design review**: Complete - all 10 P0 issues resolved (2026-01-18)
- **Implementation status**: Not started
- **Acceptance criteria**: 31 items defined and ready

## Impact
- No interactive human-in-the-loop sessions beyond simple prompts
- Cannot have multi-turn conversations during orchestration
- No way for humans to explore codebase with AI assistance before making decisions
- Limits complex approval workflows requiring investigation

## Current Implementation Gap

### What Exists
- `useHuman` hook (`/Users/williamcory/smithers/src/hooks/useHuman.ts`) - simple prompts only
  - Supports: confirmation, select, input types
  - Returns direct response via `ask()` method
- Basic `HumanModule` in `/Users/williamcory/smithers/src/db/human.ts`
  - Methods: `request()`, `resolve()`, `get()`, `listPending()`
- DB table: `human_interactions` (schema.sql:452) - missing session columns

### What's Missing (per design doc)
1. **Hook**: `useHumanInteractive.ts` with mutation-like API (`request`, `requestAsync`, `cancel`, `reset`)
2. **DB schema additions**:
   - `session_config` (TEXT) - JSON configuration
   - `session_transcript` (TEXT) - optional captured transcript
   - `session_duration` (INTEGER) - ms
   - `error` (TEXT) - error message
   - New type: `'interactive_session'`
   - New statuses: `'completed'`, `'cancelled'`, `'failed'`
3. **HumanModule extensions**:
   - `requestInteractive(prompt, config)`
   - `completeInteractive(id, outcome, response, options)`
   - `cancelInteractive(id)`
   - `listPending(executionId?)` - explicit execution scope
4. **Types**:
   - `HumanInteractionRow` - raw DB row type
   - `InteractiveSessionConfig` - session configuration
   - `InteractiveSessionResult` - outcome type
   - `parseHumanInteraction()` - mapper function
5. **Harness integration** - external process handling (not in-process)

## Implementation Approach (from design)

### Phase 1: DB Schema (0.5 day)
```sql
ALTER TABLE human_interactions ADD COLUMN session_config TEXT;
ALTER TABLE human_interactions ADD COLUMN session_transcript TEXT;
ALTER TABLE human_interactions ADD COLUMN session_duration INTEGER;
ALTER TABLE human_interactions ADD COLUMN error TEXT;
```
Add migration, update `HumanInteraction` type, add `HumanInteractionRow` type

### Phase 2: Human Module (0.5 day)
Extend `/Users/williamcory/smithers/src/db/human.ts`:
- Add `requestInteractive()`, `completeInteractive()`, `cancelInteractive()`
- Update `listPending()` to accept optional `executionId` (support `'*'` for cross-execution)
- Add `parseHumanInteraction()` mapper

### Phase 3: Hook (1 day)
Create `/Users/williamcory/smithers/src/hooks/useHumanInteractive.ts`:
- Reactive subscription via `useQueryOne<HumanInteractionRow>`
- Parse raw rows with `parseHumanInteraction()`
- Task creation for orchestration gating (`blockOrchestration: true`)
- Promise resolution on session completion
- Single-session enforcement (throw if pending)
- Export from `/Users/williamcory/smithers/src/hooks/index.ts`

### Phase 4: Documentation (0.5 day)
- API docs for hook
- Usage examples
- Harness integration guide

### Phase 5: Example Harness (0.5 day)
- Reference implementation showing Claude CLI interactive mode launch
- Outcome extraction patterns (approval, structured)

## Key Design Decisions (P0 review resolved)
- **Mutation API**: `request()` fire-and-forget, `requestAsync()` returns promise
- **Serializable config**: JSON Schema in DB, Zod validation client-side
- **Status semantics**: Lifecycle (`pending|completed|cancelled|timeout|failed`), decisions in `response` field
- **Orchestration gating**: Creates task when `blockOrchestration: true` (default)
- **Harness-agnostic**: Creates DB record; external harness fulfills via polling `listPending('*')`
- **Privacy**: Transcript capture opt-in (`captureTranscript: false` default)
- **Concurrency**: Single session enforced (throws if `status === 'pending'`)

## Codebase Patterns to Follow

### DB Module Pattern
Similar to existing modules in `/Users/williamcory/smithers/src/db/`:
- `agents.ts` - has `mapAgent()` parser
- `commits.ts` - has `mapCommit()` parser
- Follow same pattern: `HumanInteractionRow` raw type, `parseHumanInteraction()` mapper

### Hook Pattern
Follow `/Users/williamcory/smithers/src/hooks/useHuman.ts`:
- Use `useQueryOne<HumanInteractionRow>` for reactive subscription
- Track `resolveRef` for promise resolution
- `useMount`/`useUnmount` from `/Users/williamcory/smithers/src/reconciler/hooks` (not `useEffect`)
- `useCallback` for methods

### Task Integration
Use `db.tasks` for orchestration gating:
```typescript
const tid = db.tasks.start('human_interactive', description)
// ... later when session completes
db.tasks.complete(tid)
```

## Testing Considerations
- Test DB migration on existing database
- Test single-session enforcement
- Test task completion on all terminal states
- Test parsing of session_config JSON
- Mock harness for integration tests

## Priority
**P2** - High value post-MVP feature, design complete, ready for implementation

## Estimated Effort
**3.5-4 days** (per detailed implementation plan in design doc)

## Debugging Plan

### Files to Investigate
1. `/Users/williamcory/smithers/src/db/human.ts` - extend with interactive methods
2. `/Users/williamcory/smithers/src/hooks/useHuman.ts` - reference for hook pattern
3. `/Users/williamcory/smithers/src/db/schema.sql` - DB schema (line ~452 for human_interactions)
4. `/Users/williamcory/smithers/issues/use-human-interactive.md` - full design doc (1391 lines)
5. `/Users/williamcory/smithers/src/hooks/index.ts` - export new hook

### Grep Patterns for Context
```bash
# Existing hook patterns
grep -r "useQueryOne" src/hooks/
grep -r "resolveRef" src/hooks/
grep -r "db.tasks.start" src/

# DB module patterns (for mappers)
grep -r "mapAgent\|mapCommit" src/db/

# Schema location
grep -n "human_interactions" src/db/schema.sql
```

### Test Commands to Reproduce
```bash
# Verify hook doesn't exist
ls src/hooks/ | grep -i interactive

# Check DB schema for missing columns
grep -E "session_config|session_transcript|session_duration" src/db/schema.sql
```

### Proposed Fix Approach

**Phase 1: DB Schema Migration**
1. Add columns to `human_interactions` table in `schema.sql`
2. Create migration script for existing DBs
3. Add `HumanInteractionRow` raw type and `parseHumanInteraction()` mapper

**Phase 2: Extend HumanModule**
1. Add `requestInteractive(prompt, config)` method
2. Add `completeInteractive(id, outcome, response, options)` method
3. Add `cancelInteractive(id)` method
4. Extend `listPending(executionId?)` to accept optional execution scope

**Phase 3: Create useHumanInteractive Hook**
1. Create `/src/hooks/useHumanInteractive.ts`
2. Implement mutation API: `request`, `requestAsync`, `cancel`, `reset`
3. Use `useQueryOne<HumanInteractionRow>` for reactivity
4. Task creation for orchestration gating
5. Single-session enforcement
6. Export from `hooks/index.ts`

**Phase 4: Tests**
1. Unit tests for DB module extensions
2. Integration tests for hook with mock harness
3. Test single-session enforcement throws
