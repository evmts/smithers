# PluDom Design Document

## Research Summary

### How React Custom Renderers Work

React's architecture separates the **reconciler** (diffing algorithm) from the **renderer** (platform-specific output). The `react-reconciler` package exposes this, letting us build custom renderers.

**Key insight**: React doesn't care what you render to. React DOM renders to browser DOM, React Native renders to native views, Ink renders to terminal. We render to XML plans.

### Host Config

A custom renderer implements a "host config" - an object with methods the reconciler calls:

```typescript
const hostConfig = {
  // Create element nodes
  createInstance(type, props) → node
  createTextInstance(text) → textNode

  // Tree manipulation
  appendInitialChild(parent, child)
  appendChild(parent, child)
  removeChild(parent, child)
  insertBefore(parent, child, beforeChild)

  // Updates
  commitUpdate(node, type, oldProps, newProps)
  commitTextUpdate(textNode, oldText, newText)

  // Lifecycle
  prepareForCommit(container)
  resetAfterCommit(container)
  finalizeInitialChildren(node, type, props)

  // Config
  supportsMutation: true  // We use mutation mode
}
```

### Rendering Modes

1. **Mutation mode** (`supportsMutation: true`): Nodes are modified in place. This is what DOM uses. **We'll use this.**

2. **Persistent mode**: Immutable trees, changes clone the whole subtree. More complex, not needed for us.

---

## PluDom Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Code                             │
│  MDX/JSX → <Claude>, <Phase>, <Step>, <Subagent>, etc.      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      PluDom Renderer                         │
│  react-reconciler + Plue Host Config → PluNode Tree         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       Serializer                             │
│  PluNode Tree → XML String (the "plan")                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       Executor                               │
│  XML Plan → Claude SDK calls → Results                      │
│  Results → onFinished callbacks → State updates             │
│  State updates → Re-render → New plan (Ralph Wiggum loop)   │
└─────────────────────────────────────────────────────────────┘
```

### Internal Node Representation

```typescript
interface PluNode {
  type: string                    // 'claude', 'phase', 'step', 'TEXT', etc.
  props: Record<string, any>      // Component props
  children: PluNode[]             // Child nodes
  parent: PluNode | null          // Parent reference

  // Execution state (used by executor)
  _execution?: {
    status: 'pending' | 'running' | 'complete' | 'error'
    result?: any
    error?: Error
  }
}
```

### Host Components

These are the primitive "elements" our renderer understands (like `div`, `span` in DOM):

| Component | Purpose | Props |
|-----------|---------|-------|
| `claude` | Main agent execution | `tools`, `onFinished`, `onError`, SDK passthrough |
| `subagent` | Parallel execution boundary | `name`, `parallel`, same as claude |
| `phase` | Semantic phase grouping | `name` |
| `step` | Semantic step marker | (children only) |
| `persona` | Agent role definition | `role` |
| `constraints` | Rules/limitations | (children only) |
| `output-format` | Expected output schema | `schema` |

### Exported Components (User-Facing)

React treats lowercase as host components and uppercase as composite. We export uppercase wrappers:

```typescript
// These map to host components
export function Claude(props: ClaudeProps): JSX.Element {
  return createElement('claude', props)
}

export function Subagent(props: SubagentProps): JSX.Element {
  return createElement('subagent', props)
}

export function Phase(props: PhaseProps): JSX.Element {
  return createElement('phase', props)
}

export function Step(props: StepProps): JSX.Element {
  return createElement('step', props)
}

export function Persona(props: PersonaProps): JSX.Element {
  return createElement('persona', props)
}

export function Constraints(props: ConstraintsProps): JSX.Element {
  return createElement('constraints', props)
}

export function OutputFormat(props: OutputFormatProps): JSX.Element {
  return createElement('output-format', props)
}
```

---

## Component Details

### `<Claude>`

The core component. Represents a Claude agent invocation.

```tsx
interface ClaudeProps {
  tools?: Tool[]                    // MCP servers to connect
  onFinished?: (output: any) => void  // Called with structured output
  onError?: (error: Error) => void    // Called on failure
  children: ReactNode                 // The prompt content
  // ... additional SDK props pass through
}
```

**Rendering**: Serializes to `<claude>` XML with children as prompt.

**Execution**:
1. Serialize children to XML/text prompt
2. Connect tools as MCP servers
3. Call Claude SDK
4. Parse response
5. Call `onFinished` with result
6. State update triggers re-render

### `<Subagent>`

A parallel execution boundary. Children run concurrently with siblings.

```tsx
interface SubagentProps {
  name?: string          // Identifier for logs/debugging
  parallel?: boolean     // Default true - run without blocking
  children: ReactNode    // Usually contains <Claude>
}
```

**Rendering**: Serializes to `<subagent name="...">` XML.

**Execution**: Spawns concurrent execution. Parent doesn't wait unless `parallel={false}`.

```tsx
// Example: Two researchers run in parallel
<>
  <Subagent name="researcher-1">
    <Claude onFinished={setFindings1}>Research topic A</Claude>
  </Subagent>

  <Subagent name="researcher-2">
    <Claude onFinished={setFindings2}>Research topic B</Claude>
  </Subagent>

  {/* This renders when both complete and state updates */}
  {findings1 && findings2 && (
    <Claude>Combine: {findings1} and {findings2}</Claude>
  )}
</>
```

### `<Phase>` and `<Step>`

Semantic markers for organizing plans. No special execution behavior.

```tsx
<Phase name="research">
  <Step>Search for relevant papers</Step>
  <Step>Extract key findings</Step>
</Phase>

<Phase name="synthesis">
  <Step>Identify common themes</Step>
  <Step>Write summary</Step>
</Phase>
```

**Rendering**:
```xml
<phase name="research">
  <step>Search for relevant papers</step>
  <step>Extract key findings</step>
</phase>
<phase name="synthesis">
  <step>Identify common themes</step>
  <step>Write summary</step>
</phase>
```

### `<Persona>`, `<Constraints>`, `<OutputFormat>`

Prompt structure components. Render to semantic XML.

```tsx
<Claude>
  <Persona role="security expert">
    10 years experience in application security.
  </Persona>

  <Constraints>
    - Focus on OWASP Top 10
    - Provide severity ratings
  </Constraints>

  <OutputFormat schema={{ vulnerabilities: 'array' }}>
    Return JSON with vulnerabilities array.
  </OutputFormat>

  Review the authentication module.
</Claude>
```

---

## Execution Model: The Ralph Wiggum Loop

Named after the simple, iterative approach: run the agent, get result, repeat.

### Loop Pseudocode

```typescript
async function executePlan(element: ReactElement): Promise<any> {
  const root = createPluRoot()

  while (true) {
    // 1. Render JSX to PluNode tree
    const tree = render(element, root)

    // 2. Serialize to XML plan
    const xmlPlan = serialize(tree)

    // 3. Find executable nodes (claude/subagent with pending status)
    const executables = findPendingExecutables(tree)

    if (executables.length === 0) {
      // Nothing left to execute - we're done
      return extractResults(tree)
    }

    // 4. Execute nodes
    // - Sequential claude nodes run one at a time
    // - Subagent nodes run in parallel
    const sequential = executables.filter(n => n.type === 'claude')
    const parallel = executables.filter(n => n.type === 'subagent')

    // Run first sequential + all parallel
    await Promise.all([
      sequential[0] && executeNode(sequential[0]),
      ...parallel.map(executeNode)
    ])

    // 5. State updates from onFinished trigger re-render
    // The while loop continues with the new tree
  }
}
```

### Frame-by-Frame Execution

Each "frame" is one iteration of the loop:

1. **Render**: Current state → JSX → PluNode tree → XML
2. **Display**: Show plan to user (Terraform-style approval)
3. **Execute**: Run pending `<Claude>` / `<Subagent>` nodes
4. **Update**: `onFinished` callbacks update React state
5. **Re-render**: State change triggers new render
6. **Repeat**: Loop until no pending executables

---

## API Design

### Core Functions

```typescript
// Render JSX to XML string (no execution)
export async function renderPlan(element: ReactElement): Promise<string>

// Execute the plan with Ralph Wiggum loop
export async function executePlan(
  element: ReactElement,
  options?: ExecuteOptions
): Promise<ExecutionResult>

// Create a root for manual control
export function createRoot(): PluRoot

interface ExecuteOptions {
  autoApprove?: boolean      // Skip Terraform-style approval
  onPlan?: (xml: string) => void  // Called before each execution
  maxFrames?: number         // Safety limit
}

interface ExecutionResult {
  output: any                // Final output
  frames: number             // How many iterations
  history: FrameHistory[]    // Full execution trace
}
```

### Low-Level API

```typescript
interface PluRoot {
  render(element: ReactElement): PluNode
  unmount(): void
}

// Serialize tree to XML
export function serialize(node: PluNode): string

// Find nodes ready for execution
export function findPendingExecutables(tree: PluNode): PluNode[]

// Execute a single node
export async function executeNode(node: PluNode): Promise<void>
```

---

## Implementation Plan

### Phase 1: Core Renderer

1. **Host Config** (`src/reconciler/host-config.ts`)
   - Implement all required host config methods
   - Create PluNode instances
   - Handle tree mutations

2. **Reconciler** (`src/reconciler/index.ts`)
   - Initialize react-reconciler with host config
   - Export createRoot, render functions

3. **Serializer** (`src/serializer.ts`)
   - Walk PluNode tree
   - Output XML string
   - Handle props → attributes conversion
   - Handle special cases (tools, schema)

### Phase 2: Components

4. **Host Components** (`src/components/index.ts`)
   - Claude, Subagent, Phase, Step, Persona, Constraints, OutputFormat
   - TypeScript interfaces for props
   - JSDoc documentation

### Phase 3: Executor

5. **Executor** (`src/executor/index.ts`)
   - Ralph Wiggum loop implementation
   - Frame management
   - Parallel execution for Subagent

6. **Claude Integration** (`src/executor/claude.ts`)
   - Claude SDK wrapper
   - MCP server connection for tools
   - Response parsing

### Phase 4: CLI

7. **CLI** (`src/cli/index.ts`)
   - `plue run agent.mdx`
   - Terraform-style plan display
   - Approval prompt
   - `--auto-approve` flag

### Phase 5: MDX Support

8. **Vite Plugin** (`src/vite-plugin/index.ts`)
   - MDX compilation
   - Import Plue components
   - Hot reload support

---

## File Structure

```
src/
  index.ts              # Main exports
  reconciler/
    host-config.ts      # react-reconciler host config
    index.ts            # Reconciler setup
  components/
    index.ts            # All component exports
    types.ts            # TypeScript interfaces
  serializer/
    index.ts            # Tree → XML conversion
  executor/
    index.ts            # Ralph Wiggum loop
    claude.ts           # Claude SDK integration
    frame.ts            # Frame management
  cli/
    index.ts            # CLI entry point
    display.ts          # Plan display
    prompt.ts           # User approval
  vite-plugin/
    index.ts            # MDX support
```

---

## References

- [react-reconciler npm](https://www.npmjs.com/package/react-reconciler)
- [react-reconciler README](https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md)
- [Making a Custom React Renderer](https://github.com/nitin42/Making-a-custom-React-renderer)
- [Ink (terminal renderer)](https://github.com/vadimdemedes/ink)
- [reconciled (simplified wrapper)](https://github.com/vadimdemedes/reconciled)
- [react-xml-renderer](https://github.com/rettgerst/react-xml-renderer)
