# TUI Research: OpenTUI Integration

This document captures research on OpenTUI architecture and integration patterns for building an interactive terminal UI for the Ralph Wiggum loop in Smithers.

## OpenTUI Overview

OpenTUI is a TypeScript library for building terminal user interfaces (TUIs) using declarative frameworks. It's currently in development (v0.1.69 as of January 2026) but is actively used in production projects like opencode and terminaldotshop.

**GitHub:** https://github.com/sst/opentui
**npm Package:** @opentui/react, @opentui/core
**Stars:** 7.1k | **Contributors:** 47 | **Releases:** 27

## Architecture

### Monorepo Structure

OpenTUI is organized as a monorepo with specialized packages:

1. **@opentui/core** - Foundational layer with imperative API and primitives
2. **@opentui/react** - React reconciler integration (what we'll use)
3. **@opentui/solid** - SolidJS integration
4. **@opentui/vue** - Vue integration (unmaintained)
5. **@opentui/go** - Go bindings (unmaintained)

### The Reconciler Pattern

OpenTUI implements a **reconciler architecture** similar to react-dom or react-native:
- Multiple frontend frameworks (React, Solid) can target the same core
- Developers write declarative components using familiar patterns
- The core handles actual terminal rendering and low-level operations
- **This is exactly like our SmithersNode renderer pattern!**

**Key Insight:** Smithers already uses `react-reconciler` for JSX → SmithersNode tree. OpenTUI also uses `react-reconciler` for JSX → terminal rendering. We'll need to carefully integrate both reconcilers.

### Technical Stack

- **Primary Language:** TypeScript (67.4% of codebase)
- **Native Layer:** Zig (30.2% of codebase) - handles performance-critical terminal I/O
- **Performance:** Sub-millisecond frame times mentioned in community discussions

### Zig Dependency

**CRITICAL:** Zig must be installed on the system to build OpenTUI packages.

```bash
# macOS
brew install zig

# Linux
snap install zig --classic --beta

# Windows
choco install zig
```

Zig handles:
- Low-level terminal I/O operations
- System-level abstractions that TypeScript cannot directly manage
- Performance-critical rendering operations

## @opentui/react API

### Installation

```bash
bun install @opentui/react @opentui/core react
```

Or use the template:
```bash
bun create tui --template react
```

### TypeScript Configuration

Must configure JSX import source:
```json
{
  "compilerOptions": {
    "jsxImportSource": "@opentui/react"
  }
}
```

### Core Components

#### Layout & Display
- `<text>` - Render styled text content
- `<box>` - Container with borders and layout control
- `<scrollbox>` - Scrollable container
- `<ascii-font>` - ASCII art text with font styles

#### Input Components
- `<input>` - Single-line text field
- `<textarea>` - Multi-line text input
- `<select>` - Dropdown selection
- `<tab-select>` - Tab-based selection

#### Code & Diff
- `<code>` - Syntax-highlighted code blocks
- `<line-number>` - Code display with line numbers and diagnostics
- `<diff>` - Unified or split diff viewer

### Hooks API

#### `useRenderer()`

Returns the `CliRenderer` instance for advanced operations:

```typescript
import { useRenderer } from "@opentui/react"
import { useEffect } from "react"

function App() {
  const renderer = useRenderer()
  useEffect(() => {
    renderer.console.show()
    console.log("Hello, from the console!")
  }, [])
  return <box />
}
```

**Use cases:**
- Access console output
- Terminal dimensions
- Event emitters
- Direct renderer control

#### `useKeyboard(handler, options?)`

Registers global keyboard event handler:

```typescript
import { useKeyboard } from "@opentui/react"
import { useState } from "react"

function App() {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set())

  useKeyboard(
    (event) => {
      setPressedKeys((keys) => {
        const newKeys = new Set(keys)
        if (event.eventType === "release") {
          newKeys.delete(event.name)
        } else {
          newKeys.add(event.name)
        }
        return newKeys
      })
    },
    { release: true }
  )

  return (
    <box>
      <text>Currently pressed: {Array.from(pressedKeys).join(", ") || "none"}</text>
    </box>
  )
}
```

**Options:**
- `release: true` - Also receive key release events (default: only press events)

**Event types:**
- `"press"` - Initial key press
- `"repeat"` - Key held down
- `"release"` - Key released

#### `useTerminalDimensions()`

Gets current terminal dimensions, auto-updates on resize:

```typescript
const { width, height } = useTerminalDimensions()
```

**Reactivity:** Components automatically re-render when terminal is resized.

#### `useOnResize(callback)`

Handle terminal resize events with callback:

```typescript
useOnResize((dimensions) => {
  console.log(`Terminal resized to ${dimensions.width}x${dimensions.height}`)
})
```

#### `useTimeline(options?)`

Creates and manages animation timeline:

```typescript
const timeline = useTimeline({
  duration: 1000,
  loop: true,
  onComplete: () => console.log("Animation complete")
})
```

## Integration Patterns

### Dual Reconciler Challenge

Smithers uses `react-reconciler` to render JSX → SmithersNode tree. OpenTUI also uses `react-reconciler` to render JSX → terminal. We need to integrate both without conflicts.

**Possible approaches:**

1. **Separate React Roots** (Recommended)
   - Smithers reconciler renders SmithersNode tree (existing behavior)
   - OpenTUI reconciler renders TUI display (separate root)
   - Share state via React Context or Zustand store
   - TUI reads SmithersNode tree but doesn't modify it

2. **Nested Reconcilers**
   - Embed OpenTUI components inside Smithers reconciler
   - Would require custom host config integration
   - More complex, higher risk

3. **External TUI Process**
   - Run TUI as separate process
   - Communicate via IPC/WebSockets
   - Most isolated but adds complexity

**Recommendation:** Use Separate React Roots (#1) for simplicity and isolation.

### State Sharing Pattern

```typescript
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

// Smithers execution (existing)
const smithersRoot = createSmithersRoot()
const executionState = {
  tree: null,
  currentFrame: 0,
  status: 'running'
}

// OpenTUI display (new)
const renderer = await createCliRenderer() // Create the CLI renderer first
const tuiRoot = createRoot(renderer) // OpenTUI's createRoot expects a renderer
tuiRoot.render(
  <TUIApp executionState={executionState} />
)

// Update loop
while (executing) {
  executionState.tree = await renderPlan(element)
  executionState.currentFrame++
  // TUI automatically re-renders when executionState changes
}
```

### Performance Considerations

1. **Sub-millisecond Frames**: OpenTUI is designed for high-performance rendering
2. **Avoid Re-rendering Entire Tree**: Use React.memo for tree nodes
3. **Virtualization**: For large trees (100+ nodes), virtualize the display
4. **Debounce State Updates**: Don't update TUI on every tiny change

## Testing Strategy

1. **Unit Tests**: Test TUI components in isolation with mock SmithersNode trees
2. **Integration Tests**: Test TUI interaction with real executePlan() loop
3. **Snapshot Tests**: Visual regression testing for TUI layouts
4. **Manual Testing**: Actually use the TUI during development

## Development Workflow

1. Install Zig on development machine
2. Add @opentui/react and @opentui/core to dependencies
3. Create TUI components in `src/tui/` directory
4. Build TUI in parallel with existing CLI
5. Add `--tui` flag to `smithers run` command
6. Maintain non-TUI mode as default (for CI/CD compatibility)

## Open Questions

1. **Concurrent Mode**: How does OpenTUI handle React 19's concurrent rendering?
2. **Error Boundaries**: How to display execution errors in TUI?
3. **Streaming Output**: How to show agent output in real-time?
4. **Accessibility**: Terminal navigation for screen readers?
5. **Colors/Themes**: Should we match user's terminal theme?

## Next Steps

1. Create design mockups in `docs/tui-design.md`
2. Prototype basic tree view component
3. Test dual reconciler integration
4. Implement keyboard navigation
5. Add streaming output display

## Sources

- [OpenTUI GitHub Repository](https://github.com/sst/opentui)
- [React Integration Documentation](https://deepwiki.com/sst/opentui/5.1-example-framework)
- [@opentui/react Package](https://github.com/sst/opentui/tree/main/packages/react)
- [Framework Integrations](https://deepwiki.com/sst/opentui/5-examples-and-usage)
