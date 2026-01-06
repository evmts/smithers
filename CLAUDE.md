# Claude Code Guidelines

## Project Overview

**Smithers** (formerly **Plue**) is a React-based framework for authoring composable AI agent prompts using JSX. It brings the React mental model to AI agent orchestration.

**Core Value Proposition:**
- Build AI agents the same way you build UIs
- Declarative component-based architecture using JSX
- React state management drives agent behavior
- Render to XML plans before execution (Terraform-style approval workflow)
- Multi-phase execution with state transitions (the "Ralph Wiggum loop")

## Architecture

### The Ralph Wiggum Loop

The execution model that drives everything:
1. Render JSX component tree to internal `SmithersNode` representation
2. Serialize tree to XML plan
3. Optionally show plan for approval
4. Execute `<Claude>` and `<Subagent>` nodes
5. `onFinished` callbacks update React state (Zustand, useState, etc.)
6. State changes trigger re-render, back to step 1
7. Loop until no pending nodes remain

### Custom React Reconciler

- Uses `react-reconciler` to build a custom renderer (like react-dom, but for agents)
- **Host Config** (`src/reconciler/host-config.ts`): Defines how React manages the custom `SmithersNode` tree
- **Mutation-based**: Nodes modified in-place rather than persistent copies
- **Synchronous rendering with React 19**: Uses `updateContainerSync()` for deterministic behavior

### Key Data Structures

```typescript
interface SmithersNode {
  type: string                      // 'claude', 'subagent', 'phase', 'step', etc.
  props: Record<string, unknown>    // Component props
  children: SmithersNode[]               // Child nodes
  parent: SmithersNode | null            // Parent reference
  _execution?: ExecutionState       // Execution status and result
}

interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown
  error?: Error
  contentHash?: string              // For change detection
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/core/types.ts` | All TypeScript interfaces |
| `src/core/render.ts` | `renderPlan()`, `createRoot()`, `serialize()` |
| `src/core/execute.ts` | `executePlan()`, Ralph Wiggum loop logic |
| `src/core/claude-agent-executor.ts` | Claude Agent SDK executor (built-in tools) |
| `src/core/claude-executor.ts` | Anthropic API SDK executor (custom tools) |
| `src/reconciler/host-config.ts` | React Reconciler host config |
| `src/reconciler/index.ts` | `createSmithersRoot()` - React reconciler setup |
| `src/components/index.ts` | Component definitions (Claude, ClaudeApi, etc.) |
| `src/debug/` | Debug observability (events, formatters, collector) |

## Components

### Agent Components

| Component | SDK | Purpose |
|-----------|-----|---------|
| `<Claude>` | Agent SDK | Main execution unit with built-in tools (Read, Edit, Bash, etc.) |
| `<ClaudeApi>` | API SDK | Direct API access for custom tool implementations |

#### `<Claude>` (Agent SDK) - Default

Uses the Claude Agent SDK with built-in tools. The SDK handles tool execution automatically.

```tsx
<Claude
  allowedTools={['Read', 'Edit', 'Bash', 'Glob', 'Grep']}
  permissionMode="acceptEdits"  // 'default' | 'acceptEdits' | 'bypassPermissions'
  maxTurns={10}
  systemPrompt="You are a helpful assistant"
  agents={{
    'code-reviewer': {
      description: 'Reviews code for quality',
      prompt: 'You are a code reviewer...',
      tools: ['Read', 'Glob', 'Grep']
    }
  }}
  onFinished={(result) => setResult(result)}
>
  Fix the bug in auth.py
</Claude>
```

#### `<ClaudeApi>` (API SDK) - Direct API Access

Uses the Anthropic API SDK directly. You provide custom tool implementations.

```tsx
<ClaudeApi
  tools={[myCustomTool]}
  system="You are a helpful assistant"
  onFinished={(result) => setResult(result)}
>
  Analyze this data
</ClaudeApi>
```

### Structural Components

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `<Subagent>` | Parallel execution boundary | `name`, `parallel` |
| `<Phase>` | Semantic phase grouping | `name` |
| `<Step>` | Individual step within a phase | none |
| `<Persona>` | Define agent role/expertise | `role` |
| `<Constraints>` | Behavioral boundaries | none |
| `<OutputFormat>` | Expected output structure | `schema` |
| `<Human>` | Require human approval | `message`, `onApprove`, `onReject` |
| `<Stop>` | Halt execution loop | `reason` |

## State Management Pattern

**Recommended**: Zustand with `create()` hook (no stale closures, always gets latest state):

```typescript
const useStore = create((set, get) => ({
  phase: 'phase1',
  setPhase: (phase) => set({ phase }),
}))
```

## Testing

- **Test runner**: Bun (`bun test`)
- **Tests located**: `evals/` directory
- **Key test files**:
  - `hello-world.test.tsx` - Basic rendering and execution
  - `multi-agent.test.tsx` - Nested agents and state coordination
  - `multi-phase.test.tsx` - Ralph loop with Zustand state transitions
  - `code-review.test.tsx` - Tool integration and MCP servers
  - `all-features.test.tsx` - Comprehensive feature test

## Development Commands

```bash
bun test              # Run all tests
bun run build         # Build the project
bun run lint          # Run linting
```

## React 19 Workarounds

The code has workarounds for React 19's async rendering model:
- `updateContainerSync()` for synchronous rendering
- Extracting `pendingProps` from fiber objects in `commitUpdate()`
- Multiple `setImmediate()` and `setTimeout()` calls to wait for async commit phase
- Flush synchronous and passive effects explicitly

## Current Development State

**Working:**
- React reconciler (with async rendering fixes)
- Ralph Wiggum loop
- Component definitions
- Rendering to XML
- Execution with mocks

**TODOs:**
1. ~~Project rename: "plue" -> "smithers"~~ (DONE)
2. Tool-use execution loop + MCP wiring in Claude executor
3. Streaming + retries + configuration surface
4. Sophisticated examples in `examples/` folder
5. MDX/TSX loading in CLI
6. Mintlify docs setup
7. npm publishing with changesets

---

## Git Commit Convention

Every commit MUST have a git note attached containing comprehensive context from the conversation that led to the commit. This should include:

- Near-verbatim chat history leading to the commit
- Design decisions and reasoning discussed
- User requirements and constraints mentioned
- Any alternatives considered and why they were rejected

### How to add git notes

```bash
# After committing
git notes add -m "$(cat <<'EOF'
[Full conversation context here]
EOF
)"

# View notes
git log --show-notes
```

### Why we do this

- Preserves the "why" behind every change
- Makes it possible to understand design decisions months later
- Creates a searchable history of product decisions
- Helps onboard new contributors with full context

## Post-Commit Hook

A Codex review hook runs after each commit. It:
- Reviews the commit with Codex
- Only saves reviews with actionable feedback (skips LGTM)
- Saves reviews to `reviews/` directory
- Auto-commits the review

To install hook on clone:
```bash
cp hooks/post-commit .git/hooks/
chmod +x .git/hooks/post-commit
```
