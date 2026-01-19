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
