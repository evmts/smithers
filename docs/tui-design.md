---
title: TUI Design
description: Terminal UI layout, navigation, and state design
---

# TUI Design Documentation

This document defines the user interface design, keyboard navigation, component hierarchy, and state management for the Smithers Terminal UI.

## Design Goals

1. **Intuitive Navigation** - Arrow keys and familiar shortcuts for browsing agent execution
2. **Real-time Updates** - Show execution progress as it happens (Ralph loop frames)
3. **Minimal but Informative** - Essential information without clutter
4. **Responsive** - Adapt to various terminal sizes gracefully
5. **Non-blocking** - TUI observes execution without interfering with agent logic

## UI Mockup

### Main View (Tree + Status Bar)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Smithers Agent Execution                                Frame 3/10   2.3s  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│ ▼ ROOT                                                   [complete]        │
│   ▼ Phase: Research                                     [complete]        │
│     ▶ Claude: Gather Information                        [complete]        │
│     ▶ Claude: Analyze Data                              [complete]        │
│   ▼ Phase: Implementation                               [running]         │
│ →   • Claude: Write Code                                [running]         │
│     • Claude: Write Tests                               [pending]         │
│     ▶ Subagent: Review (parallel)                       [pending]         │
│       • Claude: Code Review                             [pending]         │
│       • Claude: Security Check                          [pending]         │
│   ▶ Phase: Finalization                                 [pending]         │
│     • Claude: Generate Summary                          [pending]         │
│                                                                            │
│                                                                            │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│ ↑/↓: Navigate  →: Expand  ←: Collapse  ↵: View Details  q: Quit           │
└────────────────────────────────────────────────────────────────────────────┤
```

### Agent Detail View (Activated by pressing Enter on a Claude/ClaudeApi node)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Agent Details: Claude: Write Code                            [running]     │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│ ┌─ Prompt ─────────────────────────────────────────────────────────────┐  │
│ │ Implement the authentication middleware with JWT token validation.  │  │
│ │ Use the existing user model and ensure proper error handling.       │  │
│ │                                                                      │  │
│ │ Requirements:                                                        │  │
│ │ - Validate JWT signature                                            │  │
│ │ - Check token expiration                                            │  │
│ │ - Attach user object to request                                     │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│ ┌─ Output (streaming) ─────────────────────────────────────────────────┐  │
│ │ I'll implement the JWT authentication middleware. Let me start by   │  │
│ │ reading the existing user model...                                  │  │
│ │                                                                      │  │
│ │ [Tool: Read] Reading src/models/user.ts                            │  │
│ │ [Result] User model loaded successfully                             │  │
│ │                                                                      │  │
│ │ Now I'll create the middleware:                                     │  │
│ │                                                                      │  │
│ │ [Tool: Write] Writing src/middleware/auth.ts                       │  │
│ │ [In Progress...] ▌                                                  │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│ Esc: Back to tree  ↑/↓: Scroll  q: Quit                                   │
└────────────────────────────────────────────────────────────────────────────┤
```

### Compact View (Small Terminal Height)

When terminal height < 20 lines, switch to compact mode:

```
┌──────────────────────────────────────────────────────────────────┐
│ Smithers                                  Frame 3/10      2.3s   │
├──────────────────────────────────────────────────────────────────┤
│ ▶ Phase: Research                                    [complete]  │
│ → Phase: Implementation                              [running]   │
│ ▶ Phase: Finalization                                [pending]   │
├──────────────────────────────────────────────────────────────────┤
│ ↑/↓: Nav  →/←: Expand  ↵: Details  q: Quit                      │
└──────────────────────────────────────────────────────────────────┘
```

## Visual Design Elements

### Node Type Icons

| Icon | Node Type | Description |
|------|-----------|-------------|
| `▶`  | Collapsed | Node has children, currently collapsed |
| `▼`  | Expanded  | Node has children, currently expanded |
| `•`  | Leaf      | Node has no children (agent or step) |
| `→`  | Selected  | Currently selected node |

### Execution Status Indicators

| Status | Badge | Color |
|--------|-------|-------|
| Pending | `[pending]` | Gray/dim |
| Running | `[running]` | Yellow/bright |
| Complete | `[complete]` | Green |
| Error | `[error]` | Red |

### Color Scheme

Following terminal-friendly color conventions:

- **Selected row**: Blue background with white text
- **Status badges**:
  - `[pending]`: Dim gray
  - `[running]`: Bright yellow
  - `[complete]`: Bright green
  - `[error]`: Bright red
- **Node icons**: Bright white or blue
- **Text**: Default terminal color
- **Borders**: Dim gray
- **Status bar**: Inverted colors (background highlight)

## Keyboard Navigation Specification

### Global Keys (Available in all views)

| Key | Action | Notes |
|-----|--------|-------|
| `q` | Quit TUI | Return to CLI, execution continues in background |
| `Ctrl+C` | Force quit | Terminate execution immediately |
| `?` | Show help | Overlay with keyboard shortcuts |

### Tree View Keys

| Key | Action | Details |
|-----|--------|---------|
| `↑` / `k` | Move up | Select previous node in tree (depth-first traversal) |
| `↓` / `j` | Move down | Select next node in tree |
| `→` / `l` | Expand | Expand selected node (if it has children) |
| `←` / `h` | Collapse | Collapse selected node (if expanded) |
| `Enter` | View details | Show agent detail view (only for Claude/ClaudeApi nodes) |
| `Space` | Toggle expand/collapse | Quick toggle |
| `Home` | Jump to top | Select first node (ROOT) |
| `End` | Jump to bottom | Select last visible node |
| `Page Up` | Scroll up | Move up by 10 nodes |
| `Page Down` | Scroll down | Move down by 10 nodes |

**Navigation Rules:**
- Navigation follows depth-first order (pre-order traversal)
- Collapsed nodes' children are skipped in navigation
- If selected node is removed (e.g., conditional rendering changes), select previous sibling or parent
- Navigation wraps at top/bottom (optional, configurable)

### Agent Detail View Keys

| Key | Action | Details |
|-----|--------|---------|
| `Esc` / `Backspace` | Back to tree | Return to tree view |
| `↑` / `k` | Scroll up | Scroll output content up |
| `↓` / `j` | Scroll down | Scroll output content down |
| `Page Up` | Page up | Scroll up by page height |
| `Page Down` | Page down | Scroll down by page height |
| `Home` | Jump to top | Scroll to beginning of output |
| `End` | Jump to bottom | Scroll to end of output (auto-scroll during streaming) |
| `Tab` | Toggle section | Switch between Prompt and Output sections |

**Auto-scroll Behavior:**
- During streaming output, automatically scroll to bottom
- User scrolling up disables auto-scroll
- Pressing `End` re-enables auto-scroll

## Component Hierarchy

```
<TuiRoot>
├── <Layout>
│   ├── <Header>
│   │   └── Frame counter, elapsed time
│   ├── <MainPanel>
│   │   ├── <TreeView> (if view === 'tree')
│   │   │   ├── <TreeNode> (recursive)
│   │   │   │   ├── Icon (expand/collapse/leaf)
│   │   │   │   ├── Label
│   │   │   │   └── Status badge
│   │   │   └── ... (children nodes)
│   │   └── <AgentPanel> (if view === 'detail')
│   │       ├── <AgentPrompt>
│   │       │   └── Scrollable prompt text
│   │       └── <AgentOutput>
│   │           └── Scrollable output with streaming
│   └── <StatusBar>
│       └── Keyboard shortcuts
└── <HelpOverlay> (conditional, shown when '?' pressed)
    └── Full keyboard shortcut reference
```

## State Management

The TUI maintains its own React state separate from the agent execution state:

### TUI State (useState / Zustand)

```typescript
interface TuiState {
  // View state
  view: 'tree' | 'detail'
  selectedNodePath: string | null  // e.g., "ROOT/phase[0]/claude[1]"
  expandedPaths: Set<string>       // Set of expanded node paths

  // Detail view state
  detailNodePath: string | null    // Which node is shown in detail view
  detailScrollOffset: number       // Scroll position in detail view
  autoScroll: boolean              // Whether to auto-scroll during streaming

  // Execution tracking
  currentFrame: number
  maxFrames: number
  startTime: number

  // Help overlay
  showHelp: boolean
}
```

### Agent Execution State (Read-only from SmithersNode tree)

The TUI reads execution state from the SmithersNode tree that's already managed by `executePlan()`:

```typescript
// Already exists in SmithersNode
interface ExecutionState {
  status: 'pending' | 'running' | 'complete' | 'error'
  result?: unknown
  error?: Error
  contentHash?: string
}
```

**Key Design Principle:** TUI is a pure observer. It reads from SmithersNode tree but never modifies it. All state changes happen through normal agent execution flow.

## Integration with Ralph Loop

### Execution Flow with TUI

```
1. User runs: smithers run agent.mdx --tui
2. CLI loads agent file and renders initial plan
3. CLI creates TUI root and renders TUI
4. TUI displays initial tree (all nodes [pending])
5. CLI calls executePlan() with onFrameUpdate callback
6. For each frame:
   a. Execute pending nodes (agent calls, etc.)
   b. Update SmithersNode._execution status
   c. Call onFrameUpdate(tree, frameNum)
   d. TUI re-renders with updated tree
   e. If state changed, re-render plan (Ralph loop)
7. When execution complete:
   a. Show final tree (all [complete] or some [error])
   b. Wait for user to quit (press 'q')
   c. Exit TUI and return to CLI
```

### executePlan() Integration Point

Add optional callback to `executePlan()`:

```typescript
interface ExecutePlanOptions {
  // ... existing options ...
  onFrameUpdate?: (tree: SmithersNode, frame: number) => void | Promise<void>
}
```

The callback is called after each Ralph loop frame, allowing TUI to update in real-time.

### TUI Initialization

```typescript
// In CLI run command (src/cli/commands/run.ts)

if (options.tui) {
  // Create OpenTUI renderer
  const renderer = await createCliRenderer()
  const tuiRoot = createRoot(renderer)

  // Render TUI with initial tree
  let currentTree: SmithersNode
  tuiRoot.render(<TuiRoot tree={currentTree} />)

  // Execute with TUI updates
  await executePlan(currentTree, {
    ...options,
    onFrameUpdate: async (tree, frame) => {
      currentTree = tree
      tuiRoot.render(<TuiRoot tree={tree} frame={frame} />)
      // Wait a bit for TUI to render before next frame
      await new Promise(resolve => setImmediate(resolve))
    }
  })

  // Keep TUI open after execution
  // Wait for user to press 'q'
  await waitForQuit(tuiRoot)

  // Cleanup
  renderer.cleanup()
}
```

## Component Specifications

### TreeView Component

**Purpose:** Display and navigate the SmithersNode tree

**Props:**
```typescript
interface TreeViewProps {
  tree: SmithersNode
  selectedPath: string | null
  expandedPaths: Set<string>
  onSelectNode: (path: string) => void
  onToggleExpand: (path: string) => void
  onViewDetails: (path: string) => void
}
```

**Behavior:**
- Render tree recursively using depth-first traversal
- Highlight selected node with blue background
- Show expand/collapse icons based on expandedPaths
- Show execution status badge from node._execution.status
- Handle arrow key navigation
- Handle Enter key for viewing details

**Rendering Rules:**
- Only render visible nodes (collapsed nodes hide children)
- If tree height exceeds terminal height, scroll selected node into view
- Use virtualization if tree has 100+ nodes (future optimization)

### AgentPanel Component

**Purpose:** Display detailed information about a Claude/ClaudeApi node

**Props:**
```typescript
interface AgentPanelProps {
  node: SmithersNode  // Must be type 'claude' or 'claude-api'
  scrollOffset: number
  autoScroll: boolean
  onScrollChange: (offset: number) => void
}
```

**Behavior:**
- Display prompt in top section (read from node.children)
- Display output in bottom section (read from node._execution.result)
- Support scrolling both sections independently
- Auto-scroll output during streaming if autoScroll is true
- Handle Tab key to switch between sections
- Handle Esc to return to tree view

**Streaming Output:**
- Subscribe to streaming events from executor (if available)
- Append new chunks to output in real-time
- Auto-scroll to bottom unless user has manually scrolled up

### Layout Component

**Purpose:** Manage overall TUI layout and responsive behavior

**Props:**
```typescript
interface LayoutProps {
  view: 'tree' | 'detail'
  header: React.ReactNode
  content: React.ReactNode
  statusBar: React.ReactNode
}
```

**Behavior:**
- Use `useTerminalDimensions()` to get terminal size
- Allocate space for header (1 line), content (remaining), statusBar (1 line)
- Switch to compact mode if height < 20 lines
- Handle terminal resize gracefully

**Responsive Breakpoints:**
- **Height < 15 lines:** Minimal UI, hide statusBar
- **Height 15-19 lines:** Compact mode, shorter labels
- **Height 20+ lines:** Full UI with all details
- **Width < 60 columns:** Truncate long labels with "..."
- **Width 60-99 columns:** Standard layout
- **Width 100+ columns:** Full layout with extra details

### StatusBar Component

**Purpose:** Display keyboard shortcuts and help

**Props:**
```typescript
interface StatusBarProps {
  view: 'tree' | 'detail'
}
```

**Behavior:**
- Show relevant keyboard shortcuts for current view
- Inverted colors (highlight background)
- Truncate shortcuts if terminal width is small

## Error Handling

### Execution Errors

When a node has `_execution.status === 'error'`:
- Show `[error]` badge in red
- In tree view, expand ancestors to make error visible
- In detail view, show error message in Output section
- Allow navigation to error nodes

### Terminal Too Small

If terminal dimensions are too small to render UI:
- Minimum width: 40 columns
- Minimum height: 10 lines
- If smaller, show message: "Terminal too small. Resize to at least 40x10."

### TUI Crashes

If TUI encounters an error:
- Catch at top level
- Restore terminal state (clear screen, reset cursor)
- Print error message
- Continue execution in non-TUI mode
- Save TUI error to log file for debugging

## Future Enhancements (Post-MVP)

These features are out of scope for initial TUI but worth considering:

1. **Interactive Editing**
   - Edit prompt before execution
   - Pause/resume execution
   - Retry failed agents

2. **Performance Metrics**
   - Token usage per agent
   - Execution time per node
   - Memory usage graph

3. **Filtering and Search**
   - Filter tree by status (show only errors)
   - Search tree by node name
   - Collapse all / expand all shortcuts

4. **Multiple Execution Sessions**
   - Tab view for multiple runs
   - Compare results side-by-side

5. **Log Export**
   - Export execution log to file
   - Save specific agent outputs
   - Copy to clipboard (if terminal supports)

6. **Color Themes**
   - Light/dark theme toggle
   - Custom color schemes
   - High contrast mode

7. **Mouse Support**
   - Click to select node
   - Click to expand/collapse
   - Scroll with mouse wheel

## Testing Strategy

### Unit Tests

Test components in isolation with mocked tree data:

```typescript
describe('TreeView', () => {
  it('should render nodes with correct status badges', () => {
    const tree = createMockTree()
    render(<TreeView tree={tree} ... />)
    // Assert status badges are correct
  })

  it('should handle arrow key navigation', () => {
    const onSelectNode = jest.fn()
    render(<TreeView onSelectNode={onSelectNode} ... />)
    // Simulate arrow down key
    // Assert onSelectNode called with next path
  })
})
```

### Integration Tests

Test full TUI flow with real OpenTUI renderer:

```typescript
describe('TUI Integration', () => {
  it('should update tree as execution progresses', async () => {
    const tree = await renderPlan(<TestAgent />)
    const renderer = await createCliRenderer()
    const root = createRoot(renderer)

    root.render(<TuiRoot tree={tree} />)

    await executePlan(tree, {
      onFrameUpdate: (updatedTree, frame) => {
        root.render(<TuiRoot tree={updatedTree} frame={frame} />)
      }
    })

    // Assert final tree state is correct
  })
})
```

### Manual Testing

Essential for visual and interaction testing:
- Test in multiple terminal emulators
- Test with various terminal sizes
- Test keyboard navigation feels responsive
- Test colors look good in light/dark themes
- Test with real agent executions (not mocks)

## Implementation Plan

### Phase 1: Basic TUI (Weeks 1-2)

1. **Set up OpenTUI** (Day 1)
   - Install Zig
   - Install @opentui/core and @opentui/react
   - Create basic "Hello World" TUI

2. **TreeView Component** (Days 2-4)
   - Render SmithersNode tree recursively
   - Show node type, name, and status
   - Implement expand/collapse logic
   - Add arrow key navigation

3. **Layout & StatusBar** (Day 5)
   - Create Layout component with header and status bar
   - Implement responsive sizing
   - Add frame counter and elapsed time

4. **Integration with executePlan** (Day 6-7)
   - Add onFrameUpdate callback
   - Update TUI on each frame
   - Test with real agent execution

### Phase 2: Agent Detail View (Week 3)

1. **AgentPanel Component** (Days 1-3)
   - Render prompt and output sections
   - Implement scrolling
   - Add Tab key section switching

2. **Detail View Navigation** (Days 4-5)
   - Handle Enter key from tree view
   - Handle Esc key back to tree
   - Preserve scroll state

3. **Streaming Output** (Days 6-7)
   - Subscribe to streaming events
   - Update output in real-time
   - Implement auto-scroll behavior

### Phase 3: Polish & Testing (Week 4)

1. **Error Handling** (Days 1-2)
   - Handle execution errors gracefully
   - Handle terminal resize
   - Handle TUI crashes

2. **Help Overlay** (Day 3)
   - Implement '?' key help
   - Show all keyboard shortcuts
   - Add examples

3. **Testing** (Days 4-7)
   - Write unit tests
   - Write integration tests
   - Manual testing across terminals
   - Fix bugs and polish UX

## Success Criteria

The TUI is ready for release when:

1. ✅ All keyboard navigation works smoothly
2. ✅ Tree updates in real-time during execution
3. ✅ Agent detail view shows prompt and output
4. ✅ Handles terminal resize without crashing
5. ✅ Works in major terminal emulators (iTerm, Terminal.app, Alacritty)
6. ✅ Colors are readable in light and dark themes
7. ✅ No visual glitches or flickering
8. ✅ Performance is acceptable with 50+ node trees
9. ✅ Error states are clearly communicated
10. ✅ User can always quit cleanly (press 'q')

## Appendix: ASCII Art Guidelines

When creating mockups, use these box-drawing characters:

```
┌─┬─┐   Top borders
│ │ │   Vertical borders
├─┼─┤   Middle borders
└─┴─┘   Bottom borders

▶ ▼ ◀ ▲   Triangular arrows
→ ← ↑ ↓   Line arrows
• ○ ◆ ◇   Bullets
```

Character encoding: UTF-8 (required for box-drawing characters)

Terminal compatibility: Modern terminals support these characters, but test on target platforms.
