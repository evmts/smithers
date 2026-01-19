# Database Layer Improvements

## Summary

Research on `src/db/` reveals a solid modular database layer with good test coverage on core modules (state, agents, execution, phases, steps, tasks, vcs, memories, tools, human, build-state). Several test files contain only `test.todo()` stubs needing implementation.

---

## Priority 1: Missing Test Implementations (High)

### 1.1 utils.test.ts - All tests are TODO
**File:** `src/db/utils.test.ts`
**Lines:** 9-63

Implement tests for:
- `uuid()` - 5 tests (UUID v4 format, uniqueness, string type, length, structure)
- `now()` - 5 tests (ISO8601 format, current timestamp, type, parseable, timezone)
- `parseJson()` - 22 tests (parsing, default values, types, edge cases)

### 1.2 query.test.ts - All tests are TODO
**File:** `src/db/query.test.ts`
**Lines:** 35-75

Implement 25 tests for QueryModule:
- Basic query operations
- Type inference
- Error cases
- Parameter handling
- SQL injection prevention

### 1.3 artifacts.test.ts - All tests are TODO
**File:** `src/db/artifacts.test.ts`
**Lines:** 54-104

Implement 28 tests for ArtifactsModule:
- CRUD operations
- Error cases
- Agent relationships
- Metadata handling
- Type validation
- Edge cases

### 1.4 render-frames.test.ts - All tests are TODO
**File:** `src/db/render-frames.test.ts`
**Lines:** 48-109

Implement 28 tests for RenderFramesModule:
- Store operations
- Get/GetBySequence operations
- List operations
- Count/NextSequence operations
- Edge cases

### 1.5 index.test.ts - All tests are TODO
**File:** `src/db/index.test.ts`
**Lines:** 18-96

Implement 54 tests for SmithersDB integration:
- Factory creation
- Schema initialization
- Migration handling
- Reset behavior
- Module integration
- Context sharing
- Error handling
- Re-exports

---

## Priority 2: Code Quality Issues (Medium)

### 2.1 Missing `isClosed` check in tools.ts:start
**File:** `src/db/tools.ts`
**Lines:** 33-44

The `start()` function doesn't check `rdb.isClosed` before operations, unlike other modules.

```typescript
// Current:
start: (agentId: string, toolName: string, input: Record<string, any>): string => {
  const currentExecutionId = getCurrentExecutionId()
  if (!currentExecutionId) throw new Error('No active execution')
  // ... operations

// Fix:
start: (agentId: string, toolName: string, input: Record<string, any>): string => {
  if (rdb.isClosed) return uuid()
  const currentExecutionId = getCurrentExecutionId()
  if (!currentExecutionId) throw new Error('No active execution')
  // ... operations
```

### 2.2 Missing `isClosed` check in human.ts:requestInteractive
**File:** `src/db/human.ts`
**Lines:** 152-164

The `requestInteractive()` function doesn't check `rdb.isClosed`.

```typescript
// Fix:
requestInteractive: (prompt: string, config: InteractiveSessionConfig): string => {
  if (rdb.isClosed) return uuid()
  const executionId = getCurrentExecutionId()
  // ...
```

### 2.3 Missing `isClosed` check in human.ts:completeInteractive
**File:** `src/db/human.ts`
**Lines:** 176-200

The `completeInteractive()` function doesn't check `rdb.isClosed`.

### 2.4 Missing `isClosed` check in human.ts:cancelInteractive
**File:** `src/db/human.ts`
**Lines:** 203-209

The `cancelInteractive()` function doesn't check `rdb.isClosed`.

### 2.5 Missing `isClosed` check in build-state.ts
**File:** `src/db/build-state.ts`

Multiple functions missing isClosed checks:
- `ensureRow()` line 47-54
- `get()` line 56-60
- `updateState()` line 62-73
- `cleanup()` line 75-93
- `handleBrokenBuild()` line 95-134
- `markFixed()` line 137-144

---

## Priority 3: Type Safety Improvements (Medium)

### 3.1 Use `any` type in list() methods
Several modules use `rdb.query<any>()` instead of proper row types:

**agents.ts:186** - `list()` uses `<any>`
**vcs.ts:216** - `getCommits()` uses `<any>`
**vcs.ts:251** - `getSnapshots()` uses `<any>`
**vcs.ts:288** - `getReviews()` uses `<any>`
**vcs.ts:297** - `getBlockingReviews()` uses `<any>`
**vcs.ts:325** - `getReports()` uses `<any>`
**vcs.ts:334** - `getCriticalReports()` uses `<any>`
**execution.ts:118** - `list()` uses `<any>`
**artifacts.ts:71** - `list()` uses `<any>`

### 3.2 Missing stream_summary column in agents schema
**File:** `src/db/agents.ts`
**Lines:** 27-47

The `AgentRow` interface includes `stream_summary` but the schema initialization in `createAgentsModule` test setup doesn't include it. The main schema.sql does include it, but test setup schemas are incomplete.

---

## Priority 4: Minor Improvements (Low)

### 4.1 Inconsistent null handling patterns
Some modules use `?? undefined` others use `?? null`. Should standardize:
- `vcs.ts` uses `?? undefined` for parsed JSON fields
- `state.ts` uses `?? null` 

### 4.2 Missing invalidate() calls
**File:** `src/db/state.ts:39`
`state.set()` calls `rdb.invalidate(['state'])` but other modules don't call invalidate after writes. This may be intentional but should be documented.

### 4.3 vcs-queue.ts missing test file
**File:** `src/db/vcs-queue.ts`
No corresponding `vcs-queue.test.ts` exists.

---

## Implementation Tasks

### Task 1: Implement utils.test.ts tests
```bash
# Implement 32 tests for uuid(), now(), parseJson()
```

### Task 2: Implement query.test.ts tests  
```bash
# Implement 25 tests for QueryModule
```

### Task 3: Implement artifacts.test.ts tests
```bash
# Implement 28 tests for ArtifactsModule
```

### Task 4: Implement render-frames.test.ts tests
```bash
# Implement 28 tests for RenderFramesModule  
```

### Task 5: Implement index.test.ts tests
```bash
# Implement 54 tests for SmithersDB integration
```

### Task 6: Add missing isClosed checks
```bash
# Fix tools.ts, human.ts, build-state.ts
```

### Task 7: Create vcs-queue.test.ts
```bash
# Create test file for VCSQueueModule
```

---

## Test Results Before

- **Passing tests:** ~350+
- **TODO tests:** ~200+
- **Failed tests:** 0

## Expected Outcome

- All TODO tests implemented
- isClosed checks added for consistency
- Type safety improved in list() methods
- New vcs-queue.test.ts file created
