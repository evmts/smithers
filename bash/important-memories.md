# Important Memories

This file contains important learnings, decisions, and context from previous Ralph sessions.

## Architectural Decisions

### React 19 Async Rendering (2026-01-05)
- React 19 reconciler requires async handling - `renderPlan()` and `executePlan()` must be async
- **RenderFrame wrapper pattern**: To get React to re-evaluate on state changes, use a wrapper component that clones children on each render. Without this, useState updates don't trigger re-renders properly.
- See `src/core/execute.ts` for the implementation

### Execution State Keying Issue (2026-01-05 - FIXED)
- **Problem**: `saveExecutionState`/`restoreExecutionState` used `contentHash` as the map key
- This caused identical `claude`/`subagent` nodes to collide - later restores marked all matching nodes as already executed
- **Solution**: Now uses stable node path (e.g., `ROOT/claude[0]/subagent[1]`) as key, stores `contentHash` inside the state for change detection
- Affected files: `src/core/execute.ts` (saveExecutionState, restoreExecutionState)
- Commit: f0e935a

### Content Hashing Fragility (2026-01-05 - FIXED)
- **Problem**: `computeContentHash` used `JSON.stringify` on arbitrary prop values, throwing for `BigInt`/circular refs
- **Solution**: Implemented `safeStringify()` helper with try/catch that handles BigInt, symbols, circular refs safely
- Falls back to `[unstringifiable:type]` for edge cases
- Affected file: `src/core/execute.ts:434-461`
- Commit: f0e935a

### Loader ESM Compatibility (2026-01-05 - FIXED)
- **Problem**: `loadTsxFile()` used bare file paths in `import()`, failing in Node ESM and with paths containing spaces
- **Solution**: Use `pathToFileURL()` to convert file paths to proper `file://` URLs before importing
- Affected file: `src/cli/loader.ts`
- Commit: 9706bfc

### MCP Client Type Issues (2026-01-05 - FIXED)
- **Problem**: MCP Client constructor had invalid `capabilities: { tools: {} }`, causing TypeScript errors
- **Solution**: Use `capabilities: {}` instead, and properly type-check `result.isError` before using
- Affected file: `src/mcp/manager.ts`
- Commit: 008714d

### Mock Executor JSON Detection (2026-01-05 - FIXED)
- **Problem**: Mock executor's regex for extracting JSON from prompts couldn't handle nested structures (arrays, nested objects)
- The regex `/\{[^}]*\}/` would stop at the first `}` character, even if it was inside a nested array like `{"issues":[]}`
- **Solution**: Implemented `extractJsonFromText()` helper that properly handles brace matching, string escaping, and validates JSON
- Affected file: `src/core/execute.ts:590-640`
- All 17/17 tests now pass

### MCP Client Capabilities (2026-01-05 - FIXED)
- **Problem**: MCP Client was initialized with empty `capabilities: {}`, not advertising tool support to servers
- This could prevent tool-related flows from working with MCP servers
- **Solution**: Added `sampling: { tools: {} }` to capabilities to properly advertise tool support
- Affected file: `src/mcp/manager.ts:68-73`
- Commit: 0b75ffb

### Documentation Fix - Init Command (2026-01-05 - FIXED)
- **Problem**: `docs/cli/init.mdx` showed `tsconfig.json` with `"jsxImportSource": "react"` but didn't include `react` in dependencies
- Would cause runtime errors when JSX runtime tried to resolve
- **Solution**: Added `react: "^19.0.0"` to dependencies section and updated `@types/react` to `^19.0.0`
- Affected file: `docs/cli/init.mdx:52-60`
- Commit: 0b75ffb

### Execution Robustness Fixes (2026-01-05 - FIXED)
- **Fixed 4 issues from Codex reviews**:
  1. MCP capabilities mismatch - removed `sampling.tools` since client doesn't implement sampling handler
  2. ContentHash safety - ensure contentHash is always set when saving execution state (fallback to compute)
  3. Streaming implementation - use proper Anthropic SDK streaming API (`client.messages.stream()`) with `text` and `streamEvent` handlers
  4. Safe serialization - added `safeStringify()` helper for tool results to handle BigInt, circular refs, etc.
- All issues were preventing potential runtime failures or misleading behavior
- Commit: 3c9fc96

## Project History

- Originally named "Plue", renamed to "Smithers" on 2026-01-05
- Uses React reconciler with mutation mode for JSX → XML rendering
- Ralph Wiggum Loop: Agent runs repeatedly until all tasks complete

## What Works

- 17/17 tests passing
- Core reconciler renders JSX to XML correctly
- Async rendering with React 19
- State management with Zustand patterns documented
- Claude executor with full tool-use loop and MCP integration
- MDX and TSX/JSX file loading
- All known bugs fixed (execution state keying, content hashing, ESM compatibility, MCP types)

### MCP Integration (2026-01-05 - IMPLEMENTED + FIXED)
- **Feature**: MCP (Model Context Protocol) server integration allows agents to connect to MCP servers and use their tools
- **Implementation**:
  - Added `MCPManager` initialization in `executePlan()`
  - Created `prepareTools()` helper to connect to MCP servers and merge with inline tools
  - Updated `executeWithClaude()` to accept `toolsOverride` parameter
  - Convert MCP tools to Smithers Tool format with execute wrappers
  - Clean up MCP connections when execution completes
- **Important**: Tools are passed via `toolsOverride` parameter instead of mutating `node.props.tools` to prevent contentHash changes that would trigger infinite re-execution
- **FIXED** (2026-01-05):
  1. ✅ MCP tool scoping fixed - now uses `getToolsForServer()` instead of `getAllTools()` to prevent tool leakage (Commit 9ef5d50)
  2. ✅ Tool name collision detection added - warns when MCP and inline tools have same name (Commit 9ef5d50)
  3. ✅ Tool deduplication improved - removes ALL MCP tools with same name when inline tool collides (Commit 127ec43, 44d1642)
     - Previously only removed first matching MCP tool, leaving duplicates if multiple MCP servers exposed same tool
     - Now iterates backwards through tools array and removes all matches
  4. Mock mode doesn't use prepared tools (acceptable for testing but inconsistent)
- Commit: f8588ee, 9ef5d50, 127ec43, 44d1642

### Configuration System (2026-01-05 - IMPLEMENTED + IMPROVED)
- **Feature**: CLI configuration file support for persistent settings
- **Implementation**:
  - Config auto-discovery: `.smithersrc`, `.smithersrc.json`, `smithers.config.{js,mjs,ts}`
  - Searches from cwd up to filesystem root
  - CLI flags override config file settings
  - Export `defineConfig`, `loadConfig`, `mergeOptions` for programmatic use
  - Supported options: model, maxTokens, maxFrames, timeout, autoApprove, mockMode, verbose
- **TypeScript Config Files** (2026-01-05):
  - `.ts` config files work correctly because Smithers CLI uses Bun runtime (shebang: `#!/usr/bin/env bun`)
  - Bun natively supports TypeScript imports, so no loader needed
  - Added helpful error message if user tries to run in Node.js without TS loader
  - JSDoc documentation clarifies Bun requirement
- Commit: 9ef5d50, [current]

### Stop Component (2026-01-05 - IMPLEMENTED)
- **Feature**: `<Stop>` component to halt Ralph Wiggum loop execution
- **Implementation**:
  - Add `findStopNode()` in `executePlan()` to detect Stop before executing pending nodes
  - Optional `reason` prop for debugging/logging
  - Comprehensive test suite in `evals/stop-component.test.tsx`
  - All 44/44 tests pass including Stop component tests
- Commit: 9ef5d50

### Task Component (2026-01-05 - IMPLEMENTED)
- **Feature**: `<Task>` component for trackable tasks with completion state
- **Implementation**:
  - Added `TaskProps` interface with `done` boolean prop
  - Export Task and TaskProps from main index
  - Ready for future iteration tracking features
- Commit: 9ef5d50

### Manual Test Suite (2026-01-05 - IMPLEMENTED)
- **Feature**: Manual test scripts for real Claude API execution
- **Implementation**:
  - Created `manual-tests/` directory with 3 comprehensive tests
  - Test 1 (01-basic-execution.tsx): Basic text generation without tools
  - Test 2 (02-with-tools.tsx): Tool calling and agentic loop with calculator tool
  - Test 3 (03-multi-phase.tsx): Multi-phase agent with Zustand state management
  - Each test includes clear progress logging, plan display, and success/failure reporting
  - Tests require ANTHROPIC_API_KEY and make real API calls
  - Documented in `manual-tests/README.md` with troubleshooting guide
- **Purpose**: Verify real API integration works end-to-end, separate from mocked unit tests
- **Manual tests verified as ready to run** (2026-01-05):
  - All imports resolve correctly (Claude, Phase, Step, renderPlan, executePlan, Tool, zustand)
  - API key validation present in all tests
  - Error handling with try/catch blocks present
  - Correct Smithers API usage verified
- **Next Step**: Run these tests manually with a real API key to verify functionality
- Commit: 0a191b7

### Human Component (2026-01-05 - IMPLEMENTED)
- **Feature**: `<Human>` component for interactive approval points
- **Implementation**:
  - Pauses execution and waits for human approval before continuing
  - Props: message, onApprove, onReject, children
  - Integrates with `executePlan` via `onHumanPrompt` callback option
  - Auto-approves when no `onHumanPrompt` provided (useful for testing)
  - Tracks approved Human nodes using path:contentHash key to prevent infinite loops
  - Falls through to continue execution after approval if no onApprove callback
- **Key Design Decisions**:
  - Uses path + contentHash as unique key (not just path) to distinguish different Human nodes at same tree position
  - Skip already-approved Human nodes to avoid re-prompting
  - Check for unapproved Human nodes before exiting loop (prevents premature exit)
- **Tests**: 7 comprehensive tests in `evals/human-component.test.tsx`
  - Auto-approval, custom prompts, approval/rejection flows
  - Sequential Human nodes, infinite loop prevention
  - All 51 tests passing (44 existing + 7 new)
- **Documentation**: Updated README.md with detailed examples and prop documentation
- **Known Limitation** (from Codex review fbc5b57): `findHumanNode` returns first Human node in tree. If that node is approved but stays in tree (no onApprove), later Human nodes won't be found. Consider passing approvedHumanNodes into walk to find first *unapproved* node.
- Commits: d3913f6, fbc5b57

### CLI Test Coverage (2026-01-05 - IMPLEMENTED)
- **Feature**: Comprehensive CLI integration tests covering all commands and options
- **Implementation**:
  - Created `evals/cli.test.ts` with 34 tests covering init, plan, and run commands
  - Tests command parsing (--help, --version, unknown commands/options)
  - Tests init command (templates, directory creation, package.json generation)
  - Tests plan command (MDX/TSX rendering, JSON output, file output, error cases)
  - Tests run command (mock mode, all CLI flags, config files, output formats)
  - All 34 tests passing
  - Test timeout increased to 15s for slow CLI integration tests
- **Key Learnings**:
  - TSX test files must import from absolute source paths during testing (can't use 'smithers' package name)
  - CLI output format is "Execution Complete" (capital C) not "execution complete"
  - JSON output may have info lines before actual JSON, need to parse with regex
  - Commander.js shows help for unknown commands (exit 0) rather than erroring
- **Total Test Count**: 88 passing tests (51 previous + 34 new CLI tests + 3 other new tests)
- **Note**: 1 pre-existing test failure in `evals/subagent-scheduling.test.tsx` unrelated to CLI work
- Commit: [current]

## What's Next (Priority Order)

1. **Test Coverage** (Highest Priority)
   - ✅ CLI tests (`evals/cli.test.ts`) - 34 tests (DONE)
   - Add Loader tests (`evals/loader.test.ts`) - MDX/TSX loading, error handling
   - Add MCP integration tests (`evals/mcp.test.ts`) - server management, tool integration
   - Add Renderer tests (`evals/renderer.test.ts`) - renderPlan(), serialize()
   - Add Executor tests (`evals/executor.test.ts`) - Ralph loop, state management
   - Add Component tests (`evals/components.test.ts`) - all component behaviors
   - Add Edge case tests (`evals/edge-cases.test.ts`)
   - See Test Matrix in CLAUDE.md for full coverage targets

2. **Examples + Documentation**
   - Create/update examples to showcase MCP integration
   - Add multi-agent orchestration example
   - Document MCP server configuration patterns
   - Set up Mintlify docs
   - Keep docs aligned with API changes

3. **Release Readiness**
   - Add changesets for all recent changes
   - Set up CI workflows (tests, typecheck, lint)
   - Create npm publish pipeline
   - Add CONTRIBUTING.md and LICENSE files
