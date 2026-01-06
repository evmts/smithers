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
- **TUI Integration (NEW - Highest Priority)**
- Examples directory needs sophisticated demos
- Mintlify docs not set up
- npm not yet published (changesets configured)
- Test coverage gaps (see Test Matrix below)

## Priority Order (Top → Bottom)

### 1. TUI Integration (HIGHEST PRIORITY - New Feature)

**Goal:** Build an interactive terminal UI for the Ralph Wiggum loop using OpenTUI.

**Phase 1: Research & Documentation (START HERE)**
Before writing any code, create comprehensive documentation:

1. Create `docs/tui-research.md` documenting:
   - OpenTUI architecture (core + React reconciler)
   - How @opentui/react works (useRenderer, useKeyboard, useTerminalDimensions)
   - Integration patterns with existing React reconciler
   - Performance considerations (sub-millisecond frame times)
   - Dependencies: Zig (required for build), @opentui/core, @opentui/react

2. Create `docs/tui-design.md` with:
   - UI mockups (ASCII art) for the tree view
   - Keyboard navigation spec (arrow keys, enter to drill down)
   - Agent output panel design
   - State management approach (how TUI state integrates with Ralph loop)
   - Component hierarchy

3. Create `docs/vhs-recording.md` documenting:
   - VHS tape file format and commands
   - Recording workflows for demos
   - CI integration with vhs-action

**Phase 2: Implementation**
After research docs are approved, implement:

**2a. Worktree Component (Parallel Agent Isolation)**
Create `<Worktree>` component that runs agents in git worktrees:

```tsx
<Worktree path="./worktrees/feature-a" branch="feature-a">
  <Claude>Implement feature A</Claude>
</Worktree>
```

1. Create `src/components/Worktree.tsx`:
   - Props: `path` (worktree location), `branch` (optional, creates new branch)
   - Creates git worktree at path before execution
   - Sets cwd for all child Claude/ClaudeApi components
   - Cleans up worktree on completion (optional `cleanup` prop)

2. Document in `docs/worktree-design.md`:
   - Use case: parallel agents working on different features
   - Git worktree lifecycle management
   - Error handling (worktree already exists, not in git repo)
   - Integration with Ralph loop

3. Implementation details:
   - `git worktree add <path> -b <branch>` to create
   - `git worktree remove <path>` to cleanup
   - Pass modified `cwd` through React context to child Claude nodes

**2b. TUI Components**

1. **Tree View Component** (`src/tui/TreeView.tsx`)
   - Render SmithersNode tree as navigable TUI
   - Arrow key navigation (up/down to move, right to expand, left to collapse)
   - Highlight current selection
   - Show execution status icons (pending/running/complete/error)

2. **Agent Detail Panel** (`src/tui/AgentPanel.tsx`)
   - Press Enter on a Claude node to view details
   - Show agent's prompt/output
   - Streaming output display
   - Back navigation (Escape or Backspace)

3. **Layout Component** (`src/tui/Layout.tsx`)
   - Split pane: tree on left, detail on right
   - Responsive to terminal size (useTerminalDimensions)
   - Status bar at bottom (frame count, elapsed time)

4. **Integration with Ralph Loop**
   - Hook into executePlan() to update TUI on each frame
   - Real-time status updates during execution
   - Pause/resume capability from TUI

**Phase 3: VHS Demo Recording**
1. Create `demos/` directory with .tape files
2. Record key workflows:
   - Basic agent execution
   - Multi-phase workflow
   - Error recovery
   - Tree navigation

**Phase 4: Interactive CLI Commands**
Add Claude Code-style slash commands to the CLI for real-time control:

1. Document in `docs/cli-commands.md`:
   - `/pause` - Pause the Ralph loop
   - `/resume` - Resume execution
   - `/status` - Show current execution state
   - `/tree` - Show the current SmithersNode tree
   - `/focus <path>` - Focus on a specific node
   - `/skip` - Skip current pending node
   - `/inject <prompt>` - Inject additional context into next execution
   - `/abort` - Abort current execution

2. Implementation in `src/cli/interactive.ts`:
   - Use readline or similar for command input during execution
   - Parse `/` prefixed commands
   - Integrate with executePlan() control flow
   - Display command help with `/help`

**Phase 5: GitHub Action**
Design and implement a GitHub Action for running Smithers agents in CI/CD:

1. Create `docs/github-action-design.md`:
   - Action inputs (agent file, config, mock mode, API key secret)
   - Action outputs (result JSON, artifacts)
   - Example workflows
   - Security considerations (API key handling)

2. Implement action in `.github/actions/smithers-run/`:
   ```yaml
   # Example usage:
   - uses: smithers-ai/smithers-action@v1
     with:
       agent: ./agents/deploy-review.tsx
       config: ./smithers.config.ts
       mock: false
     env:
       ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
   ```

3. Action features:
   - Run any .mdx/.tsx agent file
   - Output results as job summary
   - Artifact upload for agent outputs
   - Configurable approval gates (for Human component)
   - Integration with VHS for GIF generation of runs

**Key Resources:**
- OpenTUI: https://github.com/sst/opentui
- @opentui/react: https://www.npmjs.com/package/@opentui/react
- VHS: https://github.com/charmbracelet/vhs
- VHS GitHub Action: https://github.com/charmbracelet/vhs-action

**Technical Notes:**
- OpenTUI uses react-reconciler (same as our SmithersNode renderer)
- Need Zig installed for building OpenTUI native layer
- VHS requires ttyd and ffmpeg on PATH
- OpenTUI hooks: useRenderer, useKeyboard, useTerminalDimensions, useOnResize

### 2. Test Coverage
- Add CLI tests (`evals/cli.test.ts`)
- Add loader tests (`evals/loader.test.ts`)
- Add MCP integration tests (`evals/mcp.test.ts`)
- See Test Matrix section for full list

### 3. Examples + Documentation (COMPREHENSIVE)
The `examples/` directory needs rich, real-world examples:

**Basic Examples:**
- `examples/hello-world/` - Simplest possible agent
- `examples/file-processor/` - Read files, transform, write output
- `examples/git-helper/` - Common git operations

**Intermediate Examples:**
- `examples/code-reviewer/` - Review PRs with structured feedback
- `examples/research-pipeline/` - Multi-phase research with citations
- `examples/test-generator/` - Generate tests for existing code

**Advanced Examples:**
- `examples/multi-agent-orchestrator/` - Coordinator + worker agents
- `examples/parallel-worktrees/` - Multiple agents in git worktrees
- `examples/human-in-loop/` - Approval gates with Human component
- `examples/mcp-integration/` - Using MCP servers for external tools
- `examples/rate-limited-batch/` - Processing many items with ClaudeProvider

**Each example must have:**
- `README.md` explaining the use case
- `agent.tsx` or `agent.mdx` - the main agent file
- `smithers.config.ts` - configuration
- Sample input/output data where applicable

**Mintlify Docs:**
- Set up mintlify.json
- API reference auto-generated from JSDoc
- Interactive examples with CodeSandbox embeds

### 3.5. API Documentation (CRITICAL)
**Every API and functionality MUST be properly documented:**

1. **Component Reference** (`docs/components/`):
   - `claude.md` - Claude component with all props
   - `claude-api.md` - ClaudeApi component with all props
   - `claude-provider.md` - Provider with rate limiting, usage tracking
   - `subagent.md` - Subagent orchestration
   - `phase.md` / `step.md` - Structural components
   - `worktree.md` - Git worktree isolation
   - `human.md` - Human-in-the-loop approval
   - `stop.md` - Execution control
   - `output.md` / `file.md` - Output components

2. **Core API** (`docs/api/`):
   - `render-plan.md` - Rendering JSX to SmithersNode
   - `execute-plan.md` - Ralph Wiggum loop execution
   - `serialize.md` - XML serialization
   - `types.md` - All TypeScript interfaces

3. **Guides** (`docs/guides/`):
   - `getting-started.md` - Quick start tutorial
   - `state-management.md` - Using Zustand/useState
   - `mcp-integration.md` - MCP server setup
   - `rate-limiting.md` - ClaudeProvider configuration
   - `error-handling.md` - Error recovery patterns
   - `testing.md` - Testing agents with mock mode

4. **Documentation Standards**:
   - Every public export must have JSDoc
   - Every component prop must be documented
   - Include code examples for every API
   - Cross-reference related concepts

### 4. Release Readiness
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
2. **Check and respond to Codex reviews in `reviews/`** - Address any actionable feedback.
3. Assess the current state and identify the highest priority gap.
4. Pick ONE task and complete it fully.
5. Commit your changes with a clear message.
6. Update `bash/important-memories.md` with any important learnings.
7. Report what you accomplished and what should be done next.

### Responding to Codex Reviews

The `reviews/` directory contains automated code reviews from Codex. For each review:
1. Read the review file (e.g., `reviews/abc1234.md`)
2. Identify actionable feedback (ignore simple "LGTM" reviews)
3. If there's actionable feedback:
   - Create a fix for the issue
   - Commit the fix with message referencing the review
   - Delete the review file after addressing it
4. Track addressed reviews in `bash/important-memories.md`

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

#### 9. Worktree Tests (`evals/worktree.test.ts`)

**Worktree creation:**
- [ ] Creates worktree at specified path
- [ ] Creates new branch if specified
- [ ] Uses existing branch if it exists
- [ ] Errors if not in git repo
- [ ] Errors if path already exists (non-worktree)
- [ ] Handles existing worktree gracefully

**Worktree execution:**
- [ ] Child Claude components run in worktree cwd
- [ ] Multiple agents in same worktree work correctly
- [ ] Worktree context passed through React context

**Worktree cleanup:**
- [ ] cleanup=true removes worktree on completion
- [ ] cleanup=false preserves worktree
- [ ] Cleanup handles uncommitted changes
- [ ] Cleanup errors don't crash execution

**Parallel worktrees:**
- [ ] Multiple Worktree components can run in parallel
- [ ] Each worktree has isolated filesystem
- [ ] No conflicts between parallel worktree agents

#### 10. TUI Tests (`evals/tui.test.ts`)

**TreeView component:**
- [ ] Renders SmithersNode tree correctly
- [ ] Arrow up/down navigates between nodes
- [ ] Arrow right expands node children
- [ ] Arrow left collapses node
- [ ] Enter key selects agent node
- [ ] Shows correct execution status icons
- [ ] Handles empty tree
- [ ] Handles deeply nested tree (10+ levels)

**AgentPanel component:**
- [ ] Displays selected agent's prompt
- [ ] Displays agent's output/result
- [ ] Escape returns to tree view
- [ ] Handles agents without output
- [ ] Streaming output updates in real-time

**Layout component:**
- [ ] Renders tree and panel in split view
- [ ] Responds to terminal resize
- [ ] Status bar shows frame count
- [ ] Status bar shows elapsed time

**TUI integration:**
- [ ] TUI updates on each Ralph frame
- [ ] Running status shown during execution
- [ ] Complete status shown when done
- [ ] Error status shown on failure

#### 10. Integration Tests (`evals/integration.test.ts`)

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
