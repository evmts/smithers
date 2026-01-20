# TUI Architecture Deep Dive

**Status**: January 2026
**Audience**: Developers ramping up on TUI subsystem
**Context**: Understanding the Terminal User Interface layer of Smithers

---

## Executive Summary

Smithers has **two completely independent React reconcilers**:

1. **Orchestration Reconciler** - JSX workflows → SmithersNode tree → Self-executing components
2. **TUI Reconciler** - JSX components → Terminal escape sequences → Visual monitoring dashboard

**Critical**: These reconcilers **do not share memory**. They run in **separate processes** and communicate via **SQLite polling**.

```
┌─────────────────────────────────────────────────────────────────┐
│                      SMITHERS ECOSYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐         ┌─────────────────────────────┐  │
│  │  Orchestration   │         │         TUI Monitor         │  │
│  │   (Main Loop)    │◄────────┤   (Separate Process)        │  │
│  │                  │  SQLite │                             │  │
│  │  SmithersRoot    │  Polling│  OpenTUI React Renderer     │  │
│  │  ↓               │         │  ↓                          │  │
│  │  React Tree      │         │  Terminal Components        │  │
│  │  ↓               │         │  ↓                          │  │
│  │  SmithersNode    │         │  Terminal Output            │  │
│  └──────────────────┘         └─────────────────────────────┘  │
│         │                              ▲                        │
│         │ Writes                  Reads│                        │
│         ▼                              │                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              SQLite Database (smithers.db)               │  │
│  │  - executions, phases, agents, tool_calls               │  │
│  │  - render_frames (XML snapshots of React tree)          │  │
│  │  - state, transitions, memories                         │  │
│  │  - human_interactions, reports                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Two Reconcilers Architecture

### Reconciler 1: Orchestration (src/reconciler/)

**Purpose**: Declarative AI orchestration workflows

```typescript
// Input: JSX workflow
<SmithersProvider db={db} executionId={executionId}>
  <Ralph maxIterations={10}>
    <Phase name="Implementation">
      <Step name="implement">
        <Claude model="sonnet" maxTurns={5}>
          Implement user authentication
        </Claude>
      </Step>
    </Phase>
  </Ralph>
</SmithersProvider>

// Output: SmithersNode tree (in-memory)
{
  type: 'ROOT',
  children: [{
    type: 'SmithersProvider',
    children: [{
      type: 'Ralph',
      children: [{
        type: 'Phase',
        children: [{
          type: 'Step',
          props: { name: 'implement' },
          children: [{
            type: 'Claude',
            props: { model: 'sonnet', maxTurns: 5 }
          }]
        }]
      }]
    }]
  }]
}
```

**Characteristics**:
- Custom React reconciler (src/reconciler/host-config.ts)
- Renders to SmithersNode objects (not DOM, not Terminal)
- Components execute themselves via `useMount()` hooks
- State stored in SQLite (`db.state`, `db.agents`, etc.)
- **NO useState allowed** - use `useQueryValue` instead
- Serializable to XML for debugging

**Entry Point**: `createSmithersRoot()` in src/reconciler/root.ts:50

---

### Reconciler 2: TUI (src/tui/ + @opentui/react)

**Purpose**: Real-time observability dashboard

```typescript
// Input: JSX UI components
function ExecutionTimeline({ db, height }) {
  const events = usePollEvents(db)  // Poll DB every 500ms
  const [selectedIndex, setSelectedIndex] = useState(0)  // useState OK here!

  return (
    <box style={{ flexDirection: 'column' }}>
      <text content="Timeline" style={{ fg: '#7aa2f7', bold: true }} />
      <scrollbox focused>
        {events.map(event => (
          <text key={event.id} content={event.name} />
        ))}
      </scrollbox>
    </box>
  )
}

// Output: Terminal escape sequences
\x1b[38;2;122;162;247mTimeline\x1b[0m
\x1b[1m> Phase: Implementation\x1b[0m
\x1b[2m@ Claude Sonnet\x1b[0m
```

**Characteristics**:
- OpenTUI React reconciler (vendor library)
- Renders to terminal escape sequences
- **useState is allowed** (ephemeral, no persistence needed)
- Polls SQLite every 500ms for updates
- Vim-style keyboard navigation
- Separate process from orchestration

**Entry Point**: `launchTUI()` in src/tui/index.tsx:12

---

## Communication: SQLite as IPC

Since TUI and orchestration run in **separate processes**, they communicate via **SQLite database**.

### Write Path: Orchestration → DB

```typescript
// src/components/SmithersProvider.tsx
export function SmithersProvider({ db, executionId, children }) {
  const ralphCount = useRef(0)

  // Capture render frame on mount
  useMount(() => {
    const treeXml = getCurrentTreeXML()  // Serialize current React tree
    db.renderFrames.store(treeXml, ralphCount.current)
  })

  // Re-capture on Ralph iteration
  useEffect(() => {
    const treeXml = getCurrentTreeXML()
    db.renderFrames.store(treeXml, ralphCount.current)
  }, [ralphCount.current])

  return <>{children}</>
}

// src/components/Claude.tsx
export function Claude({ model, children, onFinished }) {
  const agentIdRef = useRef<string | null>(null)

  useMount(() => {
    // Create agent record
    const id = db.agents.create({
      model,
      prompt: String(children),
      status: 'running'
    })
    agentIdRef.current = id

    // Execute Claude CLI
    const result = await executeClaudeCLI(...)

    // Update agent record
    db.agents.complete(id, result)

    onFinished?.(result)
  })

  return null  // No visual output in orchestration
}
```

### Read Path: DB → TUI

```typescript
// src/tui/hooks/usePollEvents.ts
export function usePollEvents(db: SmithersDB): TimelineEvent[] {
  const [events, setEvents] = useState<TimelineEvent[]>([])

  useEffect(() => {
    const pollEvents = () => {
      try {
        const execution = db.execution.current()
        if (!execution) {
          setEvents([])
          return
        }

        // Query phases
        const phases = db.query<Phase>(
          'SELECT id, name, status, created_at FROM phases WHERE execution_id = ?',
          [execution.id]
        )

        // Query agents
        const agents = db.query<Agent>(
          'SELECT id, model, status, created_at FROM agents WHERE execution_id = ?',
          [execution.id]
        )

        // Query tool calls
        const tools = db.query<ToolCall>(
          'SELECT id, tool_name, status, created_at FROM tool_calls WHERE execution_id = ?',
          [execution.id]
        )

        // Merge and sort by timestamp
        const allEvents: TimelineEvent[] = [
          ...phases.map(p => ({ type: 'phase', ...p })),
          ...agents.map(a => ({ type: 'agent', ...a })),
          ...tools.map(t => ({ type: 'tool', ...t }))
        ]
        allEvents.sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )

        setEvents(allEvents)
      } catch {
        // Ignore errors - DB might not be ready
      }
    }

    pollEvents()  // Initial poll
    const interval = setInterval(pollEvents, 500)  // Poll every 500ms
    return () => clearInterval(interval)
  }, [db])

  return events
}
```

**Pattern**: All TUI hooks follow this polling pattern:
1. `useEffect` with DB dependency
2. Define `poll()` function that queries DB
3. Try/catch to ignore errors (DB might not exist yet)
4. Initial call + `setInterval(poll, 500)`
5. Cleanup with `clearInterval`

---

## Database Schema (TUI-Relevant Tables)

```sql
-- Core execution tracking
CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,                        -- 'pending' | 'running' | 'completed' | 'failed'
  started_at TEXT,
  completed_at TEXT,
  total_agents INTEGER,
  total_tool_calls INTEGER
);

-- Timeline components
CREATE TABLE phases (
  id TEXT PRIMARY KEY,
  execution_id TEXT,
  name TEXT,
  status TEXT,                        -- 'pending' | 'running' | 'completed'
  created_at TEXT
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  execution_id TEXT,
  model TEXT,
  status TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  created_at TEXT
);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  tool_name TEXT,
  status TEXT,
  duration_ms INTEGER,
  created_at TEXT
);

-- Time-travel debugging
CREATE TABLE render_frames (
  id TEXT PRIMARY KEY,
  execution_id TEXT,
  sequence_number INTEGER,            -- 0, 1, 2, ...
  tree_xml TEXT,                      -- Serialized SmithersNode tree
  ralph_count INTEGER,                -- Which Ralph iteration
  created_at TEXT,
  UNIQUE(execution_id, sequence_number)
);

-- Human interaction
CREATE TABLE human_interactions (
  id TEXT PRIMARY KEY,
  execution_id TEXT,
  type TEXT,                          -- 'confirmation' | 'text' | 'select'
  prompt TEXT,
  options TEXT,                       -- JSON array
  status TEXT,                        -- 'pending' | 'approved' | 'rejected'
  response TEXT,                      -- JSON
  created_at TEXT,
  resolved_at TEXT
);

-- Agent reports
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  execution_id TEXT,
  agent_id TEXT,
  type TEXT,                          -- 'progress' | 'finding' | 'warning' | 'error'
  title TEXT,
  content TEXT,
  severity TEXT,                      -- 'info' | 'warning' | 'critical'
  created_at TEXT
);
```

Full schema: src/db/schema.sql:1

---

## TUI Structure

```
src/tui/
├── index.tsx                      # launchTUI() - entry point
├── App.tsx                        # Tab routing (F1-F6)
├── opentui.d.ts                   # TypeScript defs for OpenTUI
│
├── components/
│   ├── layout/                    # Layout components
│   │   ├── Header.tsx             # Execution name, status
│   │   ├── TabBar.tsx             # F1-F6 navigation
│   │   └── StatusBar.tsx          # DB connection, errors
│   │
│   ├── shared/                    # Reusable components
│   │   ├── ScrollableList.tsx     # Vim-nav list
│   │   └── XMLViewer.tsx          # Syntax-highlighted XML
│   │
│   └── views/                     # Main views
│       ├── ExecutionTimeline.tsx         # F1: Timeline view
│       ├── RenderFrameInspector.tsx      # F2: Time-travel
│       ├── DatabaseExplorer.tsx          # F3: Raw tables
│       ├── ChatInterface.tsx             # F4: Claude Q&A
│       ├── HumanInteractionHandler.tsx   # F5: Approvals
│       └── ReportViewer.tsx              # F6: Reports
│
├── hooks/                         # All follow 500ms polling
│   ├── useSmithersConnection.ts   # DB + current execution
│   ├── usePollEvents.ts           # Timeline events
│   ├── usePollTableData.ts        # Generic table polling
│   ├── useRenderFrames.ts         # Frame navigation
│   ├── useClaudeChat.ts           # Chat integration
│   ├── useHumanRequests.ts        # Pending interactions
│   └── useReportGenerator.ts      # Report generation
│
└── services/
    ├── claude-assistant.ts        # @anthropic-ai/sdk
    └── report-generator.ts        # Report formatting
```

---

## View Breakdown (F1-F6)

### F1: ExecutionTimeline (src/tui/components/views/ExecutionTimeline.tsx:15)

**Purpose**: Unified timeline of phases, agents, tool calls

**Data Source**: Merges 3 tables by timestamp
```typescript
const phases = db.query('SELECT * FROM phases WHERE execution_id = ?')
const agents = db.query('SELECT * FROM agents WHERE execution_id = ?')
const tools = db.query('SELECT * FROM tool_calls WHERE execution_id = ?')

const events = [...phases, ...agents, ...tools]
  .map(item => ({ ...item, type: inferType(item) }))
  .sort((a, b) => compareTimestamps(a, b))
```

**Display Format**:
```
> Phase: Implementation           [running]    14:32:15
@ Claude Sonnet                   [complete]   14:31:58  1.2K/800 tokens
# ReadTool                        [complete]   14:31:45  42ms
# EditTool                        [complete]   14:32:01  18ms
```

**Navigation**: `j`/`k` or `↑`/`↓` to scroll, `g`/`G` for first/last

---

### F2: RenderFrameInspector (src/tui/components/views/RenderFrameInspector.tsx:14)

**Purpose**: Time-travel debugger for React tree snapshots

**Data Source**: `render_frames` table
```typescript
const frames = db.renderFrames.list()  // All frames for current execution
const currentFrame = frames[currentIndex]
const treeXml = currentFrame.tree_xml  // Serialized SmithersNode tree
```

**Display Format**:
```xml
<ROOT>
  <SmithersProvider executionId="abc123">
    <Ralph maxIterations="10" currentIteration="2">
      <Phase name="Implementation" status="running">
        <Step name="implement" status="complete">
          <Claude model="sonnet" status="complete">
            Implement user authentication
          </Claude>
        </Step>
      </Phase>
    </Ralph>
  </SmithersProvider>
</ROOT>

Frame 5/12                           Ralph #2
Created: 2026-01-18 14:32:15
```

**Navigation**: `[`/`]` or `h`/`l` to navigate frames, `g`/`G` for first/last

**Use Case**: Debug why a component didn't render or understand execution flow

---

### F3: DatabaseExplorer (src/tui/components/views/DatabaseExplorer.tsx)

**Purpose**: Raw SQL table viewer

**Data Source**: Dynamic queries
```typescript
const tables = ['executions', 'phases', 'agents', 'tool_calls', ...]
const selectedTable = tables[selectedIndex]
const columns = db.query(`PRAGMA table_info(${selectedTable})`)
const rows = db.query(`SELECT * FROM ${selectedTable} ORDER BY rowid DESC LIMIT 100`)
```

**Display Format**:
```
Tables:
  > executions
    phases
    agents
    tool_calls

Columns: id | execution_id | model | status | tokens_input | tokens_output | created_at
Rows:
  abc123 | xyz789 | sonnet | complete | 1200 | 800 | 2026-01-18 14:31:58
  def456 | xyz789 | opus   | running  | 2400 | 1200| 2026-01-18 14:32:15
```

**Navigation**: Tab to switch table/data focus, `j`/`k` to scroll

---

### F4: ChatInterface (src/tui/components/views/ChatInterface.tsx:15)

**Purpose**: Claude-powered Q&A about execution state

**Data Source**: Current DB state + Claude API
```typescript
const { sendMessage, messages, isLoading } = useClaudeChat(db)

// User asks: "What is the current status?"
// Hook fetches:
const execution = db.execution.current()
const agents = db.agents.listForExecution(execution.id)
const tools = db.tools.listForExecution(execution.id)

// Sends to Claude with context:
await anthropic.messages.create({
  model: 'claude-haiku-3-5',
  messages: [
    { role: 'user', content: `
      Database state:
      Execution: ${JSON.stringify(execution)}
      Agents: ${JSON.stringify(agents)}
      Tools: ${JSON.stringify(tools)}

      Question: ${userQuestion}
    `}
  ]
})
```

**Display Format**:
```
Claude Chat - Ask about your execution

You: What is the current status?

Claude: The execution "my-workflow.tsx" is currently running.
        2 agents have completed successfully (1200 input tokens,
        800 output tokens). Current phase is "Implementation".

You: Show me recent errors

Claude: No errors found in the last 50 tool calls. All agents
        completed successfully.

[Enter to send, Ctrl+L to clear, Tab to switch focus]
```

**Requirements**: `ANTHROPIC_API_KEY` environment variable

**Graceful Degradation**: Shows message if API key missing, rest of TUI still works

---

### F5: HumanInteractionHandler (src/tui/components/views/HumanInteractionHandler.tsx)

**Purpose**: Handle pending human interactions (approvals, input)

**Data Source**: `human_interactions` table
```typescript
const pending = db.query(`
  SELECT * FROM human_interactions
  WHERE status = 'pending'
  ORDER BY created_at ASC
`)
```

**Display Format**:
```
Pending Human Interactions (2)

[1] Confirmation
    Prompt: Create new git commit with message "feat: Add auth"?
    Options: [Yes] [No]
    Created: 2026-01-18 14:32:15

    [a] Approve  [r] Reject

[2] Text Input
    Prompt: Enter API key for service X
    Created: 2026-01-18 14:33:01

    [Enter text and press Enter]
```

**Interaction Flow**:
1. User presses `a` to approve
2. TUI writes to DB: `UPDATE human_interactions SET status='approved', response='Yes'`
3. Orchestration polls DB, sees approval
4. Orchestration continues execution

**Bidirectional**: TUI can write to DB, orchestration reads

---

### F6: ReportViewer (src/tui/components/views/ReportViewer.tsx)

**Purpose**: View agent-generated reports

**Data Source**: `reports` table
```typescript
const reports = db.query(`
  SELECT * FROM reports
  WHERE execution_id = ?
  ORDER BY created_at DESC
`, [executionId])
```

**Display Format**:
```
Reports (12)

[PROGRESS] Implementation Progress
  Agent: Claude Sonnet (abc123)
  Created: 2026-01-18 14:32:15

  Completed authentication module. 3 files changed:
  - src/auth/login.ts (new)
  - src/auth/middleware.ts (new)
  - src/routes/api.ts (modified)

[WARNING] Potential Security Issue
  Agent: Claude Opus (def456)
  Severity: warning
  Created: 2026-01-18 14:35:01

  Found hardcoded secret in config.ts:42. Recommend using env vars.

[FINDING] Test Coverage
  Agent: Claude Haiku (ghi789)
  Created: 2026-01-18 14:40:12

  Current test coverage: 78%. Missing tests for auth middleware.
```

**Filter/Sort**: By type, severity, date

---

## Render Frames Deep Dive

**Concept**: Snapshot entire React tree at each render for time-travel debugging.

### Capture (Orchestration Side)

```typescript
// src/reconciler/root.ts
let currentRootNode: SmithersNode | null = null

export function getCurrentTreeXML(): string | null {
  if (!currentRootNode) return null
  return serialize(currentRootNode)  // SmithersNode → XML
}

// src/components/SmithersProvider.tsx
export function SmithersProvider({ db, executionId, children }) {
  const ralphCountRef = useRef(0)

  // Capture frame on mount
  useMount(() => {
    captureFrame()
  })

  // Capture frame on Ralph iteration change
  // (Would need Ralph to increment this ref)

  const captureFrame = () => {
    const treeXml = getCurrentTreeXML()
    if (treeXml) {
      db.renderFrames.store(treeXml, ralphCountRef.current)
    }
  }

  return <>{children}</>
}
```

### Storage (Database)

```typescript
// src/db/render-frames.ts
export function createRenderFramesModule(ctx) {
  return {
    store: (treeXml: string, ralphCount: number = 0): string => {
      const executionId = getCurrentExecutionId()
      if (!executionId) throw new Error('No active execution')

      const id = uuid()

      // Auto-increment sequence number
      const sequenceNumber = db.queryOne<{ next: number }>(
        'SELECT COALESCE(MAX(sequence_number), -1) + 1 as next FROM render_frames WHERE execution_id = ?',
        [executionId]
      )?.next ?? 0

      db.run(
        `INSERT INTO render_frames (id, execution_id, sequence_number, tree_xml, ralph_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, executionId, sequenceNumber, treeXml, ralphCount, now()]
      )

      return id
    },

    list: (): RenderFrame[] => {
      const executionId = getCurrentExecutionId()
      if (!executionId) return []
      return db.query<RenderFrame>(
        'SELECT * FROM render_frames WHERE execution_id = ? ORDER BY sequence_number ASC',
        [executionId]
      )
    }
  }
}
```

### Retrieval (TUI Side)

```typescript
// src/tui/hooks/useRenderFrames.ts
export function useRenderFrames(db: SmithersDB, executionId?: string) {
  const [frames, setFrames] = useState<RenderFrame[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  // Poll for frame updates
  useEffect(() => {
    const pollFrames = () => {
      try {
        const allFrames = executionId
          ? db.renderFrames.listForExecution(executionId)
          : db.renderFrames.list()
        setFrames(allFrames)
      } catch {
        // Ignore errors
      }
    }

    pollFrames()
    const interval = setInterval(pollFrames, 500)
    return () => clearInterval(interval)
  }, [db, executionId])

  const goToFrame = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, frames.length - 1))
    setCurrentIndex(clampedIndex)
  }, [frames.length])

  const nextFrame = useCallback(() => goToFrame(currentIndex + 1), [currentIndex, goToFrame])
  const prevFrame = useCallback(() => goToFrame(currentIndex - 1), [currentIndex, goToFrame])

  const currentFrame = frames[currentIndex] ?? null

  return {
    frames,
    currentFrame,
    currentIndex,
    totalFrames: frames.length,
    goToFrame,
    nextFrame,
    prevFrame,
    goToLatest: () => goToFrame(frames.length - 1),
    goToFirst: () => goToFrame(0)
  }
}
```

### Display (TUI View)

```typescript
// src/tui/components/views/RenderFrameInspector.tsx
export function RenderFrameInspector({ db, height }) {
  const { currentFrame, currentIndex, totalFrames, nextFrame, prevFrame } = useRenderFrames(db)

  useKeyboard((key) => {
    if (key.name === ']' || key.name === 'l') nextFrame()
    else if (key.name === '[' || key.name === 'h') prevFrame()
  })

  if (!currentFrame) {
    return <text content="No render frames captured yet" />
  }

  const xmlLines = currentFrame.tree_xml.split('\n')

  return (
    <box style={{ flexDirection: 'column' }}>
      <text content={`Frame ${currentIndex + 1}/${totalFrames} - Ralph #${currentFrame.ralph_count}`} />
      <scrollbox focused>
        {xmlLines.map((line, i) => (
          <text key={i} content={line} style={{ fg: '#c0caf5' }} />
        ))}
      </scrollbox>
    </box>
  )
}
```

---

## OpenTUI Integration

**OpenTUI** is a third-party library that provides a React reconciler for terminal UIs.

### Location
- **Vendor**: `reference/opentui/` (git submodule)
- **Types**: `src/tui/opentui.d.ts` (manually maintained)
- **Dependency**: `@opentui/core` and `@opentui/react` in package.json

### Core API

```typescript
import { createCliRenderer } from '@opentui/core'
import { createRoot, useKeyboard, useTerminalDimensions } from '@opentui/react'

// Create renderer
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  targetFps: 30,
  useMouse: false,
  useAlternateScreen: true,
  backgroundColor: '#1a1b26'
})

// Create React root
const root = createRoot(renderer)

// Render app
root.render(<App />)
```

### Elements

```typescript
// Container with flexbox layout
<box style={{
  flexDirection: 'column',  // or 'row'
  width: '100%',
  height: 20,
  padding: 1,
  margin: 1,
  backgroundColor: '#1a1b26',
  border: true,
  borderColor: '#7aa2f7'
}}>
  {children}
</box>

// Text with styling
<text
  content="Hello World"
  style={{
    fg: '#7aa2f7',           // Foreground color (hex or named)
    bg: '#1a1b26',           // Background color
    bold: true,
    italic: false,
    underline: false,
    dim: false,
    strikethrough: false,
    attributes: TextAttributes.BOLD  // Bitmask
  }}
/>

// Scrollable container with vim navigation
<scrollbox
  focused={true}  // Enables keyboard navigation
  style={{
    flexGrow: 1,
    border: true,
    padding: 1
  }}
>
  {items.map(item => <text key={item.id} content={item.name} />)}
</scrollbox>

// Input (may not be fully typed)
<input
  placeholder="Enter text..."
  value={inputValue}
  focused={isInputFocused}
  onInput={setInputValue}
  onSubmit={handleSubmit}
  style={{
    width: '100%',
    focusedBackgroundColor: '#24283b'
  }}
/>
```

### Hooks

```typescript
// Keyboard handling
useKeyboard((key: KeyEvent) => {
  console.log(key.name)       // 'j', 'k', 'enter', 'tab', 'f1'
  console.log(key.ctrl)       // true if Ctrl pressed
  console.log(key.shift)      // true if Shift pressed
  console.log(key.meta)       // true if Meta/Cmd pressed

  if (key.name === 'q') process.exit(0)
  if (key.ctrl && key.name === 'c') process.exit(0)
})

// Terminal dimensions
const { width, height } = useTerminalDimensions()

// Resize handler
useResize((width, height) => {
  console.log(`Terminal resized: ${width}x${height}`)
})
```

### Type System

OpenTUI types are **incomplete** in npm package. We maintain our own definitions in `src/tui/opentui.d.ts`:

```typescript
// Extend React's CSSProperties for terminal properties
declare module 'react' {
  interface CSSProperties {
    fg?: string
    bg?: string
    bold?: boolean
    dim?: boolean
    italic?: boolean
    underline?: boolean
    strikethrough?: boolean
    inverse?: boolean
    border?: 'single' | 'double' | 'round' | 'bold'
    borderColor?: string
    focusedBackgroundColor?: string
  }
}

// Intrinsic elements
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      box: { style?: OpenTUIStyle; children?: ReactNode }
      scrollbox: { focused?: boolean; style?: OpenTUIStyle; children?: ReactNode }
      text: { content?: string; style?: OpenTUIStyle }
      input: {
        value?: string
        placeholder?: string
        focused?: boolean
        onInput?: (value: string) => void
        onSubmit?: () => void
        style?: OpenTUIStyle
      }
    }
  }
}
```

**Note**: `<input>` element is used in ChatInterface but may not be in official OpenTUI API.

---

## State Management: Orchestration vs TUI

### Critical Difference

| Aspect | Orchestration | TUI |
|--------|---------------|-----|
| **Process** | Main workflow process | Separate monitoring process |
| **Lifecycle** | Long-running (hours/days) | Ephemeral (start/stop anytime) |
| **State Rules** | NO useState, use DB | useState is FINE |
| **Persistence** | Required (survives restarts) | Not needed (transient UI state) |
| **Reactivity** | useQueryValue (DB triggers rerender) | useState + polling |

### Orchestration Pattern (src/components/)

```typescript
// ❌ WRONG - useState in orchestration
function Claude({ model, children }) {
  const [status, setStatus] = useState<'pending' | 'running' | 'complete'>('pending')
  const [result, setResult] = useState<string | null>(null)

  useMount(async () => {
    setStatus('running')
    const output = await executeClaudeCLI(...)
    setResult(output)
    setStatus('complete')
  })
}

// ✅ CORRECT - DB storage in orchestration
function Claude({ model, children }) {
  const agentIdRef = useRef<string | null>(null)

  // No useState! Query DB for reactive updates
  const { data: statusVal } = useQueryValue<string>(
    db.db,
    "SELECT status FROM agents WHERE id = ?",
    [agentIdRef.current]
  )
  const status = statusVal ?? 'pending'

  useMount(async () => {
    // Create record
    const id = db.agents.create({ model, prompt: String(children), status: 'running' })
    agentIdRef.current = id

    // Execute
    const output = await executeClaudeCLI(...)

    // Update record
    db.agents.complete(id, output)
  })
}
```

**Why?** Orchestration must survive process crashes, resume across sessions, provide audit trail.

### TUI Pattern (src/tui/)

```typescript
// ✅ CORRECT - useState in TUI is fine!
function ExecutionTimeline({ db, height }) {
  const events = usePollEvents(db)                    // Poll DB
  const [selectedIndex, setSelectedIndex] = useState(0)  // Local UI state - OK!
  const [scrollOffset, setScrollOffset] = useState(0)    // Local UI state - OK!

  useKeyboard((key) => {
    if (key.name === 'j') {
      setSelectedIndex(prev => Math.min(prev + 1, events.length - 1))
    }
  })

  return (
    <scrollbox>
      {events.map((event, i) => (
        <text
          key={event.id}
          content={event.name}
          style={{
            backgroundColor: i === selectedIndex ? '#24283b' : undefined
          }}
        />
      ))}
    </scrollbox>
  )
}
```

**Why?** TUI state is ephemeral. Selected index, scroll position, input values don't need persistence. If TUI crashes, user just restarts it.

---

## Performance: Polling Strategy

### Current Implementation

All TUI hooks poll SQLite **every 500ms**:

```typescript
useEffect(() => {
  const poll = () => { /* query DB, update state */ }
  poll()
  const interval = setInterval(poll, 500)
  return () => clearInterval(interval)
}, [db])
```

**Pros**:
- Simple, predictable
- Works across process boundaries
- No shared memory needed
- Minimal DB load (reads only)

**Cons**:
- 500ms lag on updates
- Wasteful if nothing changing
- Scales poorly with many views

### Future: Reactive Queries

Potential optimization using `useQueryValue`:

```typescript
// Instead of polling
const events = usePollEvents(db)  // Polls every 500ms

// Use reactive query
import { useQuery } from 'smithers-orchestrator/reactive-sqlite'

const events = useQuery<TimelineEvent>(
  db.db,
  'SELECT * FROM (SELECT ...) ORDER BY created_at DESC'
)  // Auto-rerenders when query result changes
```

**Requires**:
- Reactive SQLite already exists (`src/reactive-sqlite/`)
- Need to port to TUI process
- Need SQLite triggers or file watching

---

## Known Issues & Limitations

### ⚠️ Current Issues

1. **Manual Polling Instead of Reactive**
   - All hooks use `setInterval(poll, 500)`
   - Should use `useQueryValue` for automatic reactivity
   - 500ms lag on fast executions
   - Location: All `src/tui/hooks/*.ts`

2. **Incomplete Type Definitions**
   - `src/tui/opentui.d.ts` manually maintained
   - `<input>` element used but not officially typed
   - May break on OpenTUI version updates
   - Workaround: Test manually, update types as needed

3. **Render Frames Only Captured on Mount**
   - Currently: `useMount(() => db.renderFrames.store(...))`
   - Missing: Capture on every Ralph iteration
   - Impact: Can't see intermediate states within iteration
   - Fix: Ralph needs to call `captureFrame()` on each loop

4. **No Tests for TUI Components**
   - Zero test coverage in `src/tui/`
   - Manual testing only
   - Risk: Regressions undetected

5. **Fixed Layout Calculations**
   - Heights hardcoded: `const contentHeight = height - 6`
   - Breaks if header/footer heights change
   - Should use flexbox `flexGrow` instead

6. **Limited Scrolling**
   - Some views truncate content if > terminal height
   - No horizontal scrolling
   - Long lines get cut off

### ❌ Missing Features

1. **Real-Time Updates**
   - Currently: Polling every 500ms
   - Wanted: WebSocket/SSE push updates
   - Benefit: Sub-100ms latency

2. **Mouse Support**
   - OpenTUI supports mouse events
   - Not enabled in `createCliRenderer({ useMouse: false })`
   - Would enable click navigation, scroll wheel

3. **Copy/Paste**
   - Can't copy text from TUI views
   - Workaround: Read DB directly or check log files

4. **Search/Filter**
   - No search within Timeline
   - No filter by status/type
   - Must scroll manually

5. **Graph Visualizations**
   - Dependency trees (agent → tool calls)
   - State machine diagrams (phase transitions)
   - Token usage over time

6. **Performance Metrics Dashboard**
   - Token usage trends
   - Average response times
   - Cost tracking

7. **Log Streaming**
   - Currently: Logs written to files
   - Wanted: Stream logs to TUI in real-time
   - Like `tail -f` but integrated

---

## Development Workflow

### Running TUI

```bash
# Terminal 1: Run orchestration
bun .smithers/main.tsx

# Terminal 2: Run TUI
bun src/tui/index.tsx .smithers/data

# Or if installed globally
smithers monitor
```

### Adding a New View

1. **Create view component**:
```typescript
// src/tui/components/views/MyView.tsx
import type { SmithersDB } from '../../../db/index.js'

export interface MyViewProps {
  db: SmithersDB
  height: number
}

export function MyView({ db, height }: MyViewProps) {
  const data = usePollMyData(db)

  return (
    <box style={{ flexDirection: 'column' }}>
      <text content="My View" style={{ fg: '#7aa2f7' }} />
      <scrollbox focused style={{ flexGrow: 1 }}>
        {data.map(item => (
          <text key={item.id} content={item.name} />
        ))}
      </scrollbox>
    </box>
  )
}
```

2. **Create hook**:
```typescript
// src/tui/hooks/usePollMyData.ts
export function usePollMyData(db: SmithersDB) {
  const [data, setData] = useState([])

  useEffect(() => {
    const poll = () => {
      try {
        const result = db.query('SELECT * FROM my_table')
        setData(result)
      } catch {
        setData([])
      }
    }
    poll()
    const interval = setInterval(poll, 500)
    return () => clearInterval(interval)
  }, [db])

  return data
}
```

3. **Register in App.tsx**:
```typescript
// Add to TABS array
export const TABS: TabInfo[] = [
  // ...
  { key: 'myview', label: 'My View', shortcut: 'F7' }
]

// Add to keyboard handler
useKeyboard((key) => {
  if (key.name === 'f7') setActiveTab('myview')
  // ...
})

// Add to renderView()
const renderView = () => {
  switch (activeTab) {
    case 'myview':
      return <MyView db={db} height={contentHeight} />
    // ...
  }
}
```

### Debugging TUI

```typescript
// Add console.log - outputs to stderr (visible outside TUI)
console.log('Debug:', value)

// Check DB directly
bun -e "
  import { createSmithersDB } from './src/db/index.js'
  const db = createSmithersDB({ path: '.smithers/data/smithers.db' })
  const result = db.query('SELECT * FROM agents')
  console.log(result)
"

// Inspect render frames
bun -e "
  import { createSmithersDB } from './src/db/index.js'
  const db = createSmithersDB({ path: '.smithers/data/smithers.db' })
  const frames = db.renderFrames.list()
  console.log(frames[0].tree_xml)
"
```

---

## Future Improvements

### Short-Term (Low Effort, High Impact)

1. **Add Tests**
   - At least smoke tests for views
   - Test polling hooks with mock DB

2. **Fix Render Frame Capture**
   - Capture on every Ralph iteration
   - Add `captureFrame()` call in Ralph loop

3. **Improve Error Handling**
   - Show DB connection errors in UI
   - Retry logic on connection failures

4. **Add Search**
   - Filter timeline by keyword
   - Search agents by model/status

### Medium-Term (Moderate Effort)

1. **Reactive Queries**
   - Port `useQueryValue` to TUI
   - Remove manual polling
   - Sub-100ms updates

2. **Mouse Support**
   - Enable in renderer config
   - Click to select items
   - Scroll wheel navigation

3. **Copy/Paste**
   - Add "Copy" command (like tmux)
   - Export current view to clipboard

4. **Horizontal Scrolling**
   - Handle long lines properly
   - Arrow keys for horizontal scroll

### Long-Term (High Effort, High Value)

1. **Graph Visualizations**
   - ASCII art dependency trees
   - State machine diagrams
   - Token usage charts

2. **Real-Time Updates**
   - WebSocket server in orchestration
   - TUI connects as client
   - Push updates instead of polling

3. **Log Streaming**
   - Tail agent logs in real-time
   - Syntax highlighting
   - Filter by log level

4. **Metrics Dashboard**
   - Token costs over time
   - Average latencies
   - Success/failure rates

---

## Reference: OpenTUI Submodule

**Location**: `reference/opentui/` (git submodule)

**Purpose**: Documentation and context for AI assistants

**NOT a dependency** - exists for reference only.

```bash
# Grep for API usage
grep -r "useKeyboard" reference/opentui/

# Find examples
ls reference/opentui/packages/core/src/examples/

# Read source
cat reference/opentui/packages/react/src/hooks/useKeyboard.ts
```

---

## Summary

**Two Reconcilers**:
1. Orchestration (SmithersNode tree) - Declarative AI workflows
2. TUI (Terminal output) - Real-time monitoring

**Communication**: SQLite database (500ms polling)

**6 Views**:
- F1: Timeline (phases/agents/tools)
- F2: Frames (time-travel debugger)
- F3: Database (raw tables)
- F4: Chat (Claude Q&A)
- F5: Human (pending interactions)
- F6: Reports (agent outputs)

**Key Insight**: TUI and orchestration are **completely independent**. TUI can crash/restart without affecting orchestration. Orchestration can run without TUI (headless).

**State Management**: useState allowed in TUI (ephemeral), forbidden in orchestration (must use DB).

**Performance**: Current polling (500ms lag), future reactive queries (sub-100ms).

**Status**: Working but needs tests, reactive queries, better error handling.

---

**Related Documentation**:
- TUI README: src/tui/README.md
- Database Schema: src/db/schema.sql
- Reconciler Types: src/reconciler/types.ts
- OpenTUI Reference: reference/opentui/
