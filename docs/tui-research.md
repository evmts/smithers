---
title: TUI Research
description: Research notes on OpenTUI and integration patterns
---

# TUI Research Documentation

This document contains research findings on OpenTUI architecture, APIs, and integration patterns for building the Smithers TUI.

## Overview

OpenTUI is a TypeScript library for building terminal user interfaces (TUIs). It provides a React reconciler that allows building interactive terminal applications using familiar React patterns and components.

**Project Status:** OpenTUI is currently in development and is not ready for production use, but is actively maintained and documented as of late 2025/early 2026.

## Architecture

### Core Components

OpenTUI consists of three main packages:

1. **@opentui/core** - Core library with:
   - Standalone imperative API
   - Component primitives
   - Zig FFI bindings for native terminal rendering
   - Performance-optimized rendering engine

2. **@opentui/react** - React reconciler that:
   - Uses React's custom reconciler API (`react-reconciler`)
   - Bridges React's virtual DOM to OpenTUI's imperative Renderable tree
   - Provides React hooks for terminal-specific functionality
   - Enables declarative component-based TUI development

3. **@opentui/solid** - SolidJS integration (alternative to React)

### React Reconciler Pattern

OpenTUI uses the same `react-reconciler` package that Smithers uses for its XML rendering. This means:
- Both systems use custom host configs to define how React manages custom node trees
- OpenTUI renders React components to terminal output
- Smithers renders React components to SmithersNode trees (then XML)
- Both reconcilers are mutation-based (nodes modified in-place)

**Key Insight:** Since Smithers already has experience with React reconcilers, integrating OpenTUI should be straightforward from an architectural perspective.

### Rendering Model

```
React Components
       ↓
React Reconciler (@opentui/react)
       ↓
OpenTUI Renderable Tree
       ↓
Zig Native Layer (@opentui/core)
       ↓
Terminal Output (ANSI/Terminal Control Sequences)
```

## Dependencies

### Required

1. **Zig Compiler** - Critical requirement for building OpenTUI packages
   - Native terminal rendering components written in Zig
   - Must be installed on system before npm/bun install
   - Download from: https://ziglang.org/download/

2. **Bun Runtime** - OpenTUI uses Bun as package manager
   - Smithers already uses Bun, so no additional setup needed
   - Handles TypeScript transpilation

3. **Node.js/Bun** - Standard runtime for TypeScript execution

### Installation

```bash
# Install Zig first (macOS example)
brew install zig

# Install OpenTUI packages
bun add @opentui/core @opentui/react
```

## Available Components

OpenTUI provides a rich set of built-in components:

### Layout & Display

- **`<text>`** - Display text with styling
  - Supports text modifiers inside (span, strong, em, etc.)
  - Primary text rendering component

- **`<box>`** - Container with borders and layout
  - Supports backgroundColor, padding, and other style props
  - Main layout primitive

- **`<scrollbox>`** - Scrollable container
  - For content that exceeds terminal height

- **`<ascii-font>`** - ASCII art text with different font styles
  - Decorative text rendering

### Input Components

- **`<input>`** - Single-line text input field
- **`<textarea>`** - Multi-line text input
- **`<select>`** - Dropdown selection
- **`<tab-select>`** - Tab-based selection UI

### Code Display

- **`<code>`** - Code block with syntax highlighting
- **`<line-number>`** - Code with line numbers, diff highlights, diagnostics
- **`<diff>`** - Unified or split diff viewer with syntax highlighting

### Text Modifiers

Must be used inside `<text>` component:
- `<span>` - Text spans
- `<strong>`, `<b>` - Bold text
- `<em>`, `<i>` - Italic text
- `<u>` - Underlined text
- `<br>` - Line breaks

### Styling API

Components accept styles via direct props or a `style` prop object:

```tsx
<box backgroundColor="blue" padding={2}>
  <text color="white">Styled content</text>
</box>
```

## React Hooks API

OpenTUI provides several hooks for terminal-specific functionality:

### useRenderer()

Returns the `CliRenderer` instance, providing access to:
- Console output
- Terminal dimensions
- Event emitters
- Renderer features

**Usage:**
```tsx
const renderer = useRenderer();
// Access renderer.console, renderer.terminal, etc.
```

### useKeyboard(handler, options?)

Registers a global keyboard event handler.

**Features:**
- Receives key press, repeat, and release events
- By default only receives press events
- Set `options.release = true` to also receive release events
- Accesses the renderer via `useRenderer()` internally
- Subscribes to KeyHandler event emitter

**Signature:**
```tsx
useKeyboard((key: KeyEvent) => {
  // Handle keyboard input
}, { release?: boolean })
```

**Key Event Structure:**
- Key press events
- Key repeat events
- Key release events (if enabled)
- Modifier keys (ctrl, alt, shift)
- Special keys (arrows, enter, escape, etc.)

### useTerminalDimensions()

Returns current terminal dimensions and **automatically re-renders on resize**.

**Features:**
- Reactive - components update when terminal resizes
- Provides width and height
- Essential for responsive layouts

**Returns:**
```tsx
const { width, height } = useTerminalDimensions();
```

### useOnResize(callback)

Listens for terminal resize events without causing re-renders.

**Usage:**
```tsx
useOnResize(({ width, height }) => {
  // Handle resize without re-rendering
});
```

### useTimeline(options?)

Creates animations with property tweening.

**Features:**
- Duration control
- Loop support
- Completion callbacks
- Property interpolation

## Performance Characteristics

OpenTUI is designed for high-performance terminal rendering:

1. **Native Zig Layer** - Critical rendering operations in compiled native code
2. **Efficient Updates** - Reconciler-based diffing minimizes terminal redraws
3. **Sub-millisecond Frame Times** - Mentioned in OpenTUI documentation
4. **Optimized for Interactivity** - Fast keyboard/resize event handling

**Performance Goals for Smithers TUI:**
- 60 FPS capable rendering (16.67ms per frame budget)
- Instant keyboard response (<10ms)
- Smooth tree navigation with 100+ nodes
- Real-time streaming output updates

## Integration Patterns

### Basic Setup

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

const renderer = await createCliRenderer()
const root = createRoot(renderer)
root.render(<App />)
```

### Keyboard Navigation Pattern

```tsx
function NavigableTree() {
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  useKeyboard((key) => {
    if (key.name === 'up') {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.name === 'down') {
      setSelectedIndex(i => i + 1)
    } else if (key.name === 'return') {
      // Enter key - select item
    }
  })

  return (
    <box>
      {items.map((item, i) => (
        <text key={i} style={{
          backgroundColor: i === selectedIndex ? 'blue' : 'transparent'
        }}>
          {item}
        </text>
      ))}
    </box>
  )
}
```

### Responsive Layout Pattern

```tsx
function ResponsiveLayout() {
  const { width, height } = useTerminalDimensions()

  const leftPanelWidth = Math.floor(width * 0.3)
  const rightPanelWidth = width - leftPanelWidth

  return (
    <box>
      <box width={leftPanelWidth} height={height}>
        {/* Left panel content */}
      </box>
      <box width={rightPanelWidth} height={height}>
        {/* Right panel content */}
      </box>
    </box>
  )
}
```

## Smithers Integration Strategy

### Phase 1: Basic TUI Components

Create three main components:

1. **TreeView** - Navigate SmithersNode tree
   - Use `<box>` for container
   - Use `<text>` for tree nodes
   - Use `useKeyboard()` for arrow key navigation
   - Use `useTerminalDimensions()` for sizing

2. **AgentPanel** - Display agent details
   - Use `<box>` for panel container
   - Use `<code>` for displaying prompts/outputs
   - Use `<scrollbox>` for long content

3. **Layout** - Split-pane layout
   - Use `useTerminalDimensions()` for responsive sizing
   - Tree on left (30% width)
   - Agent panel on right (70% width)
   - Status bar at bottom

### Phase 2: Ralph Loop Integration

Integration points with existing Smithers architecture:

1. **executePlan()** already has frame-by-frame execution
2. Add optional `onFrameUpdate` callback to notify TUI
3. TUI subscribes to frame updates and re-renders
4. Execution state already tracked in SmithersNode._execution
5. TUI reads execution state directly from tree

**Key Design Decision:** TUI should be read-only observer of execution, not modify the tree directly. All state changes happen through normal React state management in the agent components.

### Phase 3: Advanced Features

1. Pause/resume execution from TUI
2. Interactive prompt editing
3. Real-time streaming output display
4. Performance metrics (frame time, token usage)

## Limitations and Gotchas

### Current Limitations

1. **Not Production Ready** - OpenTUI explicitly marked as in-development
   - May have breaking changes
   - May have bugs or incomplete features
   - API may change between versions

2. **Zig Dependency** - Requires Zig compiler installed
   - Build failures if Zig not available
   - May complicate CI/CD setup
   - Windows users must download releases directly

3. **Platform Support**
   - Linux/macOS well-supported
   - Windows support exists but has limitations
   - Some terminal emulators may have rendering issues

4. **Text Modifier Restrictions** - Must be inside `<text>` component
   - Can't use `<span>`, `<strong>`, etc. outside `<text>`
   - Will error or not render correctly

5. **Vue Package Unmaintained** - Only React and Solid actively supported

### Gotchas for Development

1. **Async Renderer Creation** - `createCliRenderer()` is async
   - Must await before creating root
   - Handle errors during renderer initialization

2. **Terminal Size Changes** - Must handle gracefully
   - Very small terminals may not fit layout
   - Very large terminals may look sparse
   - Test with various terminal sizes

3. **Keyboard Event Bubbling** - Global keyboard handler
   - All components receive keyboard events via `useKeyboard()`
   - Need to manage focus state manually
   - May need event handler coordination

4. **No Built-in Focus Management** - Must implement yourself
   - Track which component should receive input
   - Coordinate between multiple input components
   - Handle tab navigation if needed

5. **Performance with Large Trees** - Test with realistic data
   - Smithers trees can be large (50+ nodes)
   - May need virtualization for very large trees
   - Consider lazy rendering or pagination

## Testing Strategy

### Unit Testing

- Test components in isolation
- Mock `useKeyboard()` and other hooks
- Test keyboard navigation logic
- Test layout calculations

### Integration Testing

- Test with real OpenTUI renderer
- Test keyboard interaction flows
- Test terminal resize handling
- Test with various terminal sizes

### Manual Testing

Essential due to terminal-specific behavior:
- Test in various terminal emulators (iTerm, Terminal.app, Alacritty, etc.)
- Test with different terminal sizes
- Test keyboard shortcuts and special keys
- Test color rendering and themes

## References

- [OpenTUI GitHub Repository](https://github.com/sst/opentui)
- [OpenTUI React Package](https://www.npmjs.com/package/@opentui/react)
- [DeepWiki OpenTUI Documentation](https://deepwiki.com/sst/opentui)
- [React Reconciler Documentation](https://github.com/facebook/react/tree/main/packages/react-reconciler)

## Next Steps

1. ✅ Complete this research document
2. Create TUI design documentation (mockups, component hierarchy)
3. Create VHS recording documentation
4. Set up development environment with Zig and OpenTUI
5. Build proof-of-concept TreeView component
6. Iterate on design based on real usage
