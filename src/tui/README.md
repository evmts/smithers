# Smithers TUI - Terminal User Interface

**Real-time observability dashboard for Smithers orchestration workflows.**

```
┌─────────────────────────────────────────────────────────────────┐
│ F1: Timeline   F2: Frames   F3: Database   F4: Chat   F5: Human │
├─────────────────────────────────────────────────────────────────┤
│ Execution: my-workflow.tsx                      Status: running  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  > Phase: Implementation           [running]    14:32:15        │
│  @ Claude Sonnet                   [complete]   14:31:58  1.2K  │
│  # ReadTool                        [complete]   14:31:45  42ms  │
│  # EditTool                        [complete]   14:32:01  18ms  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Connected: .smithers/data/smithers.db                           │
└─────────────────────────────────────────────────────────────────┘
```

## Architecture

**Two independent React reconcilers** - no shared memory, communicate via SQLite:

```
ORCHESTRATION PROCESS              TUI PROCESS (separate)
┌────────────────────┐            ┌──────────────────────┐
│ SmithersReconciler │            │ OpenTUI Reconciler   │
│        ↓           │            │        ↓             │
│  SmithersNode tree │            │  Terminal elements   │
│        ↓           │            │        ↓             │
│  Components        │            │  Escape sequences    │
│  execute via       │            │        ↓             │
│  useMount hooks    │            │  Terminal output     │
└────────────────────┘            └──────────────────────┘
         │                                  ▲
         │ Writes                      Reads│
         ▼                                  │
┌──────────────────────────────────────────────────────┐
│         SQLite Database (smithers.db)                │
│  - executions, phases, agents, tool_calls            │
│  - render_frames (XML snapshots)                     │
│  - state, memories, human_interactions               │
└──────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Run TUI against default database
bun src/tui/index.tsx .smithers/data

# Or if CLI installed
smithers monitor

# Run with custom DB path
bun src/tui/index.tsx /path/to/smithers.db
```

## Navigation

| Key | View | Description |
|-----|------|-------------|
| F1 | Timeline | Phases, agents, tool calls merged by timestamp |
| F2 | Frames | Time-travel through render frame snapshots |
| F3 | Database | Raw SQL table viewer |
| F4 | Chat | Claude-powered Q&A about execution state |
| F5 | Human | Pending human interactions (approvals) |
| F6 | Reports | Agent-generated reports |
| Ctrl+Q / Ctrl+C | - | Quit |

**Per-view navigation:**
- Timeline (F1): `j`/`k` or `↑`/`↓` to scroll, `g`/`G` for first/last
- Frames (F2): `[`/`]` or `h`/`l` to navigate, `g`/`G` for first/last
- Chat (F4): Tab to switch focus, Enter to send, Ctrl+L to clear

## Directory Structure

```
src/tui/
├── index.tsx                      # Entry: launchTUI()
├── App.tsx                        # Main app, tab routing
├── opentui.d.ts                   # TypeScript defs for OpenTUI
│
├── components/
│   ├── layout/                    # Header, TabBar, StatusBar
│   ├── shared/                    # ScrollableList, XMLViewer
│   └── views/                     # 6 main views (F1-F6)
│       ├── ExecutionTimeline.tsx         # Timeline view
│       ├── RenderFrameInspector.tsx      # Time-travel debugger
│       ├── DatabaseExplorer.tsx          # Raw table viewer
│       ├── ChatInterface.tsx             # Claude Q&A
│       ├── HumanInteractionHandler.tsx   # Pending approvals
│       └── ReportViewer.tsx              # Agent reports
│
├── hooks/                         # All follow 500ms polling pattern
│   ├── useSmithersConnection.ts   # DB connection + current execution
│   ├── usePollEvents.ts           # Timeline events
│   ├── usePollTableData.ts        # Generic table polling
│   ├── useRenderFrames.ts         # Frame time-travel navigation
│   ├── useClaudeChat.ts           # Chat with Claude
│   ├── useHumanRequests.ts        # Pending interactions
│   └── useReportGenerator.ts      # Report generation
│
└── services/
    ├── claude-assistant.ts        # Claude SDK integration
    └── report-generator.ts        # Report generation logic
```

## Data Flow

### Write Path (Orchestration → DB → TUI)

```typescript
// In orchestration process (my-workflow.tsx)
<SmithersProvider db={db} executionId={executionId}>
  <Claude onFinished={() => {
    // Component writes to DB
    db.agents.complete(agentId, result)
  }}>
    Do something
  </Claude>
</SmithersProvider>

// SmithersProvider captures render frames on mount
useMount(() => {
  const xml = getCurrentTreeXML()
  db.renderFrames.store(xml, ralphCount)
})
```

### Read Path (TUI ← DB)

```typescript
// In TUI process (src/tui/hooks/usePollEvents.ts)
useEffect(() => {
  const poll = () => {
    const phases = db.query('SELECT * FROM phases WHERE ...')
    const agents = db.query('SELECT * FROM agents WHERE ...')
    const tools = db.query('SELECT * FROM tool_calls WHERE ...')
    setEvents([...phases, ...agents, ...tools].sort())
  }

  poll()
  const interval = setInterval(poll, 500)  // Poll every 500ms
  return () => clearInterval(interval)
}, [db])
```

## OpenTUI Elements

TUI uses **@opentui/react** - React reconciler for terminals:

```tsx
import { useKeyboard, useTerminalDimensions } from '@opentui/react'

function MyView() {
  const { width, height } = useTerminalDimensions()

  useKeyboard((key) => {
    if (key.name === 'j') moveDown()
  })

  return (
    <box style={{ flexDirection: 'column', height: '100%' }}>
      <text
        content="Hello"
        style={{ fg: '#7aa2f7', bold: true }}
      />
      <scrollbox focused style={{ flexGrow: 1 }}>
        {items.map(item => (
          <text key={item.id} content={item.name} />
        ))}
      </scrollbox>
    </box>
  )
}
```

**Available elements:**
- `<box>` - Container with flexbox layout
- `<text>` - Static text with color/styles
- `<scrollbox>` - Scrollable container (vim navigation)
- `<input>` - Text input (typed in `opentui.d.ts` for common props)

**Style properties:**
- Colors: `fg`, `bg` (hex or named)
- Text: `bold`, `dim`, `italic`, `underline`, `strikethrough`
- Layout: `flexDirection`, `padding`, `margin`, `width`, `height`
- Border: `border`, `borderColor`

## Render Frames (Time-Travel Debugging)

**Concept**: Snapshot the entire React tree at each render for replay.

```
ORCHESTRATION                      DATABASE                    TUI
┌─────────────┐                   ┌──────────────┐          ┌──────────────┐
│ <Claude>    │──useMount()──>    │ render_frames│<──poll───│ Frame        │
│   <Phase>   │   serialize()     │ ┌──────────┐ │          │ Inspector    │
│     <Step>  │   ↓               │ │ id       │ │          │              │
│   </Phase>  │   getCurrentTree  │ │ tree_xml │ │          │ Navigate:    │
│ </Claude>   │   ↓               │ │ ralph_#  │ │          │ [ / ]        │
│             │   db.renderFrames │ │ seq_num  │ │          │ h / l        │
└─────────────┘   .store(xml)     │ └──────────┘ │          │ g / G        │
                                  └──────────────┘          └──────────────┘
```

**Storage** (src/db/render-frames.ts):
```typescript
db.renderFrames.store(treeXml, ralphCount)
// Stores: { id, execution_id, sequence_number, tree_xml, ralph_count, created_at }
```

**Retrieval** (src/tui/hooks/useRenderFrames.ts):
```typescript
const { currentFrame, nextFrame, prevFrame, goToLatest } = useRenderFrames(db)
// currentFrame.tree_xml contains serialized SmithersNode tree
```

## Development Patterns

### State Management - useState is ALLOWED in TUI

**Critical difference from orchestration:**

```typescript
// ❌ ORCHESTRATION - NO useState
const [status, setStatus] = useState('running')  // WRONG

// ✅ ORCHESTRATION - Use DB + useQueryValue
const status = useQueryValue(db, "SELECT status FROM agents WHERE id = ?", [id])

// ✅ TUI - useState is FINE
const [selectedIndex, setSelectedIndex] = useState(0)  // OK!
const [scrollOffset, setScrollOffset] = useState(0)    // OK!
```

**Why?** TUI is ephemeral - no persistence needed, separate process.

### Polling Pattern (All Hooks Follow This)

```typescript
export function usePollTableData(db: SmithersDB, tableName: string) {
  const [data, setData] = useState<Row[]>([])

  useEffect(() => {
    const poll = () => {
      try {
        const rows = db.query(`SELECT * FROM ${tableName}`)
        setData(rows)
      } catch {
        // Ignore errors - DB might not be ready
        setData([])
      }
    }

    poll()  // Initial poll
    const interval = setInterval(poll, 500)
    return () => clearInterval(interval)
  }, [db, tableName])

  return data
}
```

### Keyboard Handling

```typescript
import { useKeyboard, type KeyEvent } from '@opentui/react'

useKeyboard((key: KeyEvent) => {
  if (key.name === 'j' || key.name === 'down') {
    // Move down
  } else if (key.ctrl && key.name === 'c') {
    process.exit(0)
  }
})
```

### Vim-Style Navigation

```typescript
const [selectedIndex, setSelectedIndex] = useState(0)
const [scrollOffset, setScrollOffset] = useState(0)

useKeyboard((key) => {
  if (key.name === 'j') {
    const newIndex = Math.min(selectedIndex + 1, items.length - 1)
    setSelectedIndex(newIndex)
    if (newIndex >= scrollOffset + visibleHeight) {
      setScrollOffset(newIndex - visibleHeight + 1)
    }
  }
  // ... similar for k, g, G
})
```

## Database Schema (Relevant Tables)

```sql
-- All executions
executions (id, name, status, started_at, total_agents, ...)

-- Timeline events
phases      (id, execution_id, name, status, created_at)
agents      (id, execution_id, model, status, tokens_input, tokens_output)
tool_calls  (id, agent_id, tool_name, status, duration_ms)

-- Time-travel debugging
render_frames (id, execution_id, sequence_number, tree_xml, ralph_count)

-- Human interaction
human_interactions (id, type, prompt, status, response)

-- Reports
reports (id, type, title, content, severity)
```

## Status & Limitations

### ✅ Working
- 6 views with keyboard navigation
- Real-time polling (500ms intervals)
- Render frame time-travel (F2)
- Claude chat integration (F4)
- Vim-style navigation
- View switching (F1-F6)

### ⚠️ Known Issues
- **Manual polling** instead of reactive queries (no useQueryValue in TUI yet)
- **500ms lag** on fast executions
- **Input element** typing is partial (extend `OpenTUIInputProps` as needed)
- **No tests** for TUI components
- **Frames only captured on mount** (not every render)
- **Limited scrolling** in some views (terminal height constraint)

### ❌ Missing Features
- Real-time updates (WebSocket/SSE)
- Mouse support (OpenTUI supports, not enabled)
- Copy/paste from views
- Search/filter within views
- Graph visualizations (dependency trees)
- Performance metrics dashboard
- Log streaming (currently file-based)
- Responsive layout (fixed height calculations)

## Reference: OpenTUI

**Vendor library** at `reference/opentui/` (git submodule).

```bash
# Grep for usage patterns
grep -r "useKeyboard" reference/opentui/

# Find examples
ls reference/opentui/packages/core/src/examples/

# Check API
cat reference/opentui/packages/react/src/index.ts
```

**Not a dependency** - exists for AI context only.

## Extending the TUI

### Add a New View

1. Create component in `src/tui/components/views/`:
```typescript
export function MyView({ db, height }: ViewProps) {
  const data = usePollMyData(db)

  return (
    <box style={{ flexDirection: 'column' }}>
      <text content="My View" style={{ fg: '#7aa2f7' }} />
      {/* ... */}
    </box>
  )
}
```

2. Add hook in `src/tui/hooks/`:
```typescript
export function usePollMyData(db: SmithersDB) {
  const [data, setData] = useState([])

  useEffect(() => {
    const poll = () => {
      const result = db.query('SELECT * FROM my_table')
      setData(result)
    }
    poll()
    const interval = setInterval(poll, 500)
    return () => clearInterval(interval)
  }, [db])

  return data
}
```

3. Register in `App.tsx`:
```typescript
const TABS = [
  // ...
  { key: 'myview', label: 'My View', shortcut: 'F7' }
]

// In renderView():
case 'myview':
  return <MyView db={db} height={contentHeight} />
```

### Add a Database Query

```typescript
// Simple query
const rows = db.query<MyRow>('SELECT * FROM table WHERE x = ?', [value])

// Query one
const row = db.queryOne<MyRow>('SELECT * FROM table WHERE id = ?', [id])

// Get current execution
const execution = db.execution.current()
```

## Entry Points

| File | Purpose |
|------|---------|
| src/tui/index.tsx:12 | `launchTUI()` - main entry point |
| src/tui/App.tsx:39 | Root component with tab routing |
| src/commands/monitor.ts:33 | CLI integration |

## Testing

```bash
# No tests yet - manual testing only
bun src/tui/index.tsx .smithers/data

# In another terminal, run orchestration
bun .smithers/main.tsx

# Watch TUI update in real-time
```

## Color Palette (Tokyo Night)

```typescript
const colors = {
  bg: '#1a1b26',         // Background
  fg: '#c0caf5',         // Foreground
  blue: '#7aa2f7',       // Headers, important text
  cyan: '#7dcfff',       // Details, secondary
  purple: '#bb9af7',     // Phases
  green: '#9ece6a',      // Success, running
  teal: '#73daca',       // Completed
  red: '#f7768e',        // Errors
  orange: '#e0af68',     // Warnings, pending
  comment: '#565f89',    // Dim text
  darker: '#414868',     // Even dimmer
  selection: '#24283b',  // Selected row
}
```

## FAQ

**Q: Why separate process instead of integrated UI?**
A: Orchestration is long-running (days). TUI can crash/restart without affecting work.

**Q: Why polling instead of reactive queries?**
A: TUI is separate process - can't share memory. Reactive SQLite via useQueryValue coming soon.

**Q: Why OpenTUI instead of ink/blessed?**
A: Newer, better TypeScript support, more performant rendering.

**Q: Can I use useState in TUI?**
A: Yes! TUI is ephemeral. useState is fine. Only orchestration components must use DB.

**Q: How to debug TUI rendering?**
A: Add `console.log()` - outputs to terminal stderr, visible outside TUI.

**Q: Why 500ms polling?**
A: Balance between responsiveness and DB load. Configurable per hook.

**Q: Can TUI modify execution state?**
A: Yes - HumanInteractionHandler writes approvals to DB, orchestration polls for them.
