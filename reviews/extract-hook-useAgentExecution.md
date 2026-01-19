# Hook Extraction: useAgentExecution

## Location
- **File**: `src/components/Claude.tsx`
- **Lines**: 40-295

## Current Inline Logic

```tsx
const agentIdRef = useRef<string | null>(null)
const tailLogRef = useRef<TailLogEntry[]>([])
const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
const { data: agentRows } = useQuery<AgentRow>(...)
const agentRow = agentRows[0] ?? null

// Status mapping from DB
const dbStatus = agentRow?.status
const status: 'pending' | 'running' | 'complete' | 'error' = 
  dbStatus === 'completed' ? 'complete' : ...

// Result construction from DB row
const result: AgentResult | null = agentRow?.result ? { ... } : null
const error: Error | null = agentRow?.error ? new Error(agentRow.error) : null

// Task/log tracking refs
const taskIdRef = useRef<string | null>(null)
const messageParserRef = useRef<MessageParser>(...)
const isMounted = useMountedState()
const lastTailLogUpdateRef = useRef<number>(0)
const pendingTailLogUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null)

// Execution key for idempotent execution
const shouldExecute = phaseActive && stepActive
const executionKey = `${ralphCount}:${shouldExecute ? 'active' : 'inactive'}`

useEffectOnValueChange(executionKey, () => { /* 150+ lines of async execution */ })
```

## Also Duplicated In
- `src/components/Smithers.tsx` (lines 134-285) - nearly identical pattern

## Suggested Hook

```tsx
interface UseAgentExecutionOptions<T> {
  db: SmithersDB
  reactiveDb: ReactiveDatabase
  executionId: string | null
  isStopRequested: () => boolean
  shouldExecute: boolean
  ralphCount: number
  execute: (agentId: string) => Promise<T>
  reportingEnabled?: boolean
  agentType: 'claude' | 'smithers'
  model?: string
}

interface UseAgentExecutionResult<T> {
  status: 'pending' | 'running' | 'complete' | 'error'
  result: T | null
  error: Error | null
  agentId: string | null
  tailLog: TailLogEntry[]
}

function useAgentExecution<T>(options: UseAgentExecutionOptions<T>): UseAgentExecutionResult<T>
```

## Rationale
- **~150 lines** of async execution logic duplicated between Claude and Smithers
- Same pattern: refs for IDs, DB query for status, useEffectOnValueChange for execution
- Same error handling, reporting, task lifecycle
- Extract once, test once, fix bugs once
