# Review: Claude.tsx - Inline Hooks Should Be Extracted

## File
[src/components/Claude.tsx](file:///Users/williamcory/smithers/src/components/Claude.tsx#L39-L75)

## Issue Description
The component has a large block of inline state management (lines 39-75) with a TODO comment on line 39 acknowledging this:
```tsx
// TODO abstract all the following block of lines into named hooks
```

This includes:
- agentIdRef initialization
- tailLogRef initialization
- forceUpdate reducer
- useQuery for agent rows
- Status mapping logic
- Result parsing logic
- Error construction

## Suggested Fix
Extract into a named hook `useClaudeAgent`:

```tsx
function useClaudeAgent(reactiveDb: ReactiveDatabase) {
  const agentIdRef = useRef<string | null>(null)
  const tailLogRef = useRef<TailLogEntry[]>([])
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  
  const { data: agentRows } = useQuery<AgentRow>(
    reactiveDb,
    "SELECT status, result, result_structured, error, tokens_input, tokens_output, duration_ms FROM agents WHERE id = ?",
    [agentIdRef.current ?? '']
  )
  const agentRow = agentRows[0] ?? null

  const status = mapAgentStatus(agentRow?.status)
  const result = parseAgentResult(agentRow)
  const error = agentRow?.error ? new Error(agentRow.error) : null

  return {
    agentIdRef,
    tailLogRef,
    forceUpdate,
    agentRow,
    status,
    result,
    error,
  }
}
```
