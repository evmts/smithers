# Python Implementation Review

**Date:** 2026-01-21
**Scope:** smithers_py/ - Full Python port review
**Status:** Action items identified

---

## TL;DR

The port captures the right high-level architecture (React-like render → reconcile → commit → execute), but has **inconsistent state/db abstractions**, **event-handler wiring bugs**, and **async/sync mismatches** that will cause correctness issues. Focus first on **unifying the DB/state layer**, **fixing handler plumbing**, and **hardening the tick loop execution model**.

---

## P0: Critical Issues (Fix First)

| Issue | Severity | Effort | Details |
|-------|----------|--------|---------|
| Duplicate SqliteStore classes | High | L | `state/sqlite.py` vs `db/database.py` with different schemas |
| Handler plumbing broken | High | M | JSX handlers stored in `NodeHandlers` but EventSystem/TickLoop check `node.on_finished` directly |
| Task exceptions never retrieved | Medium | S | `task.done()` checked but `task.exception()` never called → runtime warnings |
| ClaudeExecutor silent failure | Medium | S | If pydantic_ai missing, `Agent=None` causes confusing TypeError |

---

## Architecture Concerns

### Two Competing DB Layers (Must Unify)

```
┌─────────────────────────────────────────────────────────┐
│ state/sqlite.py   → execution_state, execution_transitions │
│ db/database.py    → state table (async interface)      │
│ PhaseRegistry     → creates own tables, bypasses both  │
└─────────────────────────────────────────────────────────┘
```

**Recommendation:** Keep `SmithersDB` as canonical database access. Make `state.SqliteStore` a thin wrapper over `SmithersDB.connection` using the **same schema**. Remove/rename duplicate `db.database.SqliteStore`.

### Context Type Mixing Encourages Impurity

- Render `Context` includes `db: SmithersDB`, enabling accidental writes during render
- Render purity is documented but not enforced

**Action:** Provide a render-only DB proxy (read-only) or pass only query methods that are safe. Enforce "no writes during render" by wrapping `SmithersDB.connection.execute` with a guard during Phase 2.

### PhaseRegistry Bypasses DB Layer

- Creates tables itself using raw `db_connection.execute()` with direct commits

**Action:** Move phase/step tables into central schema+migrations, or explicitly treat PhaseRegistry as embedded module under `SmithersDB`.

---

## Code Quality Issues

### Naming/Import Collisions
- Multiple `SqliteStore` classes in different modules = confusion, incorrect imports
- **Action:** Rename one (e.g., `ExecutionStateStore`) and ensure only one exported publicly

### Print-based Logging
- `TickLoop` uses `print()` with emojis; server uses `logging`
- **Action:** Replace `print()` in core engine/executors with `logging` + structured fields

### Async Style Inconsistencies
- Tick loop is async, but uses synchronous sqlite operations (can block event loop)
- `SmithersDB` supports async but many callers use `db.connection` directly
- **Action:** Either use `aiosqlite` consistently, or run sync DB operations in `asyncio.to_thread`

### Type Clarity
- Many `Any` context types, plus `Node = Any` placeholder
- **Action:** Define `Node` as proper Pydantic discriminated union; add `Protocol` for `Context`

---

## Error Handling Bugs

### Task Lifecycle (Likely Runtime Warnings)
```python
# Current: task.done() checked but exception never retrieved
if task.done():
    # Missing: task.exception() or task.result()
    pass

# Fix: Clear exception to avoid "Task exception was never retrieved"
if task.done():
    try:
        task.result()
    except Exception as e:
        record_failure(node_id, e)
```

### Lease Manager Usage Incomplete
- `_execute_node_with_lease` starts heartbeat and releases lease
- No explicit "acquire lease" call visible
- **Action:** Ensure API is: acquire → heartbeat → release; handle "lease not acquired" as no-op

### EventSystem DB Event Recording
- `_record_event` uses `execution_id=self.db.current_execution_id` which can be `None` or stale
- **Action:** Pass `execution_id` explicitly into `EventSystem` constructor or `handle_agent_completion`

---

## Test Coverage Gaps (Priority Order)

1. **Event handler wiring + atomic state writes** (High)
   - Build `ClaudeNode` via `jsx("claude", {"on_finished": fn}, ...)` 
   - Assert handler runs after completion and state writes committed
   - Test both snake_case (`on_finished`) and camelCase (`onFinished`)

2. **Tick loop correctness** (High)
   - mounted → start task → complete → handler runs → state flush → next render sees updated state
   - Stale result suppression when node unmounts

3. **SQLite state store audit log** (Medium)
   - Set/delete operations, transitions recorded, commit atomicity

4. **Resume/orphan recovery path** (Medium)
   - Lease recovery policy (RETRY) and cancellation behavior

5. **XML serialization snapshot tests** (Low)
   - Stable formatting and correct escaping

---

## Performance Concerns

### Full Deep-Copy Snapshots Every Frame
```python
# Current: dominates runtime as state grows
def snapshot(self):
    data = self._read_all()
    return copy.deepcopy(data)

# Fix: Remove deepcopy, return MappingProxyType for immutability signal
from types import MappingProxyType
def snapshot(self):
    return MappingProxyType(self._read_all())
```

### Per-Write SELECT During Commit
- `SqliteStore.commit()` calls `self.get(op.key)` for each op to compute `old_value`
- **Fix:** Batch fetch old values for all keys in one query

### Sync SQLite in Async Tick Loop
- Using sync `sqlite3` in asyncio loop stalls other coroutines
- **Simple fix:** Move DB ops to `asyncio.to_thread`
- **Better fix:** Unify around `aiosqlite`

---

## API Design Issues

### Enormous Export Surface
- `__init__.py` exports everything → semver stability hard
- **Action:** Create small "public API" module (e.g., `smithers_py.api`)

### Handler API Confusion
- Supports both snake_case and camelCase events
- Plus `handlers` field, plus direct attributes (`on_finished`)
- **Action:** Pick one canonical representation (`node.handlers.on_finished`) with compatibility shims

### Render Purity Not Encoded
- Users can mutate anything; failures show up as subtle bugs
- **Action:** Enforce via runtime guards (read-only context + store proxies)

---

## Prioritized Roadmap

### P0 (Correctness) - Do First
1. Unify/rename SqliteStore classes and schemas (L)
2. Fix handler plumbing end-to-end (M) - `node.handlers.<...>` not `node.on_finished`
3. Handle completed task exceptions properly (S)
4. Make ClaudeExecutor fail fast if dependency missing (S)

### P1 (Stability/Maintainability)
5. Replace `print()` with `logging` in engine/executors (S-M)
6. Make execution_id explicit everywhere (S-M)
7. Add minimal integration test harness around TickLoop + in-memory DB (M-L)

### P2 (Performance - When Needed)
8. Snapshot optimization - avoid deepcopy (S now, L later)
9. Batch old-value reads during commit (M)
10. Move DB IO off event loop or adopt aiosqlite consistently (L)

---

## Guardrails

- **Event callbacks may silently never fire** - Add integration test asserting handler ran
- **Hidden deadlocks/stalls** - Log warnings when snapshot/commit exceed 50ms
- **Schema drift between modules** - One schema file + migrations, prohibit ad-hoc table creation
