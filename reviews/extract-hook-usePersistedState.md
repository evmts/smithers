# Hook Extraction: usePersistedState

## Location
Repeated pattern across multiple components:

| File | Lines |
|------|-------|
| `src/components/Git/Commit.tsx` | 68-85 |
| `src/components/Git/Notes.tsx` | 38-55 |
| `src/components/Worktree.tsx` | 27-45 |
| `src/components/Hooks/PostCommit.tsx` | 91-106 |
| `src/components/Hooks/OnCIFailure.tsx` | 128-145 |

## Current Inline Logic

```tsx
const opIdRef = useRef(crypto.randomUUID())
const stateKey = `PREFIX:${opIdRef.current}`

const { data: storedState } = useQueryValue<string>(
  smithers.db.db,
  "SELECT value FROM state WHERE key = ?",
  [stateKey]
)
const state: StateType = storedState
  ? JSON.parse(storedState)
  : DEFAULT_STATE

const setState = (newState: StateType) => {
  smithers.db.state.set(stateKey, newState, 'TAG')
}
```

## Suggested Hook

```tsx
function usePersistedState<T>(
  keyPrefix: string,
  defaultValue: T,
  tag?: string
): [T, (value: T) => void]
```

## Usage

```tsx
// Before
const opIdRef = useRef(crypto.randomUUID())
const stateKey = `git-commit:${opIdRef.current}`
const { data: opState } = useQueryValue<string>(...)
const { status, result, error }: CommitState = opState ? JSON.parse(opState) : DEFAULT
const setState = (newState: CommitState) => { smithers.db.state.set(stateKey, newState, 'git-commit') }

// After
const [state, setState] = usePersistedState<CommitState>('git-commit', DEFAULT_STATE)
```

## Rationale
- **5+ components** with identical state persistence pattern
- Eliminates manual JSON parse/stringify
- Auto-generates unique operation IDs
- Cleaner useState-like API backed by SQLite
