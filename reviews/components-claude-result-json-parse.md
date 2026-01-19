# Review: Claude.tsx - Missing Error Handling on JSON.parse

## File
[src/components/Claude.tsx](file:///Users/williamcory/smithers/src/components/Claude.tsx#L56-L58)

## Issue Description
`JSON.parse` is called without try-catch, which will throw if `result_structured` contains malformed JSON:

```tsx
const result: AgentResult | null = agentRow?.result ? {
  output: agentRow.result,
  structured: agentRow.result_structured ? JSON.parse(agentRow.result_structured) : undefined,
  // ...
} : null
```

If the database contains corrupted JSON data, this will crash the component.

## Suggested Fix
Wrap in try-catch with fallback:

```tsx
function safeJsonParse(str: string | null): unknown {
  if (!str) return undefined
  try {
    return JSON.parse(str)
  } catch {
    console.warn('[Claude] Failed to parse result_structured JSON:', str.slice(0, 100))
    return undefined
  }
}

const result: AgentResult | null = agentRow?.result ? {
  output: agentRow.result,
  structured: safeJsonParse(agentRow.result_structured),
  // ...
} : null
```
