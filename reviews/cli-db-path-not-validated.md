# CLI: db command doesn't validate database path exists

## Location
- **File**: [src/commands/db/index.ts](file:///Users/williamcory/smithers/src/commands/db/index.ts#L29)
- **Line**: 29

## Issue
The `db` command calls `createSmithersDB({ path: dbPath })` without first checking if the database exists. If the path doesn't exist, the error message from SQLite will be cryptic.

## Suggested Fix
```typescript
import * as fs from 'fs'

// Before creating DB connection
const dbFile = path.join(dbPath, 'smithers.db')
if (!fs.existsSync(dbFile)) {
  console.error(`❌ Database not found: ${dbFile}`)
  console.error('')
  console.error('Did you run `smithers init` and `smithers run` first?')
  process.exit(1)
}

const db = await createSmithersDB({ path: dbPath })
```
