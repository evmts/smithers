# Smithers Testing Audit

## Executive Summary

**Current Test Coverage:**
- **3,009 passing tests** across 102 files
- **608 todo items** marking tests to be implemented
- **0 failures** in src/ and test/ directories

**Testing Philosophy:**
- Focus on boundary conditions, error cases, and corner cases
- Prefer e2e tests with no mocking when possible
- When both unit and e2e tests are possible, implement BOTH
- Use precise XML-based test definitions for e2e/eval tests
- Test boundary conditions at EVERY level up the callstack

**Eval Configuration:**
- Model: configurable
- Default model: gemini
- Initial/starting model: claude

---

## Test Coverage by Module

### Database Layer (`src/db/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `tools.test.ts` | 25 | 0 | ✅ Complete |
| `state.test.ts` | 57 | 0 | ✅ Complete |
| `agents.test.ts` | 62 | 0 | ✅ Complete |
| `tasks.test.ts` | 71 | 0 | ✅ Complete |
| `execution.test.ts` | 69 | 0 | ✅ Complete |
| `vcs.test.ts` | 45 | 0 | ✅ Complete |
| `phases.test.ts` | 58 | 0 | ✅ Complete |
| `steps.test.ts` | 52 | 0 | ✅ Complete |
| `memories.test.ts` | 71 | 0 | ✅ Complete |

### Reactive SQLite (`src/reactive-sqlite/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `database.test.ts` | 57 | 0 | ✅ Complete |
| `parser.test.ts` | 215 | 0 | ✅ Complete |
| `hooks/useQuery.test.tsx` | 22 | 0 | ✅ Complete |
| `hooks/useQueryOne.test.tsx` | 18 | 0 | ✅ Complete |
| `hooks/useQueryValue.test.tsx` | 25 | 0 | ✅ Complete |
| `hooks/useMutation.test.tsx` | 23 | 0 | ✅ Complete |
| `hooks/context.test.tsx` | 18 | 0 | ✅ Complete |

### Components (`src/components/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `Step.test.ts` | 52 | 0 | ✅ Complete |
| `Phase.test.tsx` | 38 | 0 | ✅ Complete |
| `PhaseRegistry.test.ts` | 27 | 0 | ✅ Complete |
| `Parallel.test.ts` | 31 | 0 | ✅ Complete |
| `SmithersProvider.test.ts` | 18 | 15 | 🔶 Partial |
| `Claude.test.tsx` | 103 | 49 | 🔶 Partial |
| `Ralph.test.tsx` | 36 | 0 | ✅ Complete |
| `Review.test.tsx` | 15 | 0 | ✅ Complete |
| `Worktree.test.tsx` | 12 | 28 | 🔶 Partial |

### Git Components (`src/components/Git/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `Commit.test.tsx` | 28 | 0 | ✅ Complete |
| `Notes.test.tsx` | 24 | 0 | ✅ Complete |

### JJ Components (`src/components/JJ/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `Commit.test.tsx` | 14 | 0 | ✅ Complete |
| `Describe.test.tsx` | 10 | 0 | ✅ Complete |
| `Rebase.test.tsx` | 16 | 0 | ✅ Complete |
| `Snapshot.test.tsx` | 13 | 0 | ✅ Complete |
| `Status.test.tsx` | 14 | 0 | ✅ Complete |

### Hooks Components (`src/components/Hooks/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `OnCIFailure.test.tsx` | 35 | 0 | ✅ Complete |
| `PostCommit.test.tsx` | 44 | 0 | ✅ Complete |

### MCP Components (`src/components/MCP/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `Sqlite.test.tsx` | 39 | 10 | 🔶 Partial (e2e needs Claude API) |

### Claude CLI (`src/components/agents/claude-cli/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `executor.test.ts` | 70 | 0 | ✅ Complete |
| `arg-builder.test.ts` | 38 | 0 | ✅ Complete |
| `output-parser.test.ts` | 21 | 0 | ✅ Complete |
| `message-parser.test.ts` | 38 | 0 | ✅ Complete |
| `stop-conditions.test.ts` | 43 | 0 | ✅ Complete |

### Reconciler (`src/reconciler/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `methods.test.ts` | 76 | 10 | 🔶 Partial |
| `serialize.test.ts` | 64 | 0 | ✅ Complete |
| `serialize-direct.test.ts` | 39 | 0 | ✅ Complete |
| `jsx-runtime.test.tsx` | 33 | 9 | 🔶 Partial |

### Monitor (`src/monitor/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `stream-formatter.test.ts` | 45 | 0 | ✅ Complete |
| `log-writer.test.ts` | 38 | 0 | ✅ Complete |
| `output-parser.test.ts` | 35 | 0 | ✅ Complete |
| `haiku-summarizer.test.ts` | 26 | 0 | ✅ Complete |

### Tools (`src/tools/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `registry.test.ts` | 59 | 0 | ✅ Complete |
| `ReportTool.test.ts` | 43 | 0 | ✅ Complete |

### Hooks (`src/hooks/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `index.test.ts` | 6 | 0 | ✅ Complete |
| `useRalphCount.test.ts` | 18 | 0 | ✅ Complete |
| `useHuman.test.ts` | 50 | 0 | ✅ Complete |
| `useCaptureRenderFrame.test.ts` | 33 | 0 | ✅ Complete |

### Utils (`src/utils/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `capture.test.ts` | 35 | 0 | ✅ Complete |
| `vcs.test.ts` | 45 | 0 | ✅ Complete |
| `vcs/parsers.test.ts` | 50 | 0 | ✅ Complete |
| `vcs/jj.test.ts` | 25 | 0 | ✅ Complete |
| `mcp-config.test.ts` | 40 | 0 | ✅ Complete |
| `structured-output/validator.test.ts` | 25 | 0 | ✅ Complete |
| `structured-output/zod-converter.test.ts` | 20 | 0 | ✅ Complete |
| `structured-output/prompt-generator.test.ts` | 30 | 0 | ✅ Complete |

### TUI (`src/tui/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `App.test.tsx` | 38 | 0 | ✅ Complete |
| `index.test.ts` | 0 | 12 | ❌ Needs implementation |
| `components/layout/Header.test.tsx` | 19 | 0 | ✅ Complete |
| `components/layout/TabBar.test.tsx` | 23 | 0 | ✅ Complete |
| `components/layout/StatusBar.test.tsx` | 21 | 0 | ✅ Complete |
| `hooks/useSmithersConnection.test.ts` | 20 | 18 | 🔶 Partial |
| `hooks/useClaudeChat.test.ts` | 23 | 30 | 🔶 Partial |
| `hooks/usePollEvents.test.ts` | 37 | 37 | 🔶 Partial |
| `hooks/usePollTableData.test.ts` | 27 | 27 | 🔶 Partial |
| `hooks/useReportGenerator.test.ts` | 30 | 25 | 🔶 Partial |
| `hooks/useHumanRequests.test.ts` | 44 | 0 | ✅ Complete |
| `hooks/useRenderFrames.test.ts` | 44 | 0 | ✅ Complete |

### Commands (`src/commands/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `init.test.ts` | 15 | 0 | ✅ Complete |
| `run.test.ts` | 10 | 0 | ✅ Complete |
| `monitor.test.ts` | 10 | 0 | ✅ Complete |
| `db/index.test.ts` | 14 | 0 | ✅ Complete |
| `db/state-view.test.ts` | 17 | 0 | ✅ Complete |
| `db/transitions-view.test.ts` | 19 | 0 | ✅ Complete |
| `db/executions-view.test.ts` | 23 | 0 | ✅ Complete |
| `db/stats-view.test.ts` | 18 | 0 | ✅ Complete |
| `db/current-view.test.ts` | 27 | 0 | ✅ Complete |
| `db/recovery-view.test.ts` | 23 | 0 | ✅ Complete |
| `db/help.test.ts` | 16 | 0 | ✅ Complete |
| `db/memories-view.test.ts` | 24 | 0 | ✅ Complete |

### Core/Debug (`src/core/`, `src/debug/`)

| File | Passing | Todo | Coverage |
|------|---------|------|----------|
| `core/index.test.ts` | 0 | 8 | ❌ Needs implementation |
| `debug/index.test.ts` | 0 | 34 | ❌ Needs implementation |

---

## Missing Test Categories (Todo Items)

### High Priority - E2E Tests Requiring Claude API

```xml
<test-category name="claude-e2e" priority="critical">
  <test>Claude status transitions with real CLI execution</test>
  <test>Claude with schema validation in live environment</test>
  <test>Claude with MCP tools (Sqlite) integration</test>
  <test>Claude stop conditions with real execution</test>
  <test>Claude retry logic with actual API failures</test>
</test-category>
```

### High Priority - Worktree Component

```xml
<test-category name="worktree" priority="high">
  <test>Mounting: registers task, creates worktree, reuses existing</test>
  <test>Path resolution: uses props.path, defaults to .worktrees/&lt;branch&gt;</test>
  <test>Branch handling: creates/uses existing branch, base ref</test>
  <test>Unmounting: cleanup flag, removes/keeps worktree</test>
  <test>State management: SQLite storage, status transitions</test>
  <test>Context provision: WorktreeContextValue to children</test>
  <test>XML rendering: status attributes (pending/ready/error)</test>
</test-category>
```

### Medium Priority - TUI Hooks

```xml
<test-category name="tui-hooks" priority="medium">
  <test>useSmithersConnection: polling behavior, date conversion, cleanup</test>
  <test>useClaudeChat: message handling, API key availability, errors</test>
  <test>usePollEvents: event transformation, sorting, error handling</test>
  <test>usePollTableData: column/data fetching, SQL injection prevention</test>
  <test>useReportGenerator: auto-generation, cleanup</test>
</test-category>
```

### Medium Priority - Core/Debug

```xml
<test-category name="core-debug" priority="medium">
  <test>core/index: serialize re-export, backwards compatibility</test>
  <test>debug/index: createDebugCollector, secret redaction, log levels</test>
  <test>DebugEvent type: extensibility, required properties</test>
</test-category>
```

### Low Priority - JSX Runtime Edge Cases

```xml
<test-category name="jsx-runtime" priority="low">
  <test>props with style object</test>
  <test>props with event handlers</test>
  <test>props spread behavior</test>
  <test>ElementType casting</test>
  <test>SmithersReconciler compatibility</test>
</test-category>
```

---

## Abstraction Level Testing Requirements

When a boundary condition exists at level N, test it at EVERY level up the callstack:

### Example: Database Transaction Rollback

```
Level 0: SQLite raw query error
  └── Unit test: parser.test.ts - extractWriteTables with invalid SQL
  
Level 1: ReactiveDatabase.transaction() 
  └── Unit test: database.test.ts - transaction rollback on error
  
Level 2: SmithersDB wrapper
  └── Integration test: db/execution.test.ts - fail() with rollback
  
Level 3: Component using SmithersDB
  └── Component test: Claude.test.tsx - database logging on failure
  
Level 4: Full workflow
  └── E2E test: evals/04-agent-claude.test.tsx - full agent failure flow
```

### Example: Stop Conditions

```
Level 0: Stop condition type check
  └── Unit test: stop-conditions.test.ts - checkStopConditions pure function
  
Level 1: Executor integration
  └── Unit test: executor.test.ts - stop condition triggers process kill
  
Level 2: Claude component
  └── Component test: Claude.test.tsx - stopConditions prop handling
  
Level 3: Workflow with stop
  └── E2E test: evals/13-composition-advanced.test.tsx - stop propagation
```

---

## Running Tests

```bash
# Run all tests
bun test ./src ./test

# Run specific module
bun test src/db/

# Run with coverage
bun test --coverage ./src ./test

# Run only passing (exclude todos)
bun test --only ./src ./test
```

---

## Eval Test Format

E2E eval tests should use this XML-based format:

```xml
<eval name="agent-claude-basic" model="claude" timeout="60000">
  <input>
    <prompt>Write a hello world function</prompt>
    <tools>["Read", "Write"]</tools>
  </input>
  <expected>
    <contains>function</contains>
    <contains>hello</contains>
    <stopReason>completed</stopReason>
  </expected>
  <assertions>
    <assert type="output-contains">hello world</assert>
    <assert type="tool-called">Write</assert>
    <assert type="status">complete</assert>
  </assertions>
</eval>
```

---

## Notes

1. **No Internal Mocking**: All tests use public APIs only
2. **Real Databases**: Tests use in-memory SQLite via `:memory:`
3. **Temp Directories**: Git/JJ tests create isolated temp repos
4. **Model Config**: Evals support model switching (default: gemini, initial: claude)
5. **608 Todo Items**: Marked in test files for future implementation
