# Hook Extraction: usePhaseStepActivation

## Location
Repeated pattern in agent components:

| File | Lines |
|------|-------|
| `src/components/Claude.tsx` | 30-36, 77-78 |
| `src/components/Smithers.tsx` | 126-132, 179-180 |

## Current Inline Logic

```tsx
const phase = usePhaseContext()
const phaseActive = phase?.isActive ?? true
const step = useStepContext()
const stepActive = step?.isActive ?? true
const ralphCount = useRalphCount()

// Later:
const shouldExecute = phaseActive && stepActive
const executionKey = `${ralphCount}:${shouldExecute ? 'active' : 'inactive'}`
```

## Suggested Hook

```tsx
interface UseActivationResult {
  shouldExecute: boolean
  executionKey: string
  ralphCount: number
}

function useActivation(): UseActivationResult
```

## Usage

```tsx
// Before
const phase = usePhaseContext()
const phaseActive = phase?.isActive ?? true
const step = useStepContext()
const stepActive = step?.isActive ?? true
const ralphCount = useRalphCount()
const shouldExecute = phaseActive && stepActive
const executionKey = `${ralphCount}:${shouldExecute ? 'active' : 'inactive'}`

// After
const { shouldExecute, executionKey, ralphCount } = useActivation()
```

## Rationale
- **Same 7 lines** in Claude and Smithers
- Will appear in any future agent components (Gemini, GPT, etc.)
- Encapsulates the "should I run now" decision
- Single place to modify activation logic
