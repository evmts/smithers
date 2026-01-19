# ReportTool: Sync vs Async addReport Mismatch

**File:** `src/tools/ReportTool.ts`  
**Lines:** 107

## Issue

`ReportTool.execute` awaits `context.db.vcs.addReport()`:

```typescript
const reportId = await context.db.vcs.addReport({...})
```

But `addReport` signature in `src/db/vcs.ts:46-53` returns `string` (sync), not `Promise<string>`.

## Impact

- Works due to JS auto-wrapping, but misleading
- Test mocks use `async () => 'report-123'` which masks this

## Fix

Remove `await`:

```typescript
const reportId = context.db.vcs.addReport({
  ...reportData,
  ...(input.data && { data: input.data }),
})
```
