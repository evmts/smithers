# Hook Extraction: useVCSOperation

## Location
Repeated pattern across 6 JJ/Git components:

| File | Lines |
|------|-------|
| `src/components/JJ/Commit.tsx` | 19-89 |
| `src/components/JJ/Describe.tsx` | 17-69 |
| `src/components/JJ/Snapshot.tsx` | 17-67 |
| `src/components/JJ/Rebase.tsx` | 42-149 |
| `src/components/JJ/Status.tsx` | 18-87 |
| `src/components/Git/Notes.tsx` | 37-108 |

## Current Inline Logic (identical boilerplate)

```tsx
const smithers = useSmithers()
const [, forceUpdate] = useReducer((x) => x + 1, 0)

const statusRef = useRef<'pending' | 'running' | 'complete' | 'error'>('pending')
const resultRef = useRef<T | null>(null)
const errorRef = useRef<Error | null>(null)
const taskIdRef = useRef<string | null>(null)
const isMounted = useMountedState()

useMount(() => {
  ;(async () => {
    taskIdRef.current = smithers.db.tasks.start('TYPE')
    try {
      statusRef.current = 'running'
      forceUpdate()
      
      // ... actual VCS operation ...
      
      if (isMounted()) {
        resultRef.current = result
        statusRef.current = 'complete'
        forceUpdate()
      }
    } catch (err) {
      if (isMounted()) {
        errorRef.current = err instanceof Error ? err : new Error(String(err))
        statusRef.current = 'error'
        forceUpdate()
      }
    } finally {
      if (taskIdRef.current) {
        smithers.db.tasks.complete(taskIdRef.current)
      }
    }
  })()
})
```

## Suggested Hook

```tsx
interface UseVCSOperationOptions<T> {
  taskType: string
  taskName?: string
  operation: () => Promise<T>
  onSuccess?: (result: T) => void | Promise<void>
  onError?: (error: Error) => void
}

interface UseVCSOperationResult<T> {
  status: 'pending' | 'running' | 'complete' | 'error'
  result: T | null
  error: Error | null
}

function useVCSOperation<T>(options: UseVCSOperationOptions<T>): UseVCSOperationResult<T>
```

## Rationale
- **6 components** with nearly identical ~40 lines of boilerplate each
- Same ref pattern, same task lifecycle, same error handling
- Only the actual VCS command differs
- Reduces ~240 lines to ~30 (hook) + 6×5 (usage)
