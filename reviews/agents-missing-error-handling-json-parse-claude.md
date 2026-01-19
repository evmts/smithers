# Missing Error Handling: JSON.parse in Claude.tsx

## File
[src/components/Claude.tsx](file:///Users/williamcory/smithers/src/components/Claude.tsx#L58)

## Issue
Uncaught `JSON.parse` can throw if `result_structured` contains invalid JSON.

## Problematic Code
```typescript
const result: AgentResult | null = agentRow?.result ? {
  output: agentRow.result,
  structured: agentRow.result_structured ? JSON.parse(agentRow.result_structured) : undefined,
  // ...
} : null
```

## Bug Scenario
1. Database contains malformed JSON in `result_structured`
2. `JSON.parse` throws during render
3. Entire component tree unmounts

## Suggested Fix
```typescript
structured: agentRow.result_structured 
  ? safeJsonParse(agentRow.result_structured) 
  : undefined,
```

Where `safeJsonParse` is:
```typescript
function safeJsonParse(str: string): unknown | undefined {
  try {
    return JSON.parse(str)
  } catch {
    return undefined
  }
}
```
