**SCOPE: major**

# Control Flow Components Not Implemented

## Status: FEATURE GAP

## Summary
The design documents describe `If`, `While`, and `Switch` components for conditional execution, but they are not implemented. Complex conditional workflows require workarounds.

## Impact
- No declarative conditional execution
- Must use Phase `skipIf` as workaround
- Complex workflows require imperative logic
- Cannot express retry loops or multi-way branching declaratively

## Design Location
- `/Users/williamcory/smithers/issues/control-flow-components.md`

## Current Workaround
```tsx
// Instead of <If condition={...}>
<Phase skipIf={() => !condition}>
  <Claude prompt="..." />
</Phase>
```

## Implementation Requirements

### Critical: Scoping System Required First
The core complexity is that control flow needs **hierarchical scoping** to allow phases/steps to re-execute across iterations without state collision. Without scoping, database state breaks:

```tsx
<While condition={() => testsNotPassing} maxIterations={5}>
  <Phase name="Fix and Test">  {/* Would mark as completed in iteration 1 */}
    <Step name="Analyze">...</Step>
  </Phase>
</While>
// Iteration 2: Phase already marked completed in DB → skips → loop broken
```

### Implementation Pattern (from design doc)

**1. Add scoping to SmithersProvider context:**
```tsx
interface SmithersContextValue {
  // ... existing fields
  scopeId: string  // NEW: hierarchical scope like "root.while_abc.2.if_def.then"
}
```

**2. Create ScopeProvider component:**
```tsx
export function ScopeProvider({ scopeId, children }: { scopeId: string, children: ReactNode }) {
  const parentContext = useSmithers()
  const scopedContext = useMemo(() => ({ ...parentContext, scopeId }), [parentContext, scopeId])
  return <SmithersContext.Provider value={scopedContext}>{children}</SmithersContext.Provider>
}
```

**3. Update PhaseRegistry to use scoped state keys:**
```tsx
// In PhaseRegistryProvider
const phaseIndexKey = `currentPhaseIndex_${scopeId}` // was just 'currentPhaseIndex'
```

**4. Update StepRegistry to use scoped state keys:**
```tsx
// In StepRegistryProvider
const stateKey = `stepIndex_${scopeId}_${props.phaseId ?? 'default'}`
```

**5. Implement control flow components that create child scopes:**
```tsx
export function While(props: WhileProps): ReactNode {
  const { scopeId } = useSmithers()
  const whileId = useRef(`while_${Math.random().toString(36).slice(2)}`).current
  const iterationScopeId = `${scopeId}.${whileId}.${iteration}`

  return (
    <while iteration={iteration} status={status}>
      <ScopeProvider scopeId={iterationScopeId}>
        {props.children}
      </ScopeProvider>
    </while>
  )
}
```

### Files to Modify

**Phase 1: Add Scoping (Foundation)**
- `/Users/williamcory/smithers/src/components/SmithersProvider.tsx` - Add scopeId to context, initialize as "root"
- Create `/Users/williamcory/smithers/src/components/ScopeProvider.tsx` - New component
- `/Users/williamcory/smithers/src/components/PhaseRegistry.tsx` - Use scoped state keys
- `/Users/williamcory/smithers/src/components/Step.tsx` - Use scoped state keys (StepRegistry)

**Phase 2: Implement Components**
- Create `/Users/williamcory/smithers/src/components/If.tsx`
- Create `/Users/williamcory/smithers/src/components/Else.tsx`
- Create `/Users/williamcory/smithers/src/components/While.tsx`
- Create `/Users/williamcory/smithers/src/components/Switch.tsx`
- Create `/Users/williamcory/smithers/src/components/Case.tsx`
- Create `/Users/williamcory/smithers/src/components/Default.tsx`
- `/Users/williamcory/smithers/src/components/index.ts` - Export new components

**Phase 3: Testing**
- Create comprehensive tests for scoped phase/step execution
- Test nested control flow scenarios
- Test resumability after crashes mid-iteration

## Codebase Patterns to Follow

**Vendored hooks pattern:**
```tsx
import { useMount } from '../reconciler/hooks.js'  // NOT useEffect
```

**Database-backed reactive state:**
```tsx
const { data: dbValue } = useQueryValue<T>(reactiveDb, 'SELECT...', [key])
```

**Phase/Step coordination:**
- Phases auto-sequence via PhaseRegistry's currentPhaseIndex
- Steps auto-sequence via StepRegistry within each phase
- Control flow must preserve this sequencing behavior

## Priority
**P2** - High value feature, but requires careful design review before implementation per design doc warnings

## Estimated Effort
**5-7 days** (per design doc)
- 2 days: Add scope context
- 2 days: Update Phase/Step to use scope
- 3 days: Implement If/While/Switch
- 2 days: Testing

## Risks
- **Breaking change to core state management** if scoping implementation is wrong
- Complex nested scenarios (While in If in While) need thorough testing
- Resumability after crashes requires careful state persistence
- Design doc explicitly requires **human review and approval** before implementation
