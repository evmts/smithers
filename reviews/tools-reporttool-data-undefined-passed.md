# ReportTool: data:undefined Passed to addReport

**File:** `src/tools/ReportTool.ts`  
**Lines:** 105-111

## Issue

Test at line 119-126 expects:

```typescript
expect(addReport).toHaveBeenCalledWith({
  ...
  data: undefined,  // ← explicit undefined
  ...
})
```

But code at 107-110 uses conditional spread:

```typescript
const reportId = await context.db.vcs.addReport({
  ...reportData,
  ...(input.data && { data: input.data }),
})
```

This means when `input.data` is undefined, `data` key is **not present** (not `undefined`).

## Impact

Test expectation is wrong - test passes because mock doesn't validate strictly.

## Fix

Update test expectation to not include `data: undefined`:

```typescript
expect(addReport).toHaveBeenCalledWith({
  type: 'progress',
  title: 'Test Progress',
  content: 'Progress update content',
  severity: 'info',
  agent_id: 'agent-123',
})
```
