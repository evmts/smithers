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

## Debugging Plan

### Current Status Assessment
- `If.tsx` exists but is a **simple ternary wrapper** (line 25-26: `return condition ? children : null`), NOT the scoped version required for stateful workflows
- `While`, `Switch`, `ScopeProvider` do **NOT exist**
- `scopeId` pattern is **NOT implemented** anywhere in codebase

### Files to Investigate
1. `/Users/williamcory/smithers/src/components/SmithersProvider.tsx` - Check context shape, add scopeId
2. `/Users/williamcory/smithers/src/components/PhaseRegistry.tsx` - State key patterns to understand scoping needs
3. `/Users/williamcory/smithers/src/components/Step.tsx` - StepRegistry scoping patterns
4. `/Users/williamcory/smithers/issues/control-flow-components.md` - Original design doc

### Grep Patterns for Root Cause
```bash
# Find state key patterns that need scoping
grep -r "currentPhaseIndex" src/
grep -r "stepIndex_" src/
grep -r "db\.state" src/components/

# Find existing context patterns to extend
grep -r "SmithersContext" src/
grep -r "useSmithers" src/
```

### Test Commands to Reproduce
```bash
# Verify While doesn't exist
bun run -e "import { While } from './src/components'; console.log(While)"
# Should error or undefined

# Check If is just render helper
bun test src/components/If.test.tsx  # if exists
```

### Proposed Fix Approach

**Phase 1: Foundation (scopeId system)**
1. Add `scopeId: string` to `SmithersContextValue` in SmithersProvider.tsx
2. Create `ScopeProvider.tsx` that wraps children with new scope context
3. Update PhaseRegistry to key state by `scopeId`
4. Update StepRegistry to key state by `scopeId`

**Phase 2: Control Flow Components**
1. Upgrade `If.tsx` to use ScopeProvider for `then`/`else` branches
2. Create `While.tsx` with iteration-scoped children
3. Create `Switch.tsx` + `Case.tsx` + `Default.tsx`

**Phase 3: Testing**
1. Test nested While loops with Phase/Step inside
2. Test crash recovery mid-iteration
3. Test If/While/Switch combinations

## Status Check: 2026-01-18

**STILL RELEVANT** - Verified against current codebase:

| Component/Pattern | Status |
|-------------------|--------|
| `scopeId` in context | ❌ Not implemented |
| `ScopeProvider.tsx` | ❌ Does not exist |
| `While.tsx` | ❌ Does not exist |
| `Switch.tsx` | ❌ Does not exist |
| `If.tsx` | ⚠️ Exists but simple ternary (L25-26: `return condition ? children : null`) |

The existing Debugging Plan above remains accurate and actionable.
