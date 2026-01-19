# Review: Smithers.tsx - Missing Error Handling on JSON.parse

## File
[src/components/Smithers.tsx](file:///Users/williamcory/smithers/src/components/Smithers.tsx#L168-L170)

## Issue Description
`JSON.parse` is called without try-catch on database data:

```tsx
const result: SmithersResult | null = agentRow?.result_structured 
  ? JSON.parse(agentRow.result_structured) 
  : null
```

If the database contains corrupted JSON, this will crash the component.

## Suggested Fix
Add try-catch wrapper:

```tsx
const result: SmithersResult | null = (() => {
  if (!agentRow?.result_structured) return null
  try {
    return JSON.parse(agentRow.result_structured)
  } catch {
    console.warn('[Smithers] Failed to parse result_structured')
    return null
  }
})()
```
