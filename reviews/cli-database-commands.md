# CLI Database Commands Review

**Component:** CLI + Documentation
**Status:** Request Changes

---

## Summary

Tested database CLI commands from `docs/concepts/database-persistence.mdx`. Working commands function correctly, but docs contain wrong binary name and document 3 unimplemented features.

## Critical Issues

### 1. Binary Name Mismatch (P0)
**Docs:** `smithers-orchestrator db executions`
**Actual:** `smithers db executions`

Package.json defines bin as "smithers" (line 8), but docs use "smithers-orchestrator" throughout database-persistence.mdx:279-286.

### 2. Missing `query` Subcommand (P1)
**Documented:** `smithers-orchestrator db query "SELECT * FROM agents LIMIT 10"`
**Status:** Not implemented in src/commands/db/index.ts

Help shows 7 subcommands (state, transitions, executions, memories, stats, current, recovery) but no `query`. Users can't run custom SQL from CLI.

**Workaround:**
```bash
bun -e "const {Database}=require('bun:sqlite'); \
        const db=new Database('.smithers/data'); \
        console.log(db.query('SELECT * FROM agents').all()); \
        db.close();"
```

### 3. Missing `phases` Subcommand (P2)
**Documented:** `smithers-orchestrator db phases --execution-id abc123`
**Status:** Not implemented

### 4. Missing `--execution-id` Filter (P2)
**Documented:** `smithers db state --execution-id abc123`
**Status:** Not implemented

Commands show global state only. No per-execution filtering available.

## Working Commands

All 7 implemented commands work correctly:
- `executions` - Lists all executions with stats (agents/tools/tokens)
- `state` - Shows current key-value state
- `stats` - Database table counts
- `transitions` - State change history with triggers
- `memories` - Memory storage (by category/scope)
- `current` - Active execution details
- `recovery` - Incomplete executions for crash recovery

Output formatting is clean and readable.

## Verdict

**REQUEST CHANGES** - Fix binary name in docs immediately (breaks all examples). Implement `query` subcommand or remove from docs.

---

## Action Items
- [ ] Fix binary name: smithers-orchestrator → smithers (docs/concepts/database-persistence.mdx)
- [ ] Implement `db query` subcommand OR remove from docs
- [ ] Add `--execution-id` flag to state/transitions/stats OR remove from docs
- [ ] Implement `db phases` OR remove from docs
- [ ] Fix CLI help default path (shows .smithers/data/smithers.db but should be .smithers/data)

## Debugging Plan

### Files to Investigate
- `src/commands/db/index.ts` - Main dispatcher, add `query` and `phases` cases
- `src/commands/db/help.ts` - Update help text
- `docs/concepts/database-persistence.mdx` (lines 279-289) - Fix binary name
- `docs/quickstart.mdx` (lines 191-197) - Fix binary name
- `docs/examples/multi-phase-review.mdx` (lines 160-163) - Fix binary name
- All 108+ occurrences of `smithers-orchestrator db` in docs/

### Grep Patterns
```bash
# Find all CLI command references in docs
grep -rn "smithers-orchestrator db" docs/

# Find db subcommand implementations
grep -rn "case '" src/commands/db/

# Check for execution-id handling
grep -rn "execution.id\|executionId" src/commands/db/
```

### Test Commands to Reproduce
```bash
smithers db query "SELECT 1"           # Should fail - not implemented
smithers db phases --execution-id abc  # Should fail - not implemented
smithers db state --execution-id abc   # Flag ignored - not implemented
```

### Proposed Fix Approach
1. **Binary name (P0)**: Global find/replace `smithers-orchestrator db` → `smithers db` in all .mdx files
2. **Query subcommand (P1)**: Add `src/commands/db/query-view.ts` that executes arbitrary SQL and formats results
3. **Phases subcommand (P2)**: Add `src/commands/db/phases-view.ts` querying phase-related tables
4. **Execution-id filter (P2)**: Add `--execution-id` option to DbOptions, pass to view functions, add WHERE clauses

---

## Status Check: 2026-01-18

**STILL RELEVANT** - All 4 issues confirmed unresolved:

| Issue | Status | Evidence |
|-------|--------|----------|
| Binary name mismatch | ❌ OPEN | 9 occurrences of `smithers-orchestrator db` in docs/*.mdx |
| Missing `query` subcommand | ❌ OPEN | No case in src/commands/db/index.ts, no query-view.ts |
| Missing `phases` subcommand | ❌ OPEN | No case in index.ts, no phases-view.ts |
| Missing `--execution-id` flag | ❌ OPEN | DbOptions only has `path` field |

### Immediate Fix Steps

**P0 - Binary name (5 min):**
```bash
# Fix all 9 occurrences
sed -i '' 's/smithers-orchestrator db/smithers db/g' \
  docs/quickstart.mdx \
  docs/examples/multi-phase-review.mdx \
  docs/concepts/database-persistence.mdx
```

**P1 - Query subcommand (30 min):**
1. Create `src/commands/db/query-view.ts`:
   ```typescript
   export async function runQuery(db: SmithersDB, sql: string) {
     const stmt = db.db.prepare(sql)
     const results = stmt.all()
     console.table(results)
   }
   ```
2. Add case in index.ts: `case 'query': await runQuery(db, args[0]); break`
3. Update help.ts with query usage

**P2 - Phases + execution-id (1 hr):**
1. Add `executionId?: string` to DbOptions
2. Pass to view functions, add WHERE clauses
3. Create phases-view.ts querying phase-related data
