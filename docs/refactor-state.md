# State Machine Refactor Plan

## Overview

This refactor eliminates "effects as state machines" by migrating state transitions to explicit event-driven actions, using the existing SQLite-backed reactive state (db.state) as the centralized store.

**Key Insight**: The codebase already uses SQLite (`db.state`) as the primary state container instead of Zustand. The refactor will leverage this existing pattern.

## Audit Summary

### Effects to Remove (State Machine Logic)

| File | Lines | Pattern | Action |
|------|-------|---------|--------|
| `SmithersProvider.tsx` | 294-300 | DB init sync effect | Move to explicit init action |
| `SmithersProvider.tsx` | 342-405 | Ralph iteration monitoring via interval | Move to explicit action-based orchestration |
| `Phase.tsx` | 107-122 | Phase activation effect | Move to explicit `activatePhase` action |
| `Phase.tsx` | 127-140 | Phase completion effect | Move to explicit `completePhase` action |
| `ExecutionTimeline.tsx` | 29-91 | Polling effect sets state | Convert to custom hook `usePollEvents` |
| `ExecutionTimeline.tsx` | 109-115 | Scroll sync effect | Compute in action handler |
| `DatabaseExplorer.tsx` | 41-56 | Table data load on selection | Move to explicit `selectTable` action |
| `ScrollableList.tsx` | 26-30 | Clamp selection effect | Compute in action or selector |
| `ScrollableList.tsx` | 54-60 | Scroll sync effect | Compute in action handler |
| `useHuman.ts` | 63-76 | Promise resolution effect | Move to callback-based resolution |
| `useReportGenerator.ts` | 22-37 | Poll reports effect | Custom hook `usePollReports` |
| `useReportGenerator.ts` | 55-61 | Auto-generate interval | Custom hook `useAutoReport` |
| `useQuery.ts` | 139-144 | Re-fetch on deps effect | Compute in selector |

### Effects to Keep (True Side-Effects → Abstract to Custom Hooks)

| File | Lines | Purpose | New Hook Name |
|------|-------|---------|---------------|
| `SmithersProvider.tsx` | 323-339 | Render frame capture | `useCaptureRenderFrame` |
| `useSmithersConnection.ts` | 34-93 | DB connection + polling | `useDbConnection` (already isolated) |
| `useHumanRequests.ts` | 35-39 | Poll for pending requests | `usePollHumanRequests` |
| `useRenderFrames.ts` | 24-39 | Poll for frames | `usePollRenderFrames` |
| `OnCIFailure.tsx` | useMount | CI polling | Already uses useMount (correct) |
| `PostCommit.tsx` | useMount | Git hook install | Already uses useMount (correct) |

### useState to Migrate to db.state

| Component | State Variable | Decision |
|-----------|---------------|----------|
| `SmithersProvider` | stopRequested, rebaseRequested | Migrate to db.state |
| `SmithersProvider` | localRalphCount | Remove - use DB exclusively |
| `ExecutionTimeline` | events, selectedIndex, scrollOffset | Keep local - ephemeral UI |
| `DatabaseExplorer` | selectedTable, tableData, etc. | Keep local - ephemeral UI |
| `ScrollableList` | selectedIndex, scrollOffset | Keep local - ephemeral UI |
| `ChatInterface` | inputValue, isInputFocused | Keep local - ephemeral UI |
| `HumanInteractionHandler` | responseText, selectedOption | Keep local - ephemeral UI |
| `useClaudeChat` | messages, isLoading, error | Keep local - ephemeral session |
| `OnCIFailure` | ciStatus, triggered, etc. | Migrate to db.state |
| `PostCommit` | triggered, hookInstalled, etc. | Migrate to db.state |
| `Phase` | phaseId (unused setter) | Remove useState, keep ref |

## Architecture

### State Layer (Already Exists)
- `db.state.get(key)` / `db.state.set(key, value)` - SQLite-backed
- `useQueryValue(db, sql)` - Reactive subscriptions
- Transitions logged to `transitions` table

### Action Pattern
All state changes via explicit actions:
```typescript
// In component event handler
const handleClick = () => {
  db.state.set('selectedPhase', phaseIndex, 'user-selection')
}

// Or via domain-specific method
db.phases.advance()
```

### Custom Hooks for Side-Effects
```
src/hooks/
├── useHuman.ts              (keep, refactor promise resolution)
├── useCaptureRenderFrame.ts (new)
├── usePollEvents.ts         (new)
├── usePollReports.ts        (new)
└── useAutoReport.ts         (new)
```

## Implementation Order

1. **Create custom hooks for side-effects** (no behavior change) ✅
2. **Refactor SmithersProvider** - most critical ✅
3. **Refactor Phase.tsx** - phase lifecycle ✅
4. **Refactor TUI components** - lower priority, simpler ✅
5. **Update tests** ✅ (all 898 tests pass)
6. **Verify lint/typecheck/tests pass** ✅

---

## Migration Complete

### Summary of Changes

**Effects Removed (State Machine Logic):**

| Component | Pattern | Replacement |
|-----------|---------|-------------|
| SmithersProvider | DB init sync effect | `useMount()` - runs once |
| SmithersProvider | Local state fallback | Removed `localRalphCount` - use DB exclusively |
| SmithersProvider | `useState` for stop/rebase | Reactive DB queries via `useQueryValue` |
| Phase | Two separate lifecycle effects | Single effect tracking `prevIsActiveRef` |
| Phase | Unused `setPhaseId` state | Removed - phaseIdRef sufficient |
| ExecutionTimeline | Inline polling effect | `usePollEvents` custom hook |
| ExecutionTimeline | Scroll sync effect | Moved to keyboard handler |
| DatabaseExplorer | Table data load effect | `usePollTableData` custom hook |
| ScrollableList | Clamp selection effect | Computed value (derive, don't sync) |
| ScrollableList | Scroll sync effect | Moved to keyboard handler |

**New Custom Hooks for Side-Effects:**

| Hook | Purpose |
|------|---------|
| `useCaptureRenderFrame` | XML tree snapshot capture |
| `usePollEvents` | Poll timeline events from DB |
| `usePollTableData` | Load table columns/data for DB explorer |

**Patterns to Follow Going Forward:**

1. **No effects as state machines** - Don't `useEffect` to watch state A and set state B
2. **All state transitions in store actions** - Use `db.state.set()` or explicit action calls
3. **Side-effects only in named hooks** - `useSubscribeToX`, `usePollY`, `useSyncZ`
4. **Derive, don't sync** - Compute values instead of storing derived state
5. **Use `useMount`/`useUnmount`** from `reconciler/hooks.ts` for lifecycle
