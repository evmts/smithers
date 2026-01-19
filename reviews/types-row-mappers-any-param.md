# Type Safety Issue: `any` type for row mappers

## Files & Lines

- `src/db/execution.ts:25` - `const mapExecution = (row: any): Execution | null`
- `src/db/agents.ts:24` - `const mapAgent = (row: any): Agent | null`
- `src/db/vcs.ts:64` - `const mapCommit = (row: any): Commit | null`
- `src/db/vcs.ts:73` - `const mapSnapshot = (row: any): Snapshot | null`
- `src/db/vcs.ts:84` - `const mapReview = (row: any): Review | null`
- `src/db/vcs.ts:97` - `const mapReport = (row: any): Report | null`
- `src/db/artifacts.ts:18` - `const mapArtifact = (row: any): Artifact | null`
- `src/db/human.ts:73` - `rdb.queryOne<any>(...)`
- `src/db/human.ts:85` - `rdb.query<any>(...)`

## Issue

Row mapper functions accept `any` instead of a typed raw row interface. This means typos in property access won't be caught.

## Suggested Fix

Define raw row interfaces that match SQLite column names (snake_case with string/number types for JSON fields):

```typescript
// execution.ts
interface ExecutionRow {
  id: string
  name: string | null
  file_path: string
  status: string
  config: string | null  // JSON string
  result: string | null  // JSON string
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  total_iterations: number
  total_agents: number
  total_tool_calls: number
  total_tokens_used: number
}

const mapExecution = (row: ExecutionRow | null): Execution | null => {
  if (!row) return null
  return {
    ...row,
    config: parseJson(row.config, {}),
    result: parseJson(row.result, undefined),
  }
}
```

Apply similar pattern to all row mappers.
