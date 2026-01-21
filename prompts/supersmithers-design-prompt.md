# SuperSmithers Design Prompt

You are designing **SuperSmithers** - a meta-component that can observe, analyze, and **arbitrarily rewrite the source code** of any Smithers React tree it wraps. This is the "north star" feature for Smithers: agents that can rewrite their own orchestration code.

## Your Task

Design the complete architecture for a `<SuperSmithers>` component that:
1. Wraps any Smithers React tree
2. Observes execution state, errors, and performance metrics
3. Uses an AI agent (Claude) to analyze the tree and decide if rewrites are needed
4. **Rewrites the actual source code file** containing the React tree when optimization/healing is needed
5. Triggers a restart/remount with the new code

---

## Context: What is Smithers?

Smithers is a **React-based JSX framework for orchestrating AI coding agents**. The core insight is that you program the *plan*, not the agents. Plans are declarative React trees that evolve reactively based on agent output.

### Core Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        RALPH LOOP                               │
│                                                                 │
│   1. Render React → SmithersNode tree                          │
│   2. Execute runnable agents (<Claude>, etc.)                  │
│   3. Agent output updates SQLite state                         │
│   4. State change triggers re-render                           │
│   5. Loop until stopped or maxIterations reached               │
│                                                                 │
│   State lives in SQLite. Survives restarts. Enables replay.    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Declarative Plans**: JSX describes the workflow structure, not imperative steps
2. **SQLite Persistence**: All state in SQLite via `db.state`, `db.tasks`, `db.agents` - survives restarts
3. **NO useState**: State must be in SQLite or `useRef` (ephemeral non-reactive) - see AGENTS.md
4. **Reactive Queries**: `useQueryValue` for reactive reads from SQLite
5. **XML Serialization**: The React tree serializes to XML for observability and agent context

---

## Smithers Source Code Reference

### SmithersNode Type (src/reconciler/types.ts)

```typescript
export interface SmithersNode {
  /** Node type: 'claude', 'phase', 'step', 'TEXT', etc. */
  type: string
  /** Props passed to the component */
  props: Record<string, unknown>
  /** Child nodes */
  children: SmithersNode[]
  /** Reference to parent node (null for root) */
  parent: SmithersNode | null
  /** Unique key for reconciliation */
  key?: string | number
  /** Runtime execution state */
  _execution?: ExecutionState
  /** Validation warnings */
  warnings?: string[]
}

export interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown
  error?: Error
  contentHash?: string
}
```

### SmithersRoot Interface (src/reconciler/root.ts)

```typescript
export interface SmithersRoot {
  /** Mount the app and wait for orchestration to complete */
  mount(App: () => ReactNode | Promise<ReactNode>): Promise<void>
  
  /** Render and wait for initial commit */
  render(element: ReactNode): Promise<void>
  
  /** Get the current SmithersNode tree */
  getTree(): SmithersNode
  
  /** Dispose the root */
  dispose(): void
  
  /** Serialize the tree to XML - THE PLAN shown to users */
  toXML(): string
}

export function createSmithersRoot(): SmithersRoot {
  const rootNode: SmithersNode = {
    type: 'ROOT',
    props: {},
    children: [],
    parent: null,
  }
  // ... creates React reconciler, handles orchestration lifecycle
}
```

### XML Serialization (src/reconciler/serialize.ts)

The tree serializes to XML like:

```xml
<phase name="implement" status="active">
  <step name="code" status="running">
    <claude status="running" model="sonnet" agentId="abc123">
      Fix the failing tests
    </claude>
  </step>
  <step name="test" status="pending">
    <claude status="pending" model="sonnet">
      Write additional tests
    </claude>
  </step>
</phase>
```

This XML is crucial for:
1. Observability - humans can see the plan
2. Agent context - agents can read the plan they're executing within
3. Debugging - SQLite stores every render frame

### SmithersProvider (src/components/SmithersProvider.tsx)

The root orchestration wrapper. Key features:

```typescript
export interface SmithersProviderProps {
  db: SmithersDB
  executionId: string
  maxIterations?: number  // Default 100, or Infinity for long-running
  stopped?: boolean       // Explicit stop condition
  config?: SmithersConfig
  middleware?: SmithersMiddleware[]
  
  // Callbacks
  onIteration?: (iteration: number) => void
  onComplete?: () => void
  onError?: (error: Error) => void
  onStopRequested?: (reason: string) => void
  
  // Stop conditions
  globalStopConditions?: GlobalStopCondition[]
  globalTimeout?: number
  
  // Tree access for frame capture
  getTreeXML?: () => string
  orchestrationToken?: string
  cleanupOnComplete?: boolean
  
  children: ReactNode
}

export interface SmithersContextValue {
  db: SmithersDB
  executionId: string
  config: SmithersConfig
  middleware?: SmithersMiddleware[]
  requestStop: (reason: string) => void
  requestRebase: (reason: string) => void
  isStopRequested: () => boolean
  isRebaseRequested: () => boolean
  ralphCount: number
  reactiveDb: ReactiveDatabase
  executionEnabled: boolean
}
```

Key implementation details:
- Uses `useQueryValue` to read `ralphCount` and other state from SQLite
- Manages task tracking via `db.tasks.start()` / `db.tasks.complete()`
- Advances iteration when all tasks complete (no pending tasks)
- Captures render frames each iteration via `useCaptureRenderFrame`

### Claude Component (src/components/Claude.tsx)

The core agent execution component:

```typescript
export interface ClaudeProps {
  children: ReactNode  // The prompt
  model?: ClaudeModel  // 'sonnet' | 'opus' | 'haiku'
  maxTurns?: number
  systemPrompt?: string
  schema?: ZodSchema   // For structured output
  middleware?: SmithersMiddleware[]
  stopConditions?: StopCondition[]
  
  // Callbacks
  onFinished?: (result: AgentResult) => void
  onError?: (error: Error) => void
  onProgress?: (chunk: string) => void
  onToolCall?: (name: string, input: unknown) => void
  
  // Execution control
  cwd?: string
  timeout?: number
  permissionMode?: ClaudePermissionMode
  allowedTools?: string[]
  disallowedTools?: string[]
  
  // Validation
  validate?: (result: AgentResult) => boolean | Promise<boolean>
  retryOnValidationFailure?: boolean
  maxRetries?: number
  
  // Reporting
  reportingEnabled?: boolean
  tailLogCount?: number
  tailLogLines?: number
}

export interface AgentResult {
  output: string
  structured?: unknown  // If schema was provided
  tokensUsed: { input: number; output: number }
  turnsUsed: number
  durationMs: number
  stopReason: StopReason
  sessionId?: string
}
```

Key implementation:
- Uses `useEffectOnValueChange(executionKey, ...)` to trigger execution
- Registers tasks with `db.tasks.start('claude', model)`
- Stores agent results in `db.agents` table
- Renders a `<claude>` custom element that serializes to XML

### Phase Component (src/components/Phase.tsx)

Sequential workflow phases:

```typescript
export interface PhaseProps {
  name: string
  children: ReactNode
  skipIf?: () => unknown
  onStart?: () => void
  onComplete?: () => void
}
```

Implementation:
- Registers with `PhaseRegistryProvider` for sequential execution
- Only the active phase renders its children
- Tracks state in `db.phases` table
- Always renders the `<phase>` element (visible in plan), but children only when active

### Step Component (src/components/Step.tsx)

Sequential steps within phases:

```typescript
export interface StepProps {
  name?: string
  children: ReactNode
  snapshotBefore?: boolean
  snapshotAfter?: boolean
  commitAfter?: boolean
  commitMessage?: string
  onStart?: () => void
  onComplete?: () => void
  onError?: (error: Error) => void
}
```

Implementation:
- Registers with `StepRegistryProvider` for sequential execution within a phase
- Tracks completion via task counts in SQLite
- Creates VCS snapshots/commits if requested
- Uses `ExecutionScopeProvider` to gate child execution

### Smithers Subagent Component (src/components/Smithers.tsx)

**This is the closest existing pattern to SuperSmithers** - it generates and executes Smithers scripts:

```typescript
export interface SmithersProps {
  children: ReactNode  // Task description
  plannerModel?: ClaudeModel  // For planning the script
  executionModel?: ClaudeModel  // For agents in generated script
  maxPlanningTurns?: number
  timeout?: number
  context?: string
  cwd?: string
  keepScript?: boolean
  scriptPath?: string
  reportingEnabled?: boolean
  
  onFinished?: (result: SmithersResult) => void
  onError?: (error: Error) => void
  onProgress?: (message: string) => void
  onScriptGenerated?: (script: string, path: string) => void
}

export interface SmithersResult extends AgentResult {
  script: string       // The generated script
  scriptPath: string   // Where it was written
  planningResult: AgentResult
}
```

How it works:
1. Uses Claude to generate a Smithers TSX script based on the task
2. Writes the script to a temp file
3. Executes it as a subprocess with `bun`
4. Reports results back

### SmithersCLI Executor (src/components/agents/SmithersCLI.ts)

```typescript
const PLANNING_SYSTEM_PROMPT = `You are a Smithers orchestration script generator...`

const SCRIPT_TEMPLATE = `#!/usr/bin/env bun
import { createSmithersRoot } from 'smithers'
import { createSmithersDB, SmithersProvider, Claude, Phase, Step } from 'smithers/orchestrator'

{{SCRIPT_BODY}}
`

async function generateSmithersScript(task: string, options): Promise<{ script: string; planningResult: AgentResult }> {
  // Uses Claude to generate the script body
  const planningResult = await executeClaudeCLI({
    prompt: `Generate a Smithers orchestration script for: ${task}`,
    model: options.plannerModel || 'sonnet',
    systemPrompt: PLANNING_SYSTEM_PROMPT,
    // ...
  })
  // Wraps output in template
  return { script: fullScript, planningResult }
}

export async function executeSmithers(options: SmithersExecutionOptions): Promise<SmithersResult> {
  // 1. Generate the script
  const { script, planningResult } = await generateSmithersScript(options.task, options)
  
  // 2. Write to file
  const scriptPath = await writeScriptFile(script, options.scriptPath)
  
  // 3. Execute with bun
  const execResult = await executeScript(scriptPath, options)
  
  // 4. Clean up (unless keepScript)
  
  return { output, script, scriptPath, planningResult, ... }
}
```

### While Component (src/components/While.tsx)

Condition-based subloops:

```typescript
export interface WhileProps {
  id: string
  condition: () => boolean | Promise<boolean>
  maxIterations?: number
  children: ReactNode
  onIteration?: (iteration: number) => void
  onComplete?: (iterations: number, reason: 'condition' | 'max') => void
}

export function useWhileIteration() {
  // Returns { iteration, signalComplete }
}
```

State persists in SQLite:
- `while.{id}.iteration`
- `while.{id}.status`

### Custom Hooks (src/reconciler/hooks.ts)

```typescript
// Run once on mount
export const useMount = (fn: () => void) => { ... }

// Run on unmount with latest callback (avoids stale closures)
export const useUnmount = (fn: () => void): void => { ... }

// Returns () => boolean to check if still mounted
export function useMountedState(): () => boolean { ... }

// Run effect when value changes, idempotent
export function useEffectOnValueChange<T>(
  value: T,
  effect: () => void | (() => void),
  deps: DependencyList = []
): void { ... }

// Run once when execution is enabled
export function useExecutionMount(
  executionEnabled: boolean,
  fn: () => void,
  deps: DependencyList = []
): void { ... }
```

### Database Schema (src/db/index.ts)

```typescript
export interface SmithersDB {
  db: ReactiveDatabase  // Raw SQLite
  
  state: StateModule      // Key-value state with history
  memories: MemoriesModule  // Long-term knowledge
  execution: ExecutionModule  // Execution tracking
  phases: PhasesModule
  agents: AgentsModule
  steps: StepsModule
  tasks: TasksModule      // For Ralph iteration management
  tools: ToolsModule      // Tool call tracking
  artifacts: ArtifactsModule
  human: HumanModule
  vcs: VcsModule          // Git/JJ tracking
  renderFrames: RenderFramesModule  // Time-travel debugging
  buildState: BuildStateModule
  vcsQueue: VCSQueueModule
  query: QueryFunction
  close: () => void
}

// Key state APIs:
db.state.set(key, value, trigger?)
db.state.get(key)
db.state.history(key, limit)

// Task tracking (used by Ralph loop):
db.tasks.start(componentType, componentName?, options?)  // Returns taskId
db.tasks.complete(taskId)
db.tasks.fail(taskId, error)
db.tasks.listRunning(executionId)

// Agent tracking:
db.agents.start(prompt, model, systemPrompt?, logPath?)  // Returns agentId
db.agents.complete(agentId, output, structured?, tokens?)
db.agents.fail(agentId, error)

// Render frames (for observability):
db.renderFrames.capture(executionId, iteration, xml)
db.renderFrames.list(executionId)
db.renderFrames.get(id)
```

### Reactive SQLite (src/reactive-sqlite/)

```typescript
// Hook for reactive queries - re-renders when data changes
export function useQueryValue<T>(
  db: ReactiveDatabase,
  query: string,
  params: unknown[],
  options?: { skip?: boolean }
): { data: T | null }

// Mutation hook
export function useMutation(
  db: ReactiveDatabase
): { mutate: (sql: string, params?: unknown[]) => void }
```

---

## Design Requirements for SuperSmithers

### 1. Component Interface

Design the props for `<SuperSmithers>`:

```typescript
export interface SuperSmithersProps {
  children: ReactNode  // The tree to observe and potentially rewrite
  
  // Source code location (REQUIRED - where to read/write rewrites)
  sourceFile: string  // Path to the TSX file containing the tree
  
  // Observation configuration
  observeInterval?: number  // How often to analyze (ms)
  observeOn?: ('error' | 'iteration' | 'complete' | 'stall')[]
  
  // Rewrite triggers
  rewriteOn?: {
    errors?: boolean       // Rewrite when agents error repeatedly
    performance?: boolean  // Rewrite when too slow / too many tokens
    stalls?: boolean       // Rewrite when no progress
    custom?: (context: SuperSmithersContext) => boolean | Promise<boolean>
  }
  
  // Rewrite configuration
  rewriteModel?: ClaudeModel  // Model to use for rewriting
  rewriteSystemPrompt?: string  // Custom system prompt for rewriter
  maxRewrites?: number     // Max rewrites before giving up
  rewriteCooldown?: number  // Min time between rewrites (ms)
  
  // Approval workflow
  requireApproval?: boolean  // Require human approval before rewriting
  onRewriteProposed?: (proposal: RewriteProposal) => void
  
  // Callbacks
  onRewrite?: (result: RewriteResult) => void
  onAnalysis?: (analysis: TreeAnalysis) => void
  onError?: (error: Error) => void
  
  // Execution
  restartAfterRewrite?: boolean  // Default true
  keepRewriteHistory?: boolean   // Store all versions
}
```

### 2. Core Behaviors

SuperSmithers must:

1. **Observe the tree**: Read the current SmithersNode tree and its execution state
2. **Collect metrics**: Track errors, token usage, iteration count, stalls
3. **Analyze periodically**: Use Claude to analyze if the tree needs optimization
4. **Generate rewrites**: Use Claude to generate a new version of the source file
5. **Apply rewrites**: Write the new source code to the file
6. **Trigger restart**: Unmount the old tree and remount with new code
7. **Track history**: Store all versions in SQLite for rollback

### 3. Key Challenges to Address

1. **Source Code Access**: How does SuperSmithers know which file to rewrite? The component receives JSX children, but needs to modify source files.

2. **Hot Reloading**: After rewriting, how do we restart the tree?
   - Option A: Kill the process and restart
   - Option B: Use Bun's hot module replacement
   - Option C: Create a subprocess and swap
   - Option D: Remount the React tree with dynamic import

3. **Preventing Infinite Loops**: What if the rewrite creates worse code that triggers more rewrites?
   - Cooldown periods
   - Max rewrite limits
   - Rollback mechanisms
   - Diff analysis to detect oscillation

4. **State Preservation**: When restarting, how do we preserve state?
   - SQLite already persists state - this is why we use it!
   - Execution can resume from `db.execution.findIncomplete()`

5. **Atomic Rewrites**: How do we ensure rewrites are safe?
   - Write to temp file first
   - Validate syntax before applying
   - Keep backup of original
   - Use VCS (git/jj) for versioning

6. **Context for Rewriter Agent**: What context does Claude need to generate good rewrites?
   - Current source code
   - Execution history (render frames)
   - Error logs
   - Token/cost metrics
   - Original task/goal

### 4. Suggested Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SuperSmithers                                      │
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │  Observer   │───▶│  Analyzer   │───▶│  Rewriter   │───▶│  Applier    │  │
│  │             │    │             │    │             │    │             │  │
│  │ - Tree XML  │    │ - Claude    │    │ - Claude    │    │ - Write FS  │  │
│  │ - Metrics   │    │ - Decide if │    │ - Generate  │    │ - Validate  │  │
│  │ - Errors    │    │   rewrite   │    │   new code  │    │ - Restart   │  │
│  │ - Frames    │    │   needed    │    │             │    │             │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Wrapped Child Tree                               │   │
│  │                                                                      │   │
│  │  <SmithersProvider>                                                  │   │
│  │    <Phase name="implement">                                          │   │
│  │      <Claude>Fix the bug</Claude>                                    │   │
│  │    </Phase>                                                          │   │
│  │  </SmithersProvider>                                                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5. Database Schema Additions

SuperSmithers will need new tables:

```sql
-- Track rewrite history
CREATE TABLE IF NOT EXISTS supersmithers_rewrites (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  source_file TEXT NOT NULL,
  original_code TEXT NOT NULL,
  new_code TEXT NOT NULL,
  analysis TEXT,           -- JSON: what triggered rewrite
  metrics TEXT,            -- JSON: before/after metrics
  status TEXT NOT NULL,    -- pending, approved, applied, rolled_back
  created_at TEXT NOT NULL,
  applied_at TEXT,
  FOREIGN KEY (execution_id) REFERENCES executions(id)
);

-- Track analysis history
CREATE TABLE IF NOT EXISTS supersmithers_analyses (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  tree_xml TEXT NOT NULL,
  metrics TEXT,            -- JSON: token usage, errors, timing
  analysis_result TEXT,    -- JSON: Claude's analysis
  rewrite_recommended BOOLEAN,
  recommendation TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (execution_id) REFERENCES executions(id)
);
```

### 6. Example Usage

```tsx
#!/usr/bin/env bun
import { createSmithersRoot, createSmithersDB, SmithersProvider, SuperSmithers, Claude, Phase } from 'smithers-orchestrator'

const db = createSmithersDB({ path: '.smithers/self-healing.db' })
const executionId = db.execution.start('Self-Healing Workflow', 'workflow.tsx')

function Workflow() {
  return (
    <SuperSmithers
      sourceFile="./workflow.tsx"
      rewriteOn={{ errors: true, stalls: true }}
      rewriteModel="opus"
      maxRewrites={3}
      onRewrite={(result) => console.log('Rewrote:', result.summary)}
    >
      <SmithersProvider db={db} executionId={executionId} maxIterations={50}>
        <Phase name="implement">
          <Claude model="sonnet" maxTurns={10}>
            Implement the authentication system
          </Claude>
        </Phase>
        <Phase name="test">
          <Claude model="sonnet" maxTurns={5}>
            Write and run tests
          </Claude>
        </Phase>
      </SmithersProvider>
    </SuperSmithers>
  )
}

const root = createSmithersRoot()
await root.mount(Workflow)
await db.close()
```

---

## Questions to Answer in Your Design

1. **How does SuperSmithers identify the source file to rewrite?**
   - Is `sourceFile` prop sufficient?
   - Should it auto-detect from stack traces?
   - What about multi-file orchestrations?

2. **What restart strategy should we use?**
   - Process restart (cleanest, but loses in-memory state)?
   - Dynamic import (keeps process, complex to implement)?
   - Subprocess swap (new process, parent waits)?

3. **How do we prevent the rewriter from breaking things?**
   - Syntax validation before applying
   - Type checking with tsc
   - Running a "dry run" execution?
   - Semantic diff analysis?

4. **What context should the rewriter agent receive?**
   - Full source code
   - Execution history (how many render frames?)
   - Error messages
   - Token/cost metrics
   - Original goal from the prompt

5. **How do we handle approval workflows?**
   - Human-in-the-loop for production
   - Auto-approve for dev/testing
   - Integration with `<Human>` component?

6. **How do we track rewrite effectiveness?**
   - Before/after metrics
   - Rollback if worse
   - A/B testing between versions?

7. **What's the relationship between SuperSmithers and SmithersProvider?**
   - Should SuperSmithers wrap SmithersProvider, or be wrapped by it?
   - How do they share the database?
   - How does SuperSmithers access the tree XML?

8. **How do we handle the "meta" nature of this?**
   - SuperSmithers rewrites code that may include SuperSmithers itself
   - Should we prevent rewriting the SuperSmithers wrapper?
   - What if the rewrite removes SuperSmithers?

---

## Deliverables

Please provide:

1. **Complete TypeScript interfaces** for all types (props, context, results)
2. **Component implementation outline** with pseudocode for key logic
3. **Database schema** for tracking rewrites and analyses
4. **Restart strategy** with trade-offs analysis
5. **Rewriter agent prompt** (system prompt for Claude to generate rewrites)
6. **Safety mechanisms** to prevent infinite loops and broken rewrites
7. **Integration points** with existing Smithers components
8. **Example usage patterns** showing common scenarios

Focus on practical, implementable design. The goal is a working component that can be built incrementally, not a theoretical architecture.
