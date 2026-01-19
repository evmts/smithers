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

## Debugging Plan

### Files to Investigate
- `/Users/williamcory/smithers/src/db/index.ts` - `runMigrations()` at lines 111-118
- `/Users/williamcory/smithers/src/db/schema.sql` - current schema definition

### Grep Patterns
```bash
# Find all manual migration patterns
grep -r "PRAGMA table_info" src/db/
grep -r "ALTER TABLE" src/db/
grep -r "runMigrations" src/db/
```

### Test Commands
```bash
# Verify current migration behavior
bun test src/db/agents.test.ts
# Check schema loading
bun run -e "import {createSmithersDB} from './src/db'; const db = createSmithersDB(); console.log(db)"
```

### Proposed Fix Approach
1. Add `schema_migrations` table to `schema.sql`
2. Create `src/db/migrations/` directory
3. Create `src/db/migrations/001_add_log_path_to_agents.ts` with version/name/up exports
4. Refactor `runMigrations()` to:
   - Read all migration files from `migrations/`
   - Query `schema_migrations` for applied versions
   - Execute pending migrations in version order
   - Insert record into `schema_migrations` after each
5. Add migration helper: `createMigration(version: number, name: string, up: (db) => void)`
6. Write tests in `src/db/migrations.test.ts`

## Debugging Plan

### Step 1: Verify Current State
```bash
# Confirm manual migration pattern exists
grep -n "PRAGMA table_info\|ALTER TABLE" src/db/index.ts
```

### Step 2: Add schema_migrations Table
Add to `src/db/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT DEFAULT (datetime('now'))
);
```

### Step 3: Create Migration Infrastructure
1. Create `src/db/migrations/` directory
2. Create `src/db/runMigrations.ts` with:
   - `Migration` interface: `{ version: number, name: string, up: (db: ReactiveDatabase) => void }`
   - `runMigrations(db)` that reads migrations, checks `schema_migrations`, applies pending

### Step 4: Convert Existing Migration
Create `src/db/migrations/001_add_log_path_to_agents.ts`:
```typescript
export const version = 1
export const name = 'add_log_path_to_agents'
export function up(db: ReactiveDatabase): void {
  db.exec('ALTER TABLE agents ADD COLUMN log_path TEXT')
}
```

### Step 5: Update index.ts
Replace manual `runMigrations()` with import from new module.

### Step 6: Test
```bash
bun test src/db/
# Verify new DB gets log_path column
# Verify existing DB with log_path doesn't fail
# Verify schema_migrations records applied version
```

### Acceptance Criteria
- [ ] `schema_migrations` table exists
- [ ] Migrations run in order by version
- [ ] Applied migrations are recorded
- [ ] Existing databases upgrade correctly
- [ ] Tests pass for migration system
