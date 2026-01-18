# Database Migrations Are Manual

**Scope: easy**

## Status: LOW PRIORITY

## Summary
Schema changes require manual ALTER TABLE statements in the `runMigrations()` function. There's no automated migration system. Currently only 1 migration exists (adding `log_path` to agents table).

## Impact
- Schema evolution is error-prone
- No rollback capability
- Hard to track migration history
- Users may have inconsistent database states
- Every new column requires manual PRAGMA table_info checks + ALTER TABLE

## Location
- `/Users/williamcory/smithers/src/db/index.ts` - `runMigrations()` (lines 111-118)
- `/Users/williamcory/smithers/src/db/schema.sql` - Main schema

## Current Implementation
```typescript
function runMigrations(rdb: ReactiveDatabase): void {
  // Migration: Add log_path column to agents table if it doesn't exist
  const agentsColumns = rdb.query<{ name: string }>('PRAGMA table_info(agents)')
  const hasLogPath = agentsColumns.some((col) => col.name === 'log_path')
  if (!hasLogPath) {
    rdb.exec('ALTER TABLE agents ADD COLUMN log_path TEXT')
  }
}
```

## Recommended Fix (Based on Codebase Patterns)

Since this project uses Bun and `bun:sqlite` directly (no external DB libraries), implement a simple migration system:

1. **Create migrations table in schema.sql:**
   ```sql
   CREATE TABLE IF NOT EXISTS schema_migrations (
     version INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     applied_at TEXT DEFAULT (datetime('now'))
   );
   ```

2. **Create migrations directory:** `/Users/williamcory/smithers/src/db/migrations/`

3. **Migration file format:** `001_add_log_path_to_agents.ts`
   ```typescript
   export const version = 1
   export const name = 'add_log_path_to_agents'
   export const up = (db: ReactiveDatabase) => {
     db.exec('ALTER TABLE agents ADD COLUMN log_path TEXT')
   }
   ```

4. **Update `runMigrations()` to:**
   - Read migration files from `migrations/` directory
   - Check `schema_migrations` table for applied versions
   - Run pending migrations in order
   - Record each in `schema_migrations`

5. **Pattern precedent:** This follows the modular pattern used in `/Users/williamcory/smithers/src/db/` where each feature has its own file (agents.ts, phases.ts, etc.)

## Why "Easy" Scope
- No external dependencies needed (use existing `ReactiveDatabase`)
- Small surface area (only 1 migration currently exists)
- Clear pattern to follow from existing db module structure
- No breaking changes to existing API
- Estimated 2-3 hours of work

## Priority
**P4** - Technical debt (low priority but would prevent future schema debt)
