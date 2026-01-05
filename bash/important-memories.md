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

## What's Next (Priority Order)

1. **Runtime Integration** (Highest Priority)
   - Wire MCP servers into Claude executor (connect mcpServers prop to MCPManager)
   - Add configuration surface for retries, timeouts, streaming
   - Test real Claude API execution (not just mocks)

2. **Execution Semantics**
   - Implement `<Task>` component with `done` prop for completion tracking
   - Implement `<Stop>` component to signal Ralph loop termination
   - Ensure onError callbacks can trigger re-rendering and recovery

3. **CLI UX + MDX**
   - Implement Terraform-style plan display with syntax highlighting
   - Add approval prompt with edit capability
   - Wire `--auto-approve`/`--plan` flags to executor options
   - Test MDX entrypoint end-to-end

4. **Examples + Documentation**
   - Create/update examples to showcase MCP integration
   - Add multi-agent orchestration example
   - Document MCP server configuration patterns
   - Keep docs aligned with API changes

5. **Release Readiness**
   - Add changesets for all recent changes
   - Set up CI workflows (tests, typecheck, lint)
   - Create npm publish pipeline
   - Add CONTRIBUTING.md and LICENSE files
