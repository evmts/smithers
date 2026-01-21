# Test Coverage Audit

**Philosophy:**
- 100% coverage including boundary conditions and error cases
- Mix of mocked tests and E2E (no mocks)
- E2E with no mocks is most important

---

## Current State

```
Source Files:     246
Test Files:       183
Coverage:         ~74% of files have tests
```

### What's Good ✅

1. **Strong E2E suite** in `evals/` - 14 real orchestration tests
2. **Integration tests** in `test/` - reconciler, CLI, orchestration semantics
3. **Error case coverage** - 270+ error-related test cases found
4. **DB modules** - Every module has comprehensive tests

### What's Missing ❌

---

## Missing Test Files (No Tests At All)

### Priority 1: Core Hooks (Agent Execution)

| File | Criticality | Notes |
|------|-------------|-------|
| `src/hooks/useClaude.ts` | HIGH | Core agent hook, 460 LOC, no tests |
| `src/hooks/useAmp.ts` | HIGH | Core agent hook, 430 LOC, no tests |
| `src/hooks/useCodex.ts` | HIGH | Core agent hook, 360 LOC, no tests |
| `src/hooks/useReview.ts` | MEDIUM | Review hook, no tests |
| `src/hooks/useSmithersSubagent.ts` | MEDIUM | Subagent hook, no tests |

**Issue:** The most important hooks have ZERO test coverage.

### Priority 2: Control Plane (CLI Runner)

| File | Criticality | Notes |
|------|-------------|-------|
| `src/control-plane/discover.ts` | HIGH | File discovery, no tests |
| `src/control-plane/runner.ts` | HIGH | Execution runner, no tests |
| `src/control-plane/glob.ts` | MEDIUM | Glob utilities, no tests |
| `src/control-plane/grep.ts` | MEDIUM | Grep utilities, no tests |
| `src/control-plane/status.ts` | MEDIUM | Status tracking, no tests |

**Issue:** Entire control-plane directory has NO tests.

### Priority 3: Components

| File | Criticality | Notes |
|------|-------------|-------|
| `src/components/Codex.tsx` | MEDIUM | Agent component, no tests |
| `src/components/ClaudeApi.tsx` | MEDIUM | API agent, no tests |
| `src/components/ExecutionScope.tsx` | HIGH | Execution gating, no tests |
| `src/components/WorktreeProvider.tsx` | MEDIUM | Worktree context, no tests |
| `src/components/Each.tsx` | LOW | Iterator component, no tests |
| `src/components/If.tsx` | LOW | Conditional, no tests |
| `src/components/Stop.tsx` | LOW | Stop signal, no tests |
| `src/components/Subagent.tsx` | MEDIUM | Subagent spawning, no tests |
| `src/components/Task.tsx` | MEDIUM | Task wrapper, no tests |
| `src/components/Persona.tsx` | LOW | System prompt, no tests |
| `src/components/Constraints.tsx` | LOW | Constraints, no tests |

### Priority 4: SuperSmithers

| File | Criticality | Notes |
|------|-------------|-------|
| `src/supersmithers/analyzer.ts` | HIGH | Plan analyzer, no tests |
| `src/supersmithers/plugin.ts` | MEDIUM | Plugin system, no tests |
| `src/supersmithers/vcs.ts` | MEDIUM | VCS integration, no tests |
| `src/supersmithers/SuperSmithers.tsx` | HIGH | Main component, no tests |

### Priority 5: TUI

| File | Criticality | Notes |
|------|-------------|-------|
| `src/tui/state.ts` | MEDIUM | State management, no tests |
| Most TUI components | LOW | UI components, minimal tests |

---

## Missing Test Types

### 1. E2E Tests for Agent Execution

**Current:** Evals use `SMITHERS_MOCK_MODE` - no actual CLI execution.

**Missing:** Real E2E tests that:
- Actually spawn Claude/Amp/Codex CLI
- Verify real output parsing
- Test retry behavior with real failures
- Test timeout handling

**Proposed:** Create `test/e2e/` directory with:
```
test/e2e/
├── claude-execution.test.ts  # Real Claude CLI
├── amp-execution.test.ts     # Real Amp CLI
├── workflow-complete.test.ts # Full workflow E2E
└── error-recovery.test.ts    # Real error scenarios
```

### 2. Boundary Condition Tests

**Missing cases:**

| Area | Missing Boundary Tests |
|------|------------------------|
| Agent hooks | maxRetries=0, maxTurns=1, timeout=0 |
| Phase/Step | Empty phases, single step, 100+ steps |
| DB modules | MAX_INT values, empty strings, unicode |
| Middleware | Empty middleware chain, circular refs |
| Streaming | Incomplete chunks, malformed JSON |

### 3. Error Case Tests

**Partially covered, missing:**

| Area | Missing Error Tests |
|------|---------------------|
| useClaude | CLI crash, parse failure, network timeout |
| useAmp | Invalid mode, CLI not installed |
| Phase | skipIf throws, onStart throws |
| Step | VCS snapshot fails, commit fails |
| SmithersProvider | DB connection lost mid-execution |

---

## Test Quality Issues

### 1. Over-Mocking in Unit Tests

```typescript
// Claude.test.tsx - tests logic without actual behavior
test('phaseActive defaults to true when no PhaseContext', () => {
  const phase = null
  const phaseActive = phase?.isActive ?? true  // Testing JS, not component
  expect(phaseActive).toBe(true)
})
```

Many tests verify JavaScript behavior, not component behavior.

### 2. Missing Integration Between Components

No tests for:
- Phase → Step → Claude flow
- Ralph iteration with real state changes
- Parallel execution with actual concurrency

### 3. Incomplete Middleware Coverage

| Middleware | Has Tests | Missing Coverage |
|------------|-----------|------------------|
| retry | ✅ | Jitter randomization |
| validation | ✅ | Async validator timeout |
| compose | ✅ | 10+ middleware chain |
| extract-json | ✅ | Deeply nested JSON |
| rate-limiting | ✅ | Burst scenarios |

---

## Recommended Actions

### Immediate (Create Issues)

1. **ISSUE-001:** Add tests for useClaude/useAmp/useCodex hooks
2. **ISSUE-002:** Add tests for control-plane directory
3. **ISSUE-003:** Add real E2E tests (no mocks)
4. **ISSUE-004:** Add boundary condition tests
5. **ISSUE-005:** Add missing component tests

### Test Structure Recommendation

```
src/
├── hooks/
│   ├── useClaude.ts
│   ├── useClaude.test.ts      # Unit tests (mocked CLI)
│   └── useClaude.e2e.test.ts  # E2E tests (real CLI)
test/
├── e2e/
│   ├── agent-execution.test.ts
│   ├── workflow-complete.test.ts
│   └── error-recovery.test.ts
├── integration.test.ts
└── orchestration-semantics.test.tsx
evals/
├── 01-basic-rendering.test.tsx
└── ... (existing evals)
```

---

## Coverage Targets

| Category | Current | Target |
|----------|---------|--------|
| Files with tests | 74% | 100% |
| Line coverage | Unknown | 90%+ |
| Branch coverage | Unknown | 85%+ |
| Error case coverage | ~60% | 95%+ |
| E2E test count | ~15 | 30+ |
