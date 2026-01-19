# SQL Injection: memories.ts search method

## File
[src/db/memories.ts](file:///Users/williamcory/smithers/src/db/memories.ts#L62-L68)

## Issue
The `search` method interpolates user input directly into a LIKE pattern without escaping SQL wildcards:

```typescript
const params: any[] = [`%${query}%`]
```

If `query` contains `%` or `_`, it can match unintended patterns. More critically, while parameterized, the LIKE wildcards themselves aren't escaped.

## Impact
- Pattern injection: user can pass `%` to match everything
- Not a full SQL injection (params are bound), but semantic injection

## Suggested Fix
Escape SQL LIKE wildcards before interpolation:

```typescript
const escapeLike = (s: string) => s.replace(/[%_]/g, '\\$&')
const params: any[] = [`%${escapeLike(query)}%`]
// Add ESCAPE clause to query
sql = "SELECT * FROM memories WHERE content LIKE ? ESCAPE '\\'"
```
