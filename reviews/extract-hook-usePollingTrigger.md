# Hook Extraction: usePollingTrigger

## Location
Repeated pattern in hook components:

| File | Lines |
|------|-------|
| `src/components/Hooks/PostCommit.tsx` | 101-165 |
| `src/components/Hooks/OnCIFailure.tsx` | 140-228 |

## Current Inline Logic

```tsx
const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

useMount(() => {
  // Initialize state
  const currentState = db.state.get<State>('hook:KEY')
  if (!currentState) {
    db.state.set('hook:KEY', DEFAULT_STATE, 'init')
  }

  ;(async () => {
    try {
      // Setup work...
      
      // Start polling
      pollIntervalRef.current = setInterval(async () => {
        try {
          const trigger = db.state.get<Trigger>('last_hook_trigger')
          const currentS = db.state.get<State>('hook:KEY') ?? DEFAULT_STATE
          
          if (trigger && shouldTrigger(trigger, currentS)) {
            // Update state
            db.state.set('hook:KEY', { ...currentS, triggered: true, ... }, 'triggered')
            
            // Mark processed
            db.state.set('last_hook_trigger', { ...trigger, processed: true }, 'hook')
          }
        } catch (pollError) {
          console.error('[Hook] Polling error:', pollError)
        }
      }, INTERVAL)
    } catch (err) {
      // Handle setup error
    }
  })()
})

useUnmount(() => {
  if (pollIntervalRef.current) {
    clearInterval(pollIntervalRef.current)
  }
})
```

## Suggested Hook

```tsx
interface UsePollingTriggerOptions<TState, TTrigger> {
  stateKey: string
  triggerKey: string
  defaultState: TState
  pollInterval: number
  shouldTrigger: (trigger: TTrigger, state: TState) => boolean | Promise<boolean>
  onTrigger: (trigger: TTrigger) => TState
  onSetup?: () => Promise<void>
}

interface UsePollingTriggerResult<TState> {
  state: TState
  isPolling: boolean
  error: string | null
}

function usePollingTrigger<TState, TTrigger>(
  options: UsePollingTriggerOptions<TState, TTrigger>
): UsePollingTriggerResult<TState>
```

## Rationale
- **2 components** with identical polling infrastructure (~50 lines each)
- Same interval setup/cleanup, same state init, same trigger detection
- Only differs in: what to poll for, how to check trigger condition
- More hook types likely coming (OnPush, OnMerge, etc.)
