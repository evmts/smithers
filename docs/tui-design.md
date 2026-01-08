# TUI Design: Interactive Ralph Wiggum Loop Interface

This document specifies the design for Smithers' terminal user interface (TUI), providing an interactive view of agent execution.

## Design Goals

1. **Visibility**: Show the entire SmithersNode tree and execution status at a glance
2. **Interactivity**: Navigate the tree, drill into agent details, view streaming output
3. **Performance**: Handle large trees (100+ nodes) without lag
4. **Clarity**: Clear visual hierarchy, execution status, and navigation hints
5. **Usability**: Intuitive keyboard navigation, helpful status bar

## UI Mockups

### Main View: Tree + Status Bar

```
┌─ Smithers Agent Execution ─────────────────────────────────────────────────┐
│                                                                             │
│ ▼ ROOT                                                                      │
│   ▼ claude [✓ complete]                                                    │
│     ▶ phase: "Planning"                                                    │
│   ▶ claude [⟳ running]                                                     │
│     ▶ phase: "Implementation"                                              │
│   ▶ claude [○ pending]                                                     │
│     ▶ phase: "Testing"                                                     │
│                                                                             │
│                                                                             │
│                                                                             │
│                                                                             │
│                                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
Frame 2/∞ | Elapsed: 12.4s | ↑↓ Navigate | → Expand | ← Collapse | ⏎ Details
```

### Agent Detail View

```
┌─ Claude Agent Details ──────────────────────────────────────────────────────┐
│                                                                             │
│ Status: Running                                                             │
│ Node Path: ROOT/claude[1]                                                   │
│ Content Hash: abc123...                                                     │
│                                                                             │
│ ─── Prompt ──────────────────────────────────────────────────────────────── │
│ You are implementing the authentication system. Review the                 │
│ requirements and write the code.                                            │
│                                                                             │
│ ─── Output (streaming) ──────────────────────────────────────────────────── │
│ I'll implement the authentication system. Let me start by                   │
│ reading the requirements...                                                 │
│ ▌                                                                           │
│                                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
Esc: Back to tree | Ctrl+C: Cancel execution
```

### Split View (Advanced)

```
┌─ Tree ──────────────────┬─ Agent Output ──────────────────────────────────┐
│                         │                                                  │
│ ▼ ROOT                  │ Claude Agent: ROOT/claude[1]                     │
│   ▼ claude [✓]          │ Status: Running                                  │
│     ▶ phase: "Planning" │                                                  │
│   ▶ claude [⟳]    ◄────┤ ─── Prompt ───────────────────────────────────── │
│     ▶ phase: "Impl"     │ You are implementing the authentication          │
│   ▶ claude [○]          │ system...                                        │
│     ▶ phase: "Testing"  │                                                  │
│                         │ ─── Output ────────────────────────────────────  │
│                         │ I'll implement the authentication system.        │
│                         │ Let me start by reading...                       │
│                         │ ▌                                                │
│                         │                                                  │
└─────────────────────────┴──────────────────────────────────────────────────┘
Frame 2/∞ | Elapsed: 12.4s | ↑↓ Navigate | Tab: Switch pane
```

## Visual Elements

### Execution Status Icons

| Icon | Status | Color | Meaning |
|------|--------|-------|---------|
| `○` | pending | dim/gray | Not yet executed |
| `⟳` | running | yellow | Currently executing |
| `✓` | complete | green | Successfully finished |
| `✗` | error | red | Failed with error |
| `⊗` | skipped | dim/gray | Skipped (conditional rendering) |

### Tree Expansion Icons

| Icon | Meaning |
|------|---------|
| `▶` | Collapsed (has children) |
| `▼` | Expanded (showing children) |
| `  ` | Leaf node (no children) |

### Node Type Labels

Format: `type [status]` or `type: "name" [status]`

Examples:
- `claude [⟳ running]`
- `phase: "Planning" [✓ complete]`
- `subagent: "Code Reviewer" [○ pending]`
- `step [✓ complete]`

## Component Architecture

### 1. TUI App Root (`src/tui/App.tsx`)

Main entry point that sets up the TUI application.

```typescript
interface TUIAppProps {
  executionState: ExecutionState
  onCancel?: () => void
}

export function TUIApp({ executionState, onCancel }: TUIAppProps) {
  const [view, setView] = useState<'tree' | 'detail' | 'split'>('tree')
  const [selectedNode, setSelectedNode] = useState<SmithersNode | null>(null)

  return (
    <box>
      {view === 'tree' && (
        <TreeView
          tree={executionState.tree}
          onSelect={setSelectedNode}
        />
      )}
      {view === 'detail' && selectedNode && (
        <AgentPanel
          node={selectedNode}
          onBack={() => setView('tree')}
        />
      )}
      {view === 'split' && (
        <SplitView
          tree={executionState.tree}
          selectedNode={selectedNode}
          onSelect={setSelectedNode}
        />
      )}
      <StatusBar
        frame={executionState.currentFrame}
        elapsed={executionState.elapsedTime}
        view={view}
      />
    </box>
  )
}
```

### 2. Tree View (`src/tui/TreeView.tsx`)

Displays the SmithersNode tree with keyboard navigation.

```typescript
interface TreeViewProps {
  tree: SmithersNode
  onSelect: (node: SmithersNode) => void
}

export function TreeView({ tree, onSelect }: TreeViewProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['ROOT']))
  const [selectedPath, setSelectedPath] = useState<string>('ROOT')
  const flatTree = useMemo(() => flattenTree(tree, expandedPaths), [tree, expandedPaths])

  useKeyboard((event) => {
    if (event.name === "up") {
      // Move selection up
      const index = flatTree.findIndex(n => n.path === selectedPath)
      if (index > 0) setSelectedPath(flatTree[index - 1].path)
    } else if (event.name === "down") {
      // Move selection down
      const index = flatTree.findIndex(n => n.path === selectedPath)
      if (index < flatTree.length - 1) setSelectedPath(flatTree[index + 1].path)
    } else if (event.name === "right") {
      // Expand node
      setExpandedPaths(prev => new Set([...prev, selectedPath]))
    } else if (event.name === "left") {
      // Collapse node
      setExpandedPaths(prev => {
        const next = new Set(prev)
        next.delete(selectedPath)
        return next
      })
    } else if (event.name === "return") {
      // View details
      const node = findNodeByPath(tree, selectedPath)
      if (node && (node.type === 'claude' || node.type === 'subagent')) {
        onSelect(node)
      }
    }
  })

  return (
    <scrollbox>
      {flatTree.map((item) => (
        <TreeNode
          key={item.path}
          node={item.node}
          depth={item.depth}
          isExpanded={expandedPaths.has(item.path)}
          isSelected={item.path === selectedPath}
        />
      ))}
    </scrollbox>
  )
}
```

### 3. Tree Node (`src/tui/TreeNode.tsx`)

Individual tree node renderer.

```typescript
interface TreeNodeProps {
  node: SmithersNode
  depth: number
  isExpanded: boolean
  isSelected: boolean
}

export function TreeNode({ node, depth, isExpanded, isSelected }: TreeNodeProps) {
  const hasChildren = node.children.length > 0
  const icon = getStatusIcon(node._execution?.status)
  const expandIcon = hasChildren ? (isExpanded ? '▼' : '▶') : '  '
  const indent = '  '.repeat(depth)
  const label = formatNodeLabel(node)
  const bgColor = isSelected ? 'blue' : 'transparent'

  return (
    <text style={{ backgroundColor: bgColor }}>
      {indent}{expandIcon} {label} [{icon} {node._execution?.status || 'pending'}]
    </text>
  )
}

function getStatusIcon(status?: string): string {
  switch (status) {
    case 'running': return '⟳'
    case 'complete': return '✓'
    case 'error': return '✗'
    default: return '○'
  }
}

function formatNodeLabel(node: SmithersNode): string {
  if (node.type === 'ROOT') return 'ROOT'
  if (node.type === 'TEXT') return `"${truncate(node.content, 30)}"`
  
  const name = node.props?.name || node.props?.role
  if (name) return `${node.type}: "${name}"`
  
  return node.type
}
```

### 4. Agent Panel (`src/tui/AgentPanel.tsx`)

Detail view for Claude/Subagent nodes.

```typescript
interface AgentPanelProps {
  node: SmithersNode
  onBack: () => void
}

export function AgentPanel({ node, onBack }: AgentPanelProps) {
  useKeyboard((event) => {
    if (event.name === "escape") {
      onBack()
    }
  })

  const prompt = extractPrompt(node)
  const output = node._execution?.result?.output || ''
  const status = node._execution?.status || 'pending'

  return (
    <box border>
      <text style={{ fontWeight: 'bold' }}>Claude Agent Details</text>
      <text>Status: {status}</text>
      <text>Node Path: {node.path}</text>
      <text>Content Hash: {node._execution?.contentHash?.substring(0, 10)}...</text>
      
      <box border style={{ marginTop: 1 }}>
        <text style={{ fontWeight: 'bold' }}>─── Prompt ───</text>
        <text>{prompt}</text>
      </box>
      
      <box border style={{ marginTop: 1 }}>
        <text style={{ fontWeight: 'bold' }}>─── Output {status === 'running' ? '(streaming)' : ''} ───</text>
        <scrollbox>
          <text>{output}</text>
          {status === 'running' && <text>▌</text>}
        </scrollbox>
      </box>
    </box>
  )
}
```

### 5. Status Bar (`src/tui/StatusBar.tsx`)

Bottom status bar with hints and stats.

```typescript
interface StatusBarProps {
  frame: number
  elapsed: number
  view: 'tree' | 'detail' | 'split'
}

export function StatusBar({ frame, elapsed, view }: StatusBarProps) {
  const hints = getHintsForView(view)
  
  return (
    <box style={{ position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'gray' }}>
      <text>
        Frame {frame}/{frame === 0 ? '?' : '∞'} | 
        Elapsed: {formatTime(elapsed)} | 
        {hints.join(' | ')}
      </text>
    </box>
  )
}

function getHintsForView(view: string): string[] {
  if (view === 'tree') {
    return ['↑↓ Navigate', '→ Expand', '← Collapse', '⏎ Details', 'Ctrl+C Exit']
  }
  if (view === 'detail') {
    return ['Esc Back', 'Ctrl+C Exit']
  }
  return ['↑↓ Navigate', 'Tab Switch pane', 'Ctrl+C Exit']
}
```

### 6. Split View (`src/tui/SplitView.tsx`)

Combined tree + detail view.

```typescript
interface SplitViewProps {
  tree: SmithersNode
  selectedNode: SmithersNode | null
  onSelect: (node: SmithersNode) => void
}

export function SplitView({ tree, selectedNode, onSelect }: SplitViewProps) {
  const { width } = useTerminalDimensions()
  const treeWidth = Math.floor(width * 0.4)
  const panelWidth = width - treeWidth - 1

  return (
    <box>
      <box style={{ width: treeWidth, borderRight: true }}>
        <TreeView tree={tree} onSelect={onSelect} />
      </box>
      <box style={{ width: panelWidth }}>
        {selectedNode ? (
          <AgentPanel node={selectedNode} onBack={() => {}} />
        ) : (
          <text>Select an agent to view details</text>
        )}
      </box>
    </box>
  )
}
```

## State Management

### ExecutionState Interface

Shared between Smithers executor and TUI:

```typescript
interface ExecutionState {
  tree: SmithersNode | null
  currentFrame: number
  elapsedTime: number
  status: 'initializing' | 'running' | 'paused' | 'complete' | 'error'
  error?: Error
  
  // Streaming output
  streamingNode?: string // node path
  streamingContent?: string
}
```

### State Updates

```typescript
// In executePlan()
const executionState: ExecutionState = {
  tree: null,
  currentFrame: 0,
  elapsedTime: 0,
  status: 'initializing'
}

// TUI subscribes to updates
const tuiRoot = createTUIRoot()
tuiRoot.render(<TUIApp executionState={executionState} />)

// Update loop
while (executing) {
  const startTime = Date.now()
  
  executionState.tree = await renderPlan(element)
  executionState.currentFrame++
  executionState.status = 'running'
  
  // Execute agents...
  
  executionState.elapsedTime = Date.now() - startTime
  
  // TUI automatically re-renders
}
```

## Keyboard Navigation Specification

### Tree View Mode

| Key | Action |
|-----|--------|
| `↑` / `k` | Move selection up |
| `↓` / `j` | Move selection down |
| `→` / `l` | Expand selected node |
| `←` / `h` | Collapse selected node |
| `Enter` | View agent details (if Claude/Subagent) |
| `Space` | Toggle expand/collapse |
| `Home` | Jump to root |
| `End` | Jump to last node |
| `Tab` | Switch to split view |
| `q` / `Ctrl+C` | Exit |

### Detail View Mode

| Key | Action |
|-----|--------|
| `Esc` | Back to tree view |
| `↑` / `k` | Scroll output up |
| `↓` / `j` | Scroll output down |
| `PageUp` | Scroll page up |
| `PageDown` | Scroll page down |
| `Home` | Scroll to top |
| `End` | Scroll to bottom |
| `q` / `Ctrl+C` | Exit |

### Split View Mode

| Key | Action |
|-----|--------|
| `Tab` | Switch active pane |
| `↑` / `↓` | Navigate (active pane) |
| `→` / `←` | Expand/collapse (tree pane) |
| `Enter` | Select agent (tree pane) |
| `q` / `Ctrl+C` | Exit |

## Performance Optimization

### Virtual Scrolling

For trees with 100+ nodes, use virtual scrolling:

```typescript
function VirtualTreeView({ tree, viewportHeight }: VirtualTreeViewProps) {
  const flatTree = flattenTree(tree)
  const [scrollOffset, setScrollOffset] = useState(0)
  const visibleNodes = flatTree.slice(scrollOffset, scrollOffset + viewportHeight)

  return (
    <box>
      {visibleNodes.map((node, i) => (
        <TreeNode key={node.path} node={node} index={scrollOffset + i} />
      ))}
    </box>
  )
}
```

### React.memo for Nodes

Prevent unnecessary re-renders:

```typescript
export const TreeNode = React.memo(TreeNodeComponent, (prev, next) => {
  return (
    prev.node._execution?.status === next.node._execution?.status &&
    prev.isSelected === next.isSelected &&
    prev.isExpanded === next.isExpanded
  )
})
```

### Debounced Streaming Updates

Don't update TUI on every character:

```typescript
const debouncedUpdate = debounce((content: string) => {
  executionState.streamingContent = content
}, 100) // Update TUI every 100ms max
```

## Error Handling

### Error Display

Show errors inline in tree:

```
▼ ROOT
  ▼ claude [✗ error]
    ▶ Error: API rate limit exceeded
```

### Error Detail View

```
┌─ Execution Error ───────────────────────────────────────────────────────────┐
│                                                                             │
│ Node: ROOT/claude[1]                                                        │
│ Status: error                                                               │
│                                                                             │
│ Error: API rate limit exceeded                                             │
│                                                                             │
│ Stack Trace:                                                                │
│   at executeWithClaude (src/core/claude-executor.ts:123)                   │
│   at executePlan (src/core/execute.ts:456)                                 │
│                                                                             │
│ Actions:                                                                    │
│   [R] Retry execution                                                       │
│   [S] Skip this node                                                        │
│   [Q] Quit                                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Accessibility Considerations

1. **Screen Readers**: Use semantic labels for all UI elements
2. **High Contrast**: Support terminal theme colors
3. **Keyboard Only**: All functionality accessible via keyboard
4. **Status Announcements**: Announce status changes audibly (if supported)

## Integration with CLI

### CLI Flag

```bash
smithers run agent.tsx --tui        # Enable TUI mode
smithers run agent.tsx              # Default: non-TUI mode (CI-friendly)
```

### Feature Detection

```typescript
export function shouldUseTUI(): boolean {
  // Don't use TUI in CI environments
  if (process.env.CI) return false
  
  // Don't use TUI if output is redirected
  if (!process.stdout.isTTY) return false
  
  // User explicitly disabled TUI
  if (process.env.SMITHERS_NO_TUI) return false
  
  return true
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('TreeNode', () => {
  it('renders pending status icon', () => {
    const node = createMockNode({ _execution: { status: 'pending' } })
    const result = render(<TreeNode node={node} depth={0} />)
    expect(result).toContain('○')
  })
})
```

### Integration Tests

```typescript
describe('TUI Integration', () => {
  it('updates tree when execution state changes', async () => {
    const executionState = createMockExecutionState()
    const tui = renderTUI(<TUIApp executionState={executionState} />)
    
    executionState.tree = createMockTree()
    await waitFor(() => {
      expect(tui.getByText('ROOT')).toBeVisible()
    })
  })
})
```

### Manual Testing Checklist

- [ ] Navigate tree with arrow keys
- [ ] Expand/collapse nodes
- [ ] View agent details
- [ ] Watch streaming output in real-time
- [ ] Resize terminal window
- [ ] Handle very large trees (100+ nodes)
- [ ] Handle errors gracefully
- [ ] Exit cleanly with Ctrl+C

## Future Enhancements

1. **Search**: `/` to search tree for nodes
2. **Filtering**: Hide completed nodes, show only errors
3. **Themes**: Customizable color schemes
4. **Export**: Save tree view to file
5. **Replay**: Replay execution frame-by-frame
6. **Pause/Resume**: Pause execution, resume later
7. **Logs Panel**: Show all console output in separate pane
8. **Mouse Support**: Click to select nodes (optional)

## Open Questions

1. Should we support mouse input or keyboard-only?
2. How to handle very deep trees (20+ levels)?
3. Should we show tool calls in the tree?
4. How to display MCP server connections?
5. Should we persist TUI state between runs?

## Related Documents

- [TUI Research](./tui-research.md) - OpenTUI architecture and integration patterns
- [VHS Recording](./vhs-recording.md) - Demo recording workflow
- [CLI Commands](./cli-commands.md) - Interactive slash commands
