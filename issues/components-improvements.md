# Components Improvements Plan

## Summary

Analysis of `src/components/` including agents subdirectory. Focus on SmithersProvider.tsx, agents/SmithersCLI.ts, and agents/claude-cli/*.

---

## Issues Found (Prioritized)

### P1: Critical / Bugs

1. **Global mutable state for orchestration tokens (SmithersProvider.tsx:26-29)**
   - File: `src/components/SmithersProvider.tsx#L26-L29`
   - Issue: `_activeOrchestrationToken` is a module-level global, not concurrency-safe for multiple simultaneous orchestrations
   - Fix: Store token in context or use WeakMap keyed by execution

2. **Race condition in useEffectOnValueChange cleanup (SmithersProvider.tsx:619-682)**
   - File: `src/components/SmithersProvider.tsx#L619-L682`
   - Issue: `completionCheckTimeoutRef` may not be cleared if component unmounts during async operations
   - Fix: Add cleanup return in useEffectOnValueChange

3. **Potential memory leak in orchestrationControllers Map (SmithersProvider.tsx:26)**
   - File: `src/components/SmithersProvider.tsx#L26`
   - Issue: If orchestration errors without calling signal functions, entries remain in Map
   - Fix: Add timeout-based cleanup or weak references

### P2: Code Quality / Type Safety

4. **`any` type in output-parser.ts (output-parser.ts:12, 94)**
   - File: `src/components/agents/claude-cli/output-parser.ts#L12`
   - Issue: `structured?: any` loses type safety
   - Fix: Use `unknown` and require narrowing

5. **Implicit `any` in parseStreamJson (output-parser.ts:94)**
   - File: `src/components/agents/claude-cli/output-parser.ts#L94`
   - Issue: `let event: any` should be typed
   - Fix: Define StreamEvent interface

6. **Missing error handling for Bun.spawn in SmithersCLI (SmithersCLI.ts:246)**
   - File: `src/components/agents/SmithersCLI.ts#L246`
   - Issue: No check if `bun` command exists
   - Fix: Add existence check or better error message

7. **TODO comment in Claude.tsx (Claude.tsx:58)**
   - File: `src/components/Claude.tsx#L58`
   - Issue: `// TODO abstract all the following block of lines into named hooks`
   - Fix: Extract to custom hooks: `useAgentState`, `useTailLog`, `useProgressHandler`

### P3: Missing Tests

8. **No unit tests for SmithersCLI execution logic**
   - File: `src/components/agents/SmithersCLI.ts`
   - Issue: Only type interface tests exist (SmithersCLI.test.ts:11-17)
   - Add: Tests for `generateSmithersScript`, `writeScriptFile`, `executeScript` helpers

9. **Missing tests for ClaudeCodeCLI.ts re-exports**
   - File: `src/components/agents/ClaudeCodeCLI.ts`
   - Issue: No dedicated test file, relies on claude-cli tests
   - Add: Verify exports match expected interface

10. **Many TODO tests in components.test.tsx (lines 409-424)**
    - File: `src/components/components.test.tsx#L409-L424`
    - Issue: Phase component tests marked as `.todo()`
    - Implement: Phase lifecycle, skipIf, callbacks

### P4: Refactoring Opportunities

11. **Duplicate permission flag handling (arg-builder.ts:18-22)**
    - File: `src/components/agents/claude-cli/arg-builder.ts#L18-L22`
    - Issue: `acceptEdits` and `bypassPermissions` have identical implementations
    - Fix: Consider consolidating or documenting the distinction

12. **Magic numbers without constants (executor.ts:46, SmithersCLI.ts:241)**
    - File: `src/components/agents/claude-cli/executor.ts#L46`
    - Issue: `300000` (5 min), `600000` (10 min) hardcoded
    - Fix: Extract to named constants

13. **Long function in SmithersProvider (SmithersProvider.tsx:449-593)**
    - File: `src/components/SmithersProvider.tsx#L449-L593`
    - Issue: useMount block is 144 lines, hard to test
    - Fix: Extract setup logic into separate functions

14. **Stream parsing could use shared types (message-parser.ts, output-parser.ts)**
    - File: `src/components/agents/claude-cli/message-parser.ts`
    - Issue: Both files parse CLI output with overlapping concerns
    - Fix: Consider shared parsing utilities

---

## Implementation Tasks

### Task 1: Fix Global State Issues
```
Files: SmithersProvider.tsx
- Replace _activeOrchestrationToken with context-based solution
- Add orchestration controller cleanup on timeout
- Add cleanup return in useEffectOnValueChange
```

### Task 2: Improve Type Safety
```
Files: output-parser.ts
- Replace `any` with `unknown` for structured
- Define StreamEvent interface
- Add proper type guards
```

### Task 3: Add Missing Constants
```
Files: executor.ts, SmithersCLI.ts
- Extract DEFAULT_TIMEOUT_MS = 300000
- Extract SMITHERS_SCRIPT_TIMEOUT_MS = 600000
```

### Task 4: Add SmithersCLI Tests
```
File: SmithersCLI.test.ts
- Test generateSmithersScript (mock Claude CLI)
- Test writeScriptFile creates executable
- Test executeScript handles errors
- Test timeout behavior
```

### Task 5: Extract Claude.tsx Hooks
```
File: Claude.tsx
- Create useAgentState hook
- Create useTailLog hook
- Create useProgressHandler hook
- Reduce Claude component complexity
```

### Task 6: Implement TODO Tests
```
Files: components.test.tsx, Worktree.test.tsx, MCP/Sqlite.test.tsx
- Prioritize Phase lifecycle tests
- Add Worktree task registration tests
```

---

## Test Coverage Analysis

### Well-Tested (✓)
- `arg-builder.ts` - Comprehensive unit tests
- `output-parser.ts` - Good coverage
- `stop-conditions.ts` - Full coverage
- `message-parser.ts` - Good coverage
- `SmithersProvider.ts` - Type and integration tests

### Needs More Tests (!)
- `executor.ts` - Integration tests skipped (require CLI)
- `SmithersCLI.ts` - Only type tests, no execution tests
- `ClaudeCodeCLI.ts` - No dedicated tests (re-export file)

---

## Execution Order

1. **Type safety fixes** (output-parser.ts) - Low risk, immediate benefit
2. **Constants extraction** (executor.ts, SmithersCLI.ts) - Low risk
3. **SmithersCLI tests** - Medium effort, improves confidence
4. **Global state fix** (SmithersProvider.tsx) - Higher risk, test carefully
5. **Hook extraction** (Claude.tsx) - Larger refactor, do last

---

## Verification Commands

```bash
# Run component tests
bun test src/components/

# Typecheck
bun run build

# Specific test files
bun test src/components/agents/claude-cli/
bun test src/components/SmithersProvider.test.ts
```
