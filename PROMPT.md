# Issue: UIMessage Format

See: `../../../issues/uimessage-format.md`

## Issues to Fix

### 1. Step Sequential Deadlock (`reviews/step-sequential-deadlock.md`)
- **Problem**: Steps 1+ never start because `useMount` doesn't re-run when `isActive` changes
- **Problem**: Task completion tied to `useUnmount` but Steps never unmount (stay for plan view)
- **File**: `src/components/Step.tsx` (lines 202-241)

**Fix Pattern**:
```tsx
// Replace useMount with useEffectOnValueChange
import { useEffectOnValueChange } from '../reconciler/hooks.js'

useEffectOnValueChange(isActive, () => {
  if (isActive && !hasStartedRef.current) {
    hasStartedRef.current = true
    // ... start step logic
  }
})
```

### 2. Phase Registry Broken (`reviews/phase-registry-broken.md`)
- **Problem**: Resets phase index to 0 every mount (nukes progress)
- **Problem**: Skipped phases advance at mount time (wrong timing)
- **Problem**: No completion detection mechanism
- **File**: `src/components/PhaseRegistry.tsx` (line 68), `src/components/Phase.tsx` (lines 86-99)

**Fix Pattern**:
```tsx
// Only initialize if missing
useMount(() => {
  const existing = db.state.get<number>('currentPhaseIndex')
  if (existing === null) {
    db.state.set('currentPhaseIndex', 0, 'phase_registry_init')
  }
})
```

### 3. Stop Handling Starts Task (`reviews/stop-handling-starts-task.md`)
- **Problem**: Components start tasks BEFORE checking stop status
- **File**: `src/components/Claude.tsx:72-78`

**Fix Pattern**:
```tsx
// Check stop BEFORE starting task
if (isStopRequested()) {
  return
}
taskIdRef.current = db.tasks.start('claude', props.model ?? 'sonnet')
```

### 4. SmithersProvider Control Plane (`reviews/smithers-provider-control-plane.md`)
- **Problem**: `stopRequested` doesn't halt iteration
- **Problem**: `dbRalphCount === null` check is wrong (should be `== null`)
- **Problem**: 10ms polling is too aggressive (change to 50ms)
- **Problem**: `globalSmithersContext` never cleaned up
- **File**: `src/components/SmithersProvider.tsx`

## Workflow

1. Make commits as you implement
2. When ready, push and create PR:
   ```bash
   git push -u origin issue/uimessage-format
   gh pr create --title "Feat: UIMessage Format" --body "Implements uimessage-format. See issues/uimessage-format.md"
   ```
