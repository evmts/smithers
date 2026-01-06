You are a senior software engineer working on Smithers, a React-based framework for composable AI agent prompts. Your goal is to incrementally productionize this project to shipping quality.

## Your Mission

Complete and polish Smithers until it's ready for public release on npm. Work methodically, one task at a time, with a focus on quality over speed.

## Important Memories

Before starting work, read `bash/important-memories.md` for context from previous sessions.

After completing your task, update `bash/important-memories.md` with any important learnings, decisions, or context that future sessions should know about. Keep it concise - only record truly important information like:
- Architectural decisions and their rationale
- Bugs discovered and their root causes
- Key implementation details that aren't obvious from code
- Gotchas or non-obvious behaviors
- Things that didn't work and why

## Project Context

Read these files to understand the project:
- SPEC.md - Product spec and roadmap
- README.md - Current documentation and examples
- CLAUDE.md - Development guidelines
- docs/ - Design notes
- src/ - Source code
- evals/ - Test files
- reviews/ - Codex review feedback (check for unfixed issues)

## Current State (Read First)

**Completed (✅):**
- Core renderer + executor exist and 44 tests pass
- `renderPlan()`/`executePlan()` are async (React 19 reconciler)
- Claude executor with full tool-use loop, retries, streaming
- MCP integration (stdio + HTTP transports, 9 presets)
- `<Stop>` component halts Ralph loop
- Config system (.smithersrc, smithers.config.ts, etc.)
- CLI commands fully working (init, plan, run)
- MDX/TSX file loading with rich error messages
- Terraform-style plan display and approval prompt

**Remaining:**
- Examples directory needs sophisticated demos
- Mintlify docs not set up
- npm not yet published (changesets configured)
- Test coverage gaps (see Test Matrix below)

## Priority Order (Top → Bottom)

### 1. Test Coverage (Highest Priority)
- Add CLI tests (`evals/cli.test.ts`)
- Add loader tests (`evals/loader.test.ts`)
- Add MCP integration tests (`evals/mcp.test.ts`)
- See Test Matrix section for full list

### 2. Examples + Documentation
- Add sophisticated examples in `examples/` folder
- Multi-agent orchestration example
- Tool-using research pipeline example
- Set up Mintlify docs

### 3. Release Readiness
- CI workflows for tests
- npm publish pipeline
- CONTRIBUTING + LICENSE

## Working Guidelines

1. **One Task at a Time**: Pick the highest priority incomplete task and finish it before moving on.
2. **Test Everything**: Write tests as you implement. Keep evals green.
3. **Document as You Go**: Update docs when you add/change APIs.
4. **Commit Atomically**: Make small, focused commits with descriptive messages.
5. **Check Your Work**:
   - Run `bun test` for unit tests
   - Run `bun run typecheck` for type errors
   - Spot-check CLI commands if needed
6. **Read Before Writing**: Always read existing code before modifying it.
7. **Follow Patterns**: Match the existing code style and patterns.
8. **Check Reviews**: Look at `reviews/` for feedback on recent commits that may need addressing.

## What to Do Now

1. Read `bash/important-memories.md` for context from previous sessions.
2. Assess the current state and identify the highest priority gap.
3. Pick ONE task and complete it fully.
4. Commit your changes with a clear message.
5. Update `bash/important-memories.md` with any important learnings.
6. Report what you accomplished and what should be done next.

## Quality Checklist

Before considering any task complete:
- [ ] Code compiles without errors
- [ ] Tests pass
- [ ] TypeScript types are correct (no `any` in public API)
- [ ] Code is documented with JSDoc
- [ ] Changes are committed
- [ ] Important memories updated (if applicable)

Remember: Ship quality code. It's better to do one thing well than many things poorly.

---

## Test Matrix

This section defines comprehensive test coverage targets. Tests should be added incrementally as features are completed. Current tests live in `evals/`.

### Current Coverage (44 tests passing)

| File | Coverage |
|------|----------|
| `hello-world.test.tsx` | Basic rendering + execution |
| `multi-phase.test.tsx` | Ralph Wiggum loop, state transitions, Zustand |
| `multi-agent.test.tsx` | Nested agents, orchestration, dynamic spawning |
| `code-review.test.tsx` | Tools, structured output format |
| `all-features.test.tsx` | End-to-end, error handling, composed components |
| `stop-component.test.tsx` | Stop behavior, conditional stopping |
| `error-recovery.test.tsx` | ExecutionError context, retries, graceful degradation |
| `config.test.ts` | Config loading, validation, merging |

### Test Cases Needed

#### 1. CLI Tests (`evals/cli.test.ts`)

**Command parsing:**
- [ ] `--help` shows usage for main command
- [ ] `--version` shows correct version
- [ ] Unknown command shows error + suggestions
- [ ] Unknown option shows error

**`init` command:**
- [ ] Creates hello-world template in new directory
- [ ] Creates research template
- [ ] Creates multi-agent template
- [ ] Creates in current directory (`.`)
- [ ] Skips existing files with warning
- [ ] Errors on invalid template name
- [ ] Creates package.json with correct dependencies

**`plan` command:**
- [ ] Renders MDX file to XML
- [ ] Renders TSX file to XML
- [ ] `--json` outputs JSON wrapper
- [ ] `--output` writes to file
- [ ] Errors on missing file
- [ ] Errors on directory (not file)
- [ ] Errors on file with syntax errors
- [ ] Errors on file without default export

**`run` command:**
- [ ] Executes with `--mock` mode
- [ ] `--yes` skips approval prompt
- [ ] `--dry-run` shows plan and exits
- [ ] `--verbose` shows detailed logs
- [ ] `--max-frames` limits execution frames
- [ ] `--timeout` sets per-frame timeout
- [ ] `--model` overrides Claude model
- [ ] `--max-tokens` overrides token limit
- [ ] `--config` loads specific config file
- [ ] `--output` writes result to file
- [ ] `--json` outputs JSON result
- [ ] Auto-discovers config files
- [ ] CLI options override config values
- [ ] Invalid `--max-frames` value errors cleanly
- [ ] Invalid `--timeout` value errors cleanly

#### 2. Loader Tests (`evals/loader.test.ts`)

**MDX loading:**
- [ ] Basic MDX with Claude component
- [ ] MDX with multiple components
- [ ] MDX with imports
- [ ] MDX with export default component
- [ ] MDX with expressions `{variable}`
- [ ] MDX syntax error shows line/column
- [ ] MDX with undefined component shows suggestions

**TSX/JSX loading:**
- [ ] Direct element export (`export default <Claude>...`)
- [ ] Component function export (`export default function Agent()`)
- [ ] Component with hooks (useState)
- [ ] Component with props
- [ ] Syntax error shows code frame
- [ ] Missing module error shows suggestions
- [ ] Missing default export shows available exports
- [ ] Invalid default export (not element) shows type

**Error formatting:**
- [ ] LoaderError.format() includes file path
- [ ] SyntaxLoadError.format() includes code frame
- [ ] ExportError.format() includes available exports
- [ ] InvalidElementError.format() includes actual type

#### 3. MCP Integration Tests (`evals/mcp.test.ts`)

**Server management:**
- [ ] Connect to stdio server (mock)
- [ ] Connect to HTTP server (mock)
- [ ] Disconnect cleans up resources
- [ ] Connection error handling
- [ ] Server status tracking

**Tool integration:**
- [ ] Tool discovery from MCP server
- [ ] Tool execution returns result
- [ ] Tool execution error handling
- [ ] Tool deduplication (inline wins over MCP)
- [ ] MCP tools scoped to specific Claude nodes

**Presets (smoke tests):**
- [ ] `filesystem()` preset configures correctly
- [ ] `git()` preset configures correctly
- [ ] `github()` preset configures correctly
- [ ] `sqlite()` preset configures correctly
- [ ] `memory()` preset configures correctly
- [ ] `fetch()` preset configures correctly
- [ ] `custom()` preset accepts command + args
- [ ] `http()` preset accepts URL

#### 4. Renderer Tests (`evals/renderer.test.ts`)

**renderPlan():**
- [ ] Single Claude component
- [ ] Nested Phase > Step components
- [ ] Multiple sibling components
- [ ] Components with all prop types (string, number, function, object)
- [ ] Conditional rendering (returns null)
- [ ] Array children (`{items.map(...)}`)
- [ ] Fragment children
- [ ] Text children
- [ ] Mixed element + text children

**serialize():**
- [ ] Escapes `<`, `>`, `&` in text content
- [ ] Escapes quotes in attribute values
- [ ] Handles boolean attributes
- [ ] Handles undefined/null props (omits them)
- [ ] Preserves whitespace in text
- [ ] Serializes deeply nested trees

#### 5. Executor Tests (`evals/executor.test.ts`)

**Ralph Wiggum loop:**
- [ ] Single frame execution
- [ ] Multi-frame with state transitions
- [ ] Stops at maxFrames limit
- [ ] Stops when no pending nodes
- [ ] Stops when Stop component rendered
- [ ] Content hash prevents re-execution of unchanged nodes
- [ ] Changed content triggers re-execution

**State management:**
- [ ] useState updates propagate to next frame
- [ ] Zustand store updates propagate
- [ ] State preserved across frames
- [ ] Multiple state updates in one callback

**Callbacks:**
- [ ] onFinished receives result
- [ ] onFinished can update state
- [ ] onError receives ExecutionError
- [ ] onError can trigger recovery
- [ ] onToolError called for tool failures
- [ ] Multiple callbacks in same frame all fire

**Parallel execution:**
- [ ] Subagent with parallel=true executes children concurrently
- [ ] Parallel execution results collected correctly
- [ ] Parallel failure handling

#### 6. Claude Executor Tests (`evals/claude-executor.test.ts`)

**Message handling:**
- [ ] Sends user message with serialized content
- [ ] Extracts system message from Persona
- [ ] Combines multiple Persona children
- [ ] Handles empty prompt

**Tool execution:**
- [ ] Calls tool with correct input
- [ ] Returns tool result to Claude
- [ ] Handles tool error
- [ ] Respects maxIterations limit
- [ ] Deduplicates tool names (inline wins)

**Streaming:**
- [ ] onStreamStart called at start
- [ ] onStreamDelta called for each chunk
- [ ] onStreamEnd called at completion
- [ ] Streaming can be disabled

**Error handling:**
- [ ] Rate limit triggers retry with backoff
- [ ] API error wrapped in ExecutionError
- [ ] Timeout error after configured duration
- [ ] Invalid API key error

**Mock mode:**
- [ ] Returns mock response
- [ ] Doesn't call real API
- [ ] Consistent with real mode interface

#### 7. Component Tests (`evals/components.test.ts`)

**Claude:**
- [ ] Renders children as prompt
- [ ] tools prop passed to executor
- [ ] onFinished called with result
- [ ] onError called on failure
- [ ] system prop sets system message
- [ ] retries prop configures retry behavior

**Subagent:**
- [ ] name prop appears in XML
- [ ] parallel=true enables concurrent execution
- [ ] Children executed in order when not parallel

**Phase:**
- [ ] name prop appears in XML
- [ ] Children rendered inside phase tag

**Step:**
- [ ] Children rendered as step content

**Persona:**
- [ ] role prop extracted as system message
- [ ] Multiple Personas combine roles

**Constraints:**
- [ ] Children rendered as constraints

**OutputFormat:**
- [ ] schema prop serialized
- [ ] Guides structured output parsing

**Task:**
- [ ] Tracks completion state
- [ ] Integrates with execution flow

**Stop:**
- [ ] reason prop appears in output
- [ ] Halts Ralph loop when rendered
- [ ] Conditional rendering works

#### 8. Edge Cases (`evals/edge-cases.test.ts`)

**Empty/null scenarios:**
- [ ] Agent that renders null (completes with no output)
- [ ] Agent with no Claude nodes (completes immediately)
- [ ] Empty children array
- [ ] Undefined props

**Limits:**
- [ ] Very deep nesting (10+ levels)
- [ ] Very wide trees (100+ siblings)
- [ ] Very long prompts (100k+ chars)
- [ ] Many execution frames (50+)

**Unicode/special chars:**
- [ ] Unicode in prompts
- [ ] Emoji in prompts
- [ ] Special XML chars (`<`, `>`, `&`, `"`, `'`)
- [ ] Newlines and tabs in content

**Error scenarios:**
- [ ] Callback throws error
- [ ] Infinite loop detection (same content hash)
- [ ] Circular state dependencies
- [ ] Memory pressure (many large results)

#### 9. Integration Tests (`evals/integration.test.ts`)

**Full workflows:**
- [ ] init → plan → run (mock mode)
- [ ] Config file + CLI options + execution
- [ ] Multi-phase with tool usage
- [ ] Error recovery and retry flow

**Real API tests (optional, requires API key):**
- [ ] Basic Claude call
- [ ] Tool-use round trip
- [ ] Streaming response
- [ ] MCP server integration

### Running Tests

```bash
# All tests
bun test

# Specific file
bun test evals/cli.test.ts

# With coverage (when configured)
bun test --coverage

# Watch mode
bun test --watch
```

### Test Guidelines

1. **Mock by default**: Use mock mode for all tests unless specifically testing API integration
2. **Isolate tests**: Each test should be independent, no shared state between tests
3. **Test errors**: Every feature should have tests for both success and error cases
4. **Descriptive names**: Test names should describe the scenario being tested
5. **Fast tests**: Unit tests should complete in <100ms each
6. **Integration tests**: Mark slow/integration tests so they can be run separately
