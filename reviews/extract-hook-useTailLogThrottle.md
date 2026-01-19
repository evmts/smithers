# Hook Extraction: useTailLogThrottle

## Location
- **File**: `src/components/Claude.tsx`
- **Lines**: 70-76, 153-178

## Current Inline Logic

```tsx
const tailLogRef = useRef<TailLogEntry[]>([])
const messageParserRef = useRef<MessageParser>(new MessageParser(maxEntries * 2))
const lastTailLogUpdateRef = useRef<number>(0)
const pendingTailLogUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null)

// In onProgress callback:
messageParserRef.current.parseChunk(chunk)

const now = Date.now()
const timeSinceLastUpdate = now - lastTailLogUpdateRef.current

if (timeSinceLastUpdate >= DEFAULT_TAIL_LOG_THROTTLE_MS) {
  lastTailLogUpdateRef.current = now
  if (isMounted()) {
    tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
    forceUpdate()
  }
} else if (!pendingTailLogUpdateRef.current) {
  pendingTailLogUpdateRef.current = setTimeout(() => {
    pendingTailLogUpdateRef.current = null
    lastTailLogUpdateRef.current = Date.now()
    if (isMounted()) {
      tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
      forceUpdate()
    }
  }, DEFAULT_TAIL_LOG_THROTTLE_MS - timeSinceLastUpdate)
}

// Cleanup on completion:
messageParserRef.current.flush()
if (pendingTailLogUpdateRef.current) {
  clearTimeout(pendingTailLogUpdateRef.current)
  pendingTailLogUpdateRef.current = null
}
tailLogRef.current = messageParserRef.current.getLatestEntries(maxEntries)
forceUpdate()
```

## Suggested Hook

```tsx
interface UseTailLogThrottleOptions {
  maxEntries: number
  throttleMs?: number
}

interface UseTailLogThrottleResult {
  entries: TailLogEntry[]
  parseChunk: (chunk: string) => void
  flush: () => void
}

function useTailLogThrottle(options: UseTailLogThrottleOptions): UseTailLogThrottleResult
```

## Usage

```tsx
// Before: 4 refs + 25 lines of throttle logic inline
const tailLogRef = useRef<TailLogEntry[]>([])
const messageParserRef = useRef<MessageParser>(...)
// ... more refs and throttle logic

// After
const { entries, parseChunk, flush } = useTailLogThrottle({ maxEntries: 10 })
// In onProgress: parseChunk(chunk)
// On complete: flush()
```

## Rationale
- Complex throttled update logic (~30 lines) inline in component
- Mixes rendering concerns with streaming parsing
- Reusable for any streaming log display (Smithers, future agents)
- Encapsulates timer cleanup properly
