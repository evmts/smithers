# Unsafe JSON.parse Without Try-Catch

## Files
- [src/db/human.ts](file:///Users/williamcory/smithers/src/db/human.ts#L77-L78)
- [src/db/human.ts](file:///Users/williamcory/smithers/src/db/human.ts#L91-L92)
- [src/db/tasks.ts](file:///Users/williamcory/smithers/src/db/tasks.ts#L146)

## Issue
Direct `JSON.parse()` calls without try-catch. If DB contains malformed JSON, these will throw unhandled exceptions.

```typescript
// human.ts L77-78
options: row.options ? JSON.parse(row.options) : null,
response: row.response ? JSON.parse(row.response) : null

// tasks.ts L146
return result ? JSON.parse(result.value) : 0
```

Other modules correctly use `parseJson()` from utils.ts which handles errors gracefully.

## Impact
- Corrupted/invalid JSON in DB causes uncaught exceptions
- Inconsistent with other modules using `parseJson()`

## Suggested Fix
Use the existing `parseJson` utility:

```typescript
// human.ts
import { parseJson } from './utils.js'
// ...
options: parseJson(row.options, null),
response: parseJson(row.response, null),

// tasks.ts
import { parseJson } from './utils.js'
// ...
return parseJson(result?.value, 0)
```
