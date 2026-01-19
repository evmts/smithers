# Type Safety Issue: `any[]` in VCS review types

## Files & Lines

- `src/db/vcs.ts:37` - `issues: any[]`
- `src/db/vcs.ts:38` - `approvals?: any[]`
- `src/db/vcs.ts:189` - `const params: any[] = []`
- `src/db/vcs.ts:235` - `const params: any[] = [currentExecutionId]`

## Issue

The `logReview` method parameter types use `any[]` for issues and approvals, even though `ReviewIssue` and `ReviewApproval` types are defined in `types.ts`.

## Suggested Fix

```typescript
// vcs.ts line 32-42
logReview: (review: {
  target_type: 'commit' | 'diff' | 'pr' | 'files'
  target_ref?: string
  approved: boolean
  summary: string
  issues: ReviewIssue[]  // Use the typed interface
  approvals?: ReviewApproval[]  // Use the typed interface
  reviewer_model?: string
  blocking?: boolean
  agent_id?: string
}) => string

// For params arrays, use SqlParam type:
type SqlParam = string | number | boolean | null

const params: SqlParam[] = []
```
