# TODO: Claude Component Refactoring

## Location
- File: `src/components/Claude.tsx`
- Lines: 28, 39, 80

## TODO Comments

### 1. Missing JSDoc Documentation (Line 28)
```typescript
// TODO: add jsdoc
export function Claude(props: ClaudeProps): ReactNode {
```

### 2. Extract Logic into Named Hooks (Line 39)
```typescript
// TODO abstract all the following block of lines into named hooks
const agentIdRef = useRef<string | null>(null)
const tailLogRef = useRef<TailLogEntry[]>([])
const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
const { data: agentRows } = useQuery<AgentRow>(...)
// ... more state logic follows
```

### 3. Replace useEffect with Event Handler (Line 80)
```typescript
// TODO: should be handled by an event handler not a useEffect
useEffectOnValueChange(executionKey, () => {
  // execution logic
})
```

## Context

The Claude component is the main agent execution wrapper. It currently:
- Has complex state management inline (agentId, tailLog, status, result, error)
- Uses useEffect for side effects that could be event-driven
- Lacks JSDoc documentation for the public API

## Recommended Actions

1. **Add JSDoc** - Document ClaudeProps and component behavior
2. **Extract hooks** - Create:
   - `useAgentExecution()` - manage agent lifecycle
   - `useTailLog()` - handle log streaming
   - `useAgentStatus()` - derive status from DB
3. **Event-driven execution** - Replace useEffectOnValueChange with explicit event triggers

## Priority
**Medium** - Technical debt affecting maintainability. The component works but is harder to understand and test.
