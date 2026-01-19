# Missing Error Handling: JSON.parse in Smithers.tsx

## File
[src/components/Smithers.tsx](file:///Users/williamcory/smithers/src/components/Smithers.tsx#L168-L169)

## Issue
Uncaught `JSON.parse` can throw if `result_structured` contains invalid JSON.

## Problematic Code
```typescript
const result: SmithersResult | null = agentRow?.result_structured 
  ? JSON.parse(agentRow.result_structured) 
  : null
```

## Bug Scenario
1. Database corruption or manual edit corrupts `result_structured`
2. `JSON.parse` throws `SyntaxError`
3. Component crashes during render

## Suggested Fix
```typescript
const result: SmithersResult | null = (() => {
  if (!agentRow?.result_structured) return null
  try {
    return JSON.parse(agentRow.result_structured)
  } catch {
    console.error('Failed to parse result_structured')
    return null
  }
})()
```

Or create a utility: `safeJsonParse(str, fallback)`
