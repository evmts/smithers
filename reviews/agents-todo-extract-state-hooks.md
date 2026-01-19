# TODO: Extract State Management into Named Hooks

## File
[src/components/Claude.tsx](file:///Users/williamcory/smithers/src/components/Claude.tsx#L39-L68)

## Issue
Line 39: `// TODO abstract all the following block of lines into named hooks`

30 lines of boilerplate state management (refs, queries, status mapping) are duplicated between Claude.tsx and Smithers.tsx.

## Code Smell
```typescript
// Claude.tsx L40-68
const agentIdRef = useRef<string | null>(null)
const tailLogRef = useRef<TailLogEntry[]>([])
const [, forceUpdate] = useReducer(...)
const { data: agentRows } = useQuery(...)
const agentRow = agentRows[0] ?? null
const dbStatus = agentRow?.status
const status = dbStatus === 'completed' ? 'complete' : ...
const result = agentRow?.result ? { ... } : null
const error = agentRow?.error ? new Error(...) : null
```

## Suggested Fix
Create `useAgentState` hook in `src/hooks/`:
```typescript
// src/hooks/useAgentState.ts
export function useAgentState(reactiveDb: ReactiveDb) {
  const agentIdRef = useRef<string | null>(null)
  const { data: agentRows } = useQuery<AgentRow>(
    reactiveDb,
    "SELECT ... FROM agents WHERE id = ?",
    [agentIdRef.current ?? '']
  )
  // ... status mapping logic
  return { agentIdRef, status, result, error }
}
```
