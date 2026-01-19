# Type Safety Issue: `any` type for db parameter in CLI views

## Files & Lines

- `src/commands/db/transitions-view.ts:11` - `showTransitions(db: any)`
- `src/commands/db/state-view.ts:3` - `showState(db: any)`
- `src/commands/db/stats-view.ts:3` - `showStats(db: any)`
- `src/commands/db/recovery-view.ts:16` - `showRecovery(db: any)`
- `src/commands/db/executions-view.ts:16` - `showExecutions(db: any)`
- `src/commands/db/memories-view.ts:17` - `showMemories(db: any)`
- `src/commands/db/current-view.ts:28` - `showCurrent(db: any)`

## Issue

All CLI view functions accept `db: any` instead of the properly typed `SmithersDB` interface. This loses all type safety for database operations.

## Suggested Fix

```typescript
import type { SmithersDB } from '../../db/index.js'

export async function showTransitions(db: SmithersDB) {
  // ...
}
```

Apply to all 7 view files.
