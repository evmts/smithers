# CLI: db views use `any` type for db parameter

## Location
- **Files**: 
  - [src/commands/db/state-view.ts](file:///Users/williamcory/smithers/src/commands/db/state-view.ts#L3)
  - [src/commands/db/transitions-view.ts](file:///Users/williamcory/smithers/src/commands/db/transitions-view.ts#L11)
  - [src/commands/db/executions-view.ts](file:///Users/williamcory/smithers/src/commands/db/executions-view.ts#L16)
  - [src/commands/db/memories-view.ts](file:///Users/williamcory/smithers/src/commands/db/memories-view.ts#L17)
  - [src/commands/db/stats-view.ts](file:///Users/williamcory/smithers/src/commands/db/stats-view.ts#L3)
  - [src/commands/db/current-view.ts](file:///Users/williamcory/smithers/src/commands/db/current-view.ts#L28)
  - [src/commands/db/recovery-view.ts](file:///Users/williamcory/smithers/src/commands/db/recovery-view.ts#L16)

## Issue
All view functions accept `db: any`, losing type safety. If the db API changes, these won't catch errors at compile time.

## Suggested Fix
```typescript
import type { SmithersDB } from '../../db/index.js'

export async function showState(db: SmithersDB) {
  // ...
}
```
