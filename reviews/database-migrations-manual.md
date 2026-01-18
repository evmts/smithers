# Database Migrations Are Manual

## Status: LOW PRIORITY

## Summary
Schema changes require manual ALTER TABLE statements in the `runMigrations()` function. There's no automated migration system.

## Impact
- Schema evolution is error-prone
- No rollback capability
- Hard to track migration history
- Users may have inconsistent database states

## Location
- `src/db/index.ts` - `runMigrations()`
- `src/db/schema.sql`

## Suggested Fix
1. Implement versioned migration system
2. Add migration files with up/down functions
3. Track applied migrations in database table
4. Add CLI command for running migrations
5. Consider using a migration library

## Priority
**P4** - Technical debt

## Estimated Effort
4-6 hours
