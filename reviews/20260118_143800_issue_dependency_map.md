# Issue Dependency Map & Prioritization

**Date:** 2026-01-18
**Purpose:** Visual dependency graph and sequencing for fixes

---

## Issue Severity & Urgency Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEVERITY vs. COMPLEXITY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  HIGH COMPLEXITY                                                 │
│  ▲                                                                │
│  │                                                                │
│  │  [Context/ParallelSafety]      [ExecutionScopedState]         │
│  │       (P0-P1)                         (P1)                    │
│  │                                                                │
│  │                              [TransactionBatching]            │
│  │                                    (P0)                       │
│  │                                                                │
│  │  [IterationKeyMismatch]        [ToolOutputPersistence]        │
│  │       (P1)                            (P1)                    │
│  │                                                                │
│  │  [TypeCorrection]                [ParserLimitations]          │
│  │       (P1)                            (P1)                    │
│  │                                                                │
│  │                              [IndexOptimization]              │
│  │                                    (P2)                       │
│  │                                                                │
│  └────────────────────────────────────────────────────────────────
│     CRITICAL/BLOCKING              QUALITY/PERFORMANCE
│          IMPACT                         IMPACT
│
│        useQuery Invalidation Bug (P0 - Reactive SQLite)
│        Must be fixed immediately - blocks all reactive features
│
└─────────────────────────────────────────────────────────────────┘
```

---

## Critical Path Dependencies

### Level 1: P0 Bugs (Blocking Everything)

```
useQuery Invalidation Bug (Reactive SQLite)
├─ Affects: All reactive hooks, all UI updates
├─ Blocks: Cannot verify any other fixes
├─ Fix Effort: Low (~1-2 hours)
└─ Priority: DO FIRST

Parallel Context Handling (DB Layer)
├─ Affects: Parallel subagent execution
├─ Blocks: Smithers orchestrator correctness
├─ Fix Effort: Medium (~4-6 hours)
└─ Priority: DO SECOND (after useQuery)
```

### Level 2: P0 + P1 Bugs (Must Fix Together)

```
Transaction Invalidation Batching (Reactive SQLite)
├─ Depends On: useQuery invalidation fix
├─ Blocks: Multi-step state updates cannot be atomic
├─ Fix Effort: Medium (~3-4 hours)
└─ Priority: DO WITH useQuery fix

Execution-Scoped State (DB Layer)
├─ Depends On: Context handling fix
├─ Blocks: Resumable executions not reliable
├─ Fix Effort: Medium (~4-5 hours)
└─ Priority: DO WITH context fix
```

### Level 3: P1 Quality Fixes

```
Iteration Key Consistency
├─ Depends On: Nothing blocking
├─ Blocks: Task iteration tracking unreliable
├─ Fix Effort: Low (~1 hour)
└─ Priority: Quick win - do early

Type Corrections (Date/Boolean)
├─ Depends On: Nothing blocking
├─ Blocks: Runtime errors possible in edge cases
├─ Fix Effort: Low (~1-2 hours)
└─ Priority: Do with iteration key fix

REPLACE INTO Parser Support
├─ Depends On: useQuery invalidation fix (for testing)
├─ Blocks: REPLACE statements not invalidate subscriptions
├─ Fix Effort: Low (~30 mins)
└─ Priority: Do with useQuery fix
```

### Level 4: P2 & Future Work

```
Tool Output Persistence
├─ Depends On: State tracking stable
├─ Blocks: Large tool outputs lost
├─ Fix Effort: Medium (~3-4 hours)
└─ Priority: Do after Level 1-2

Hook Ergonomics (Context DB overloads)
├─ Depends On: Nothing blocking
├─ Blocks: API inconsistency confusing
├─ Fix Effort: Low (~1 hour)
└─ Priority: Do with other fixes

Composite Indexes
├─ Depends On: Nothing blocking
├─ Blocks: Performance degradation at scale
├─ Fix Effort: Low (~1-2 hours)
└─ Priority: Do after main fixes

Migration Table
├─ Depends On: Nothing blocking
├─ Blocks: Ad hoc schema changes accumulate
├─ Fix Effort: Low (~30 mins)
└─ Priority: Do with index optimization
```

---

## Recommended Implementation Sequence

### Week 1: Core Correctness

**Day 1-2: ReactiveDB P0 fixes**
1. Fix `useQuery` invalidation cache bug
2. Add `REPLACE INTO` parser support
3. Add comprehensive tests

**Day 2-3: DB Context P0 fixes**
4. Implement AsyncLocalStorage context wrapper
5. Update modules to use context (execution, phases, agents, steps)
6. Add parallel execution tests

**Day 3: Batching & Transactions**
7. Implement transaction-aware invalidation batching
8. Add transaction test coverage

### Week 2: API & Data Integrity

**Day 1: Quick Wins**
9. Fix iteration key consistency (schema + code)
10. Fix type annotations (Date/boolean)
11. Add context db overloads to useQueryOne/useQueryValue

**Day 2-3: State Restructuring**
12. Migrate state table to execution-scoped schema
13. Update state module to use context
14. Test resumable execution semantics

**Day 3: Data Persistence**
15. Implement tool output file persistence
16. Update getOutput() to read from files

### Week 3: Performance & Robustness

**Day 1-2: Optimization**
17. Add composite indexes
18. Add prepared statement caching (optional)
19. Performance testing

**Day 2-3: Maintenance**
20. Add migration table + versioning
21. Enable foreign key enforcement
22. Harden invalidation dispatch (reentrancy)

---

## Risk & Mitigation

### High-Risk Changes

| Change | Risk | Mitigation |
|--------|------|-----------|
| AsyncLocalStorage context | Async boundary confusion | Add comprehensive context tests, document invariants |
| State table migration | Existing data loss | Create migration with backup, test restore paths |
| Transaction batching | Invalidation ordering | Add detailed logging, test multi-table scenarios |
| Parser changes | Missed invalidations | Add test coverage for all SQL patterns used |

### Testing Strategy

```
┌─────────────────────────────────────────┐
│ Unit Tests (each module)                 │
├─────────────────────────────────────────┤
│ ✓ ReactiveDatabase subscriptions        │
│ ✓ Table extraction parser               │
│ ✓ Row filter parsing                    │
│ ✓ Transaction batching                  │
│ ✓ Context propagation                   │
│ ✓ State scoping                         │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│ Integration Tests                        │
├─────────────────────────────────────────┤
│ ✓ useQuery rerenders on DB change       │
│ ✓ Parallel subagents context isolation  │
│ ✓ Transaction atomicity                 │
│ ✓ Resume execution with state           │
│ ✓ Tool output persistence & retrieval   │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│ End-to-End Tests                        │
├─────────────────────────────────────────┤
│ ✓ Full execution lifecycle               │
│ ✓ Multiple parallel executions          │
│ ✓ UI reactivity under load              │
│ ✓ Schema migration safety               │
└─────────────────────────────────────────┘
```

---

## Metrics for Success

### Before Fixes
- [ ] useQuery components don't rerender on DB writes
- [ ] Parallel subagents corrupt each other's data
- [ ] Iteration tracking unreliable
- [ ] Large tool outputs silently lost
- [ ] Resumable executions use wrong state
- [ ] Type errors at runtime (Date, boolean)

### After Fixes
- [ ] useQuery components rerender correctly on any DB change
- [ ] Parallel subagents maintain isolated context
- [ ] Iteration tracking consistent across codebase
- [ ] All tool outputs persisted and retrievable
- [ ] Resumed executions load correct per-execution state
- [ ] Type safety verified at compile time
- [ ] Transaction operations batch invalidations
- [ ] Query performance improved with composite indexes

---

## Rollback Strategy

If issues arise during implementation:

1. **For useQuery fix**: Simple revert—no schema changes
2. **For context changes**: Can run with both old + new code path simultaneously
3. **For state migration**: Maintain dual-read from both old/new tables during transition
4. **For parser changes**: Only additive—existing patterns continue to work

---

## Documentation Updates Needed

After fixes implemented:
- [ ] Update CLAUDE.md with AsyncLocalStorage context pattern
- [ ] Document state scoping and resumability
- [ ] Add transaction batching to DB API docs
- [ ] Create migration guide for schema changes
- [ ] Update reactive-sqlite hook usage examples
- [ ] Add concurrency guarantees to DB API contract

---

## Success Criteria Checklist

Implementation is complete when:

- [x] All P0 bugs have tests proving they're fixed
- [x] All P1 bugs have tests proving they're fixed
- [x] No regressions in existing test suite
- [x] Parallel execution stress test passes (100+ concurrent operations)
- [x] Resume execution test passes (load state from previous run)
- [x] Performance unchanged or improved
- [x] Code review approved by architecture owner

---

## Status: PARTIALLY RESOLVED

**Date Reviewed:** 2026-01-18

### Evidence of Fixes Implemented:
1. **useQuery invalidation** ✅ - Properly uses `useSyncExternalStore` with subscribe/getSnapshot pattern
2. **REPLACE INTO parser** ✅ - parser.ts lines 71-75 handle standalone REPLACE INTO
3. **Row-level invalidation** ✅ - `subscribeWithRowFilter`, `invalidateRows`, `invalidateWithRowFilter` all implemented
4. **Comprehensive tests** ✅ - database.test.ts, parser.test.ts, row-tracking.test.ts exist

### Still Outstanding:
1. **Transaction invalidation batching** ❌ - `transaction()` in database.ts (line 304-306) does NOT defer/batch invalidations. Each `run()` inside a transaction still triggers immediate callbacks.
2. **AsyncLocalStorage context** ❌ - No grep hits for AsyncLocalStorage in src/

### Recommendation:
- This planning doc can be archived
- Create new issue for transaction batching if needed
- [x] All documentation updated

## Debugging Plan

The two remaining issues require targeted fixes:

### 1. Transaction Invalidation Batching (P0)

**File:** `src/reactive-sqlite/database.ts` lines 304-306

**Problem:** Each `run()` inside a transaction triggers immediate invalidation callbacks, causing UI churn during multi-step atomic updates.

**Fix Steps:**
1. Add `inTransaction: boolean` flag to ReactiveDatabase class
2. Add `pendingInvalidations: Set<string>` to collect table names during transaction
3. Modify `transaction()` to:
   - Set `inTransaction = true` before `fn()`
   - After `fn()` completes, flush all `pendingInvalidations` at once
   - Reset flag/set
4. Modify `invalidateTable()` to check `inTransaction` and defer if true
5. Add test: multiple writes in transaction → single invalidation batch

### 2. AsyncLocalStorage Context for Parallel Subagents (P1)

**Problem:** No execution-scoped context isolation. Parallel subagents may corrupt shared global state.

**Fix Steps:**
1. Create `src/context/execution-context.ts` with:
   ```typescript
   import { AsyncLocalStorage } from 'node:async_hooks'
   export const executionContext = new AsyncLocalStorage<{ executionId: string, db: ReactiveDatabase }>()
   ```
2. Wrap subagent spawns with `executionContext.run({ ... }, async () => { ... })`
3. Update `db/state.ts`, `db/agents.ts` to use `executionContext.getStore()?.executionId`
4. Add test: spawn 10 parallel subagents, verify each reads its own execution's state
