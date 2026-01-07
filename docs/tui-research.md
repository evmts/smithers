# OpenTUI Research Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Package Structure](#package-structure)
4. [@opentui/react API](#opentuireact-api)
5. [@opentui/core API](#opentuicore-api)
6. [Component Library](#component-library)
7. [Integration Patterns](#integration-patterns)
8. [Performance](#performance)
9. [Dependencies and Setup](#dependencies-and-setup)
10. [Code Examples](#code-examples)
11. [Best Practices](#best-practices)
12. [References](#references)

---

## Overview

OpenTUI is a TypeScript library for building terminal user interfaces (TUIs) with a multi-framework approach. It brings modern UI development patterns to the terminal through custom reconcilers for React, SolidJS, and Vue.

**Key Features:**
- Declarative component-based architecture using JSX
- Sub-millisecond frame rendering (60+ FPS)
- Native Zig backend for performance-critical operations
- Built-in React DevTools support
- Flexbox layout using Facebook's Yoga engine
- Rich component library (inputs, code editors, diffs, etc.)

**Current Status:** Active development, not yet production-ready (v0.1.69 as of January 2026)

**Project Info:**
- GitHub: https://github.com/sst/opentui
- 7.1k+ stars, 47 contributors
- Language composition: 67.4% TypeScript, 30.2% Zig

---

## Architecture

### Core Design Principles

OpenTUI uses a layered architecture that separates terminal rendering primitives from framework-specific implementations:

```
┌─────────────────────────────────────┐
│  Framework Layer                    │
│  (@opentui/react, @opentui/solid)  │
└─────────────┬───────────────────────┘
              │
┌─────────────┴───────────────────────┐
│  Core Imperative API                │
│  (@opentui/core)                    │
└─────────────┬───────────────────────┘
              │
┌─────────────┴───────────────────────┐
│  Native Zig Layer                   │
│  (FFI via Bun.dlopen)               │
└─────────────────────────────────────┘
```

**Key Architecture Principles:**

1. **Framework Agnosticism**: `@opentui/core` provides a pure imperative API with no framework dependencies
2. **Thin Reconciler Wrappers**: Framework integrations are lightweight adapters that map framework primitives to the core API
3. **FFI Performance Bridge**: TypeScript ergonomics with native Zig performance for rendering, text buffers, and hit detection
4. **Renderable System**: Hierarchical UI components that integrate with the Yoga layout engine

### The Renderable System

The core abstraction in OpenTUI is the **Renderable**, a hierarchical UI component that can be:
- Positioned and styled using Yoga flexbox
- Nested within other Renderables
- Rendered to a FrameBuffer
- Managed through lifecycle events

**BaseRenderable** provides:
- Tree management (parent-child relationships)
- Event emission system
- Lifecycle hooks
- Yoga node integration for layout

**Renderable** extends BaseRenderable with:
- Layout capabilities via `yogaNode`
- Event handling (mouse, focus, keyboard)
- Abstract `renderSelf()` method for custom drawing
- Rendering context integration

### React Reconciler Implementation

The `@opentui/react` package uses React's `react-reconciler` API to bridge React's virtual DOM to OpenTUI's imperative Renderable tree.

**Four Main Subsystems:**

1. **React Reconciler**: Uses `react-reconciler` package configured with OpenTUI's hostConfig
2. **Type System**: TypeScript definitions for JSX components with module augmentation
3. **Component Catalog**: Runtime registry mapping JSX element names to Renderable constructors
4. **Hooks API**: Framework-specific hooks for accessing renderer features

**hostConfig Location:** `packages/react/src/reconciler/host-config.ts`

The reconciler operates in **mutation mode** (similar to react-dom), implementing operations like:
- `createInstance`: Creates Renderable instances
- `appendChild`: Manages tree structure
- `commitUpdate`: Updates Renderable props
- `removeChild`: Handles unmounting

**Entry Point (`createRoot`):**
1. Creates a `ReactReconciler` instance with OpenTUI hostConfig
2. Creates a fiber root via `reconciler.createContainer` associated with the CliRenderer
3. Returns an object with a `render()` method that accepts JSX

---

## Package Structure

OpenTUI is organized as a monorepo with the following packages:

| Package | Status | Purpose |
|---------|--------|---------|
| `@opentui/core` | Active | Core imperative API with all primitives and CliRenderer |
| `@opentui/react` | Active | React reconciler for component-driven development |
| `@opentui/solid` | Active | SolidJS reconciler implementation |
| `@opentui/vue` | Unmaintained | Vue reconciler (no longer maintained) |
| `@opentui/go` | Unmaintained | Go language bindings (no longer maintained) |

Additionally, platform-specific Zig native libraries are packaged as separate optional dependencies:
- `@opentui/core-darwin-x64`
- `@opentui/core-darwin-arm64`
- `@opentui/core-linux-x64`
- `@opentui/core-linux-arm64`
- `@opentui/core-win32-x64`
- `@opentui/core-win32-arm64`

---

## @opentui/react API

### Installation

```bash
bun install @opentui/react @opentui/core react
```

### Core Setup

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

function App() {
  return <text>Hello, world!</text>
}

const renderer = await createCliRenderer({
  // Optional configuration
  exitOnCtrlC: false,
})

createRoot(renderer).render(<App />)
```

### Hooks API

#### `useRenderer()`

Returns the `CliRenderer` instance, providing access to renderer features like console, terminal dimensions, and event emitters.

**Return Value:**
- `renderer.console`: Console overlay API
- `renderer.keyInput`: Keyboard input event emitter
- `renderer.width`: Terminal width
- `renderer.height`: Terminal height

**Example:**
```tsx
import { useRenderer } from "@opentui/react"
import { useEffect } from "react"

function App() {
  const renderer = useRenderer()

  useEffect(() => {
    renderer.console.show()
    console.log("Hello, from the console!")
  }, [renderer])

  return <box />
}
```

---

#### `useKeyboard(handler, options?)`

Registers a global keyboard event handler with support for key press, repeat, and release events.

**Parameters:**
- `handler: (event: KeyEvent) => void` - Callback for keyboard events
- `options?: { release?: boolean }` - Set to `true` to receive release events

**KeyEvent Properties:**
- `name: string` - Key identifier (e.g., "escape", "a", "enter")
- `sequence: string` - Raw input sequence
- `eventType: 'press' | 'release'` - Event type
- `ctrl: boolean` - Ctrl modifier
- `shift: boolean` - Shift modifier
- `meta: boolean` - Alt/Meta modifier
- `option: boolean` - Option modifier (macOS)
- `repeated: boolean` - True for key repeat events

**Example (Basic):**
```tsx
import { useKeyboard } from "@opentui/react"

function App() {
  useKeyboard((key) => {
    if (key.name === "escape") {
      process.exit(0)
    }
  })

  return <text>Press ESC to exit</text>
}
```

**Example (With Release Events):**
```tsx
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

---

#### `useTerminalDimensions()`

Returns the current terminal dimensions and automatically updates when the terminal is resized.

**Return Value:**
```typescript
{
  width: number,
  height: number
}
```

**Example:**
```tsx
import { useTerminalDimensions } from "@opentui/react"

function App() {
  const { width, height } = useTerminalDimensions()

  return (
    <box>
      <text>Terminal dimensions: {width}x{height}</text>
      <box style={{
        width: Math.floor(width / 2),
        height: Math.floor(height / 3)
      }}>
        <text>Half-width, third-height box</text>
      </box>
    </box>
  )
}
```

---

#### `useOnResize(callback)`

Triggers a callback when terminal dimensions change.

**Parameters:**
- `callback: (width: number, height: number) => void` - Called on resize

**Example:**
```tsx
import { useOnResize, useRenderer } from "@opentui/react"
import { useEffect } from "react"

function App() {
  const renderer = useRenderer()

  useEffect(() => {
    renderer.console.show()
  }, [renderer])

  useOnResize((width, height) => {
    console.log(`Terminal resized to ${width}x${height}`)
  })

  return <text>Resize-aware component</text>
}
```

---

#### `useTimeline(options?)`

Manages animations using OpenTUI's timeline system. Automatically registers and unregisters the timeline with the animation engine.

**Parameters:**
```typescript
{
  duration?: number,      // Animation duration in ms
  loop?: boolean,         // Whether to loop the animation
  autoplay?: boolean,     // Start automatically
  // Lifecycle callbacks
  onStart?: () => void,
  onUpdate?: () => void,
  onComplete?: () => void,
}
```

**Return Value:**
- `timeline` object with `add()`, `play()`, `pause()`, `stop()` methods

**Example (System Monitor Animation):**
```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot, useTimeline } from "@opentui/react"
import { useEffect, useState } from "react"

type Stats = {
  cpu: number
  memory: number
  network: number
  disk: number
}

export const App = () => {
  const [stats, setAnimatedStats] = useState<Stats>({
    cpu: 0,
    memory: 0,
    network: 0,
    disk: 0,
  })

  const timeline = useTimeline({
    duration: 3000,
    loop: false,
  })

  useEffect(() => {
    timeline.add(
      stats,
      {
        cpu: 85,
        memory: 70,
        network: 95,
        disk: 60,
        duration: 3000,
        ease: "linear",
        onUpdate: (values) => {
          setAnimatedStats({ ...values.targets[0] })
        },
      },
      0,
    )
  }, [])

  const statsMap = [
    { name: "CPU", key: "cpu", color: "#6a5acd" },
    { name: "Memory", key: "memory", color: "#4682b4" },
    { name: "Network", key: "network", color: "#20b2aa" },
    { name: "Disk", key: "disk", color: "#daa520" },
  ]

  return (
    <box
      title="System Monitor"
      style={{
        margin: 1,
        padding: 1,
        border: true,
        marginLeft: 2,
        marginRight: 2,
        borderStyle: "single"
      }}
    >
      {statsMap.map(stat => (
        <box key={stat.key}>
          <text>{stat.name}: {Math.round(stats[stat.key])}%</text>
        </box>
      ))}
    </box>
  )
}
```

---

### TypeScript Configuration

For optimal TypeScript support, use this `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react"
  }
}
```

---

## @opentui/core API

### CliRenderer

The central orchestrator managing terminal output, input events, and rendering loops.

#### Creating a Renderer

```typescript
import { createCliRenderer } from "@opentui/core"

const renderer = await createCliRenderer({
  // Console configuration
  consoleOptions: {
    position: "bottom",      // "top" | "bottom" | "left" | "right"
    sizePercent: 30,         // Percentage of screen
    colorInfo: "#00FF00",
    colorWarn: "#FFFF00",
    colorError: "#FF0000",
    startInDebugMode: false,
  },

  // Other options
  exitOnCtrlC: true,
})
```

#### Renderer Modes

**Live Mode** (with FPS control):
```typescript
renderer.start()  // Runs rendering loop capped at target FPS
```

**Passive Mode** (render on change):
```typescript
// Don't call renderer.start()
// Re-renders only when renderable tree or layout changes
```

#### Console API

The built-in console captures all `console.log`, `info`, `warn`, `error`, and `debug` calls:

```typescript
renderer.console.show()      // Show console overlay
renderer.console.toggle()    // Toggle console visibility
```

**Features:**
- Visual overlay positioned at any terminal edge
- Arrow key scrolling when focused
- Color-coded output (info/warn/error)
- Backtick key toggles console

#### Input Handling

```typescript
renderer.keyInput.on("keypress", (key) => {
  console.log(key.name)       // "escape", "a", "enter", etc.
  console.log(key.sequence)   // Raw input sequence
  console.log(key.ctrl)       // Ctrl modifier
  console.log(key.shift)      // Shift modifier
  console.log(key.meta)       // Alt/Meta modifier
})

renderer.keyInput.on("paste", (text) => {
  console.log("Pasted:", text)
})
```

---

### FrameBuffer (OptimizedBuffer)

A 2D cell-based rendering surface with alpha blending support.

**Methods:**
- `setCell(x, y, char, fg, bg, attributes)` - Set single cell
- `setCellWithAlphaBlending(x, y, char, fg, bg, attributes)` - Set with alpha blending
- `drawText(text, x, y, color, attributes?)` - Draw text string
- `fillRect(x, y, width, height, char, fg, bg)` - Fill rectangle
- `drawFrameBuffer(buffer, x, y)` - Composite another buffer

**Attributes:**
- `TextAttributes.BOLD`
- `TextAttributes.UNDERLINE`
- `TextAttributes.ITALIC`
- `TextAttributes.DIM`

---

### Color System (RGBA)

```typescript
import { RGBA } from "@opentui/core"

// RGB integers (0-255)
const red = RGBA.fromInts(255, 0, 0, 255)

// Normalized floats (0.0-1.0)
const blue = RGBA.fromValues(0.0, 0.0, 1.0, 1.0)

// Hex strings
const green = RGBA.fromHex("#00FF00")
```

---

### Layout Engine (Yoga)

OpenTUI uses Facebook's Yoga layout engine for flexbox-style layouts:

**Supported Properties:**
- `flexDirection`: "row" | "column" | "row-reverse" | "column-reverse"
- `justifyContent`: "flex-start" | "center" | "flex-end" | "space-between" | "space-around"
- `alignItems`: "flex-start" | "center" | "flex-end" | "stretch"
- `flexGrow`: number
- `width`: number | string (e.g., "50%")
- `height`: number | string
- `padding`: number | object
- `margin`: number | object
- `gap`: number

---

## Component Library

### Layout Components

#### `<text>`

Styled text display with colors and attributes.

**Props:**
```typescript
{
  children: string | TextSegment[],
  color?: string,          // Hex color
  backgroundColor?: string,
  bold?: boolean,
  underline?: boolean,
  italic?: boolean,
}
```

**Example:**
```tsx
<text color="#00FF00" bold>Hello, world!</text>
```

**Text Helpers:**
```typescript
import { t, bold, fg, underline } from "@opentui/core"

const styledText = t`${bold("Bold")} ${fg("#FF0000", "Red")} ${underline("Underlined")}`
```

---

#### `<box>`

Container with borders, backgrounds, and layout support.

**Props:**
```typescript
{
  // Border
  border?: boolean,
  borderStyle?: "single" | "double" | "rounded" | "bold" | "heavy",
  borderColor?: string,

  // Title
  title?: string,
  titlePosition?: "left" | "center" | "right",

  // Background
  backgroundColor?: string,

  // Layout (Yoga)
  style?: {
    flexDirection?: "row" | "column",
    justifyContent?: "flex-start" | "center" | "flex-end",
    alignItems?: "flex-start" | "center" | "flex-end",
    padding?: number,
    margin?: number,
    width?: number | string,
    height?: number | string,
    flexGrow?: number,
    gap?: number,
  },

  children?: React.ReactNode,
}
```

**Example:**
```tsx
<box
  border
  borderStyle="rounded"
  title="My Box"
  style={{
    padding: 2,
    margin: 1,
    flexDirection: "column",
    gap: 1
  }}
>
  <text>Content inside box</text>
</box>
```

---

#### `<scrollbox>`

Scrollable container for content that exceeds viewport size.

**Props:**
```typescript
{
  // Nested configuration
  rootOptions?: BoxOptions,
  wrapperOptions?: BoxOptions,
  viewportOptions?: BoxOptions,
  contentOptions?: BoxOptions,

  // Scrollbar customization
  scrollbarOptions?: {
    thumbColor?: string,
    trackColor?: string,
    width?: number,
  },

  children?: React.ReactNode,
}
```

**Example:**
```tsx
<scrollbox
  rootOptions={{ border: true }}
  scrollbarOptions={{ thumbColor: "#00FF00" }}
>
  {/* Long content here */}
</scrollbox>
```

---

#### `<ascii-font>`

ASCII art text display.

**Props:**
```typescript
{
  text: string,
  font?: string,  // Font style name
  color?: string,
}
```

---

### Interactive Input Components

#### `<input>`

Single-line text input field.

**Props:**
```typescript
{
  placeholder?: string,
  value?: string,
  onChange?: (value: string) => void,
  onSubmit?: (value: string) => void,  // Triggered on Enter
  focused?: boolean,
}
```

**Events:**
- `CHANGE` - Emitted on Enter/Return

**Example:**
```tsx
function LoginForm() {
  const [username, setUsername] = useState("")

  return (
    <input
      placeholder="Username"
      value={username}
      onChange={setUsername}
      onSubmit={(value) => console.log("Submitted:", value)}
    />
  )
}
```

---

#### `<textarea>`

Multi-line text editor with full editing capabilities.

**Features:**
- Undo/redo support
- Word navigation (Ctrl+Left/Right)
- Text selection
- Syntax highlighting support

**Props:**
```typescript
{
  value?: string,
  onChange?: (value: string) => void,
  placeholder?: string,
  language?: string,  // For syntax highlighting
}
```

---

#### `<select>`

Vertical scrollable list for item selection.

**Props:**
```typescript
{
  items: Array<{ label: string, value: any, description?: string }>,
  value?: any,
  onChange?: (value: any) => void,
}
```

**Keyboard Navigation:**
- Up/Down or K/J: Navigate items
- Enter: Select item

**Events:**
- `ITEM_SELECTED` - Emitted when item is selected

**Example:**
```tsx
<select
  items={[
    { label: "Option 1", value: 1 },
    { label: "Option 2", value: 2, description: "More info" },
  ]}
  onChange={(value) => console.log("Selected:", value)}
/>
```

---

#### `<tab-select>`

Horizontal tab navigation.

**Props:**
```typescript
{
  tabs: Array<{ label: string, value: any }>,
  value?: any,
  onChange?: (value: any) => void,
}
```

**Keyboard Navigation:**
- Left/Right or [ / ]: Navigate tabs
- Enter: Select tab

---

### Code Display Components

#### `<code>`

Syntax-highlighted code display using TreeSitter.

**Props:**
```typescript
{
  language: string,      // "typescript", "javascript", "python", etc.
  children: string,      // Source code
  theme?: string,        // Syntax highlighting theme
}
```

**Example:**
```tsx
<code language="typescript" theme="nord">
{`function hello() {
  console.log("Hello, world!")
}`}
</code>
```

---

#### `<line-number>`

Code with line numbers.

**Props:**
```typescript
{
  start?: number,        // Starting line number
  children: string,
}
```

---

#### `<diff>`

Display unified or split-view diffs with syntax highlighting.

**Props:**
```typescript
{
  oldContent: string,
  newContent: string,
  language?: string,
  mode?: "unified" | "split",
  theme?: string,
  showLineNumbers?: boolean,
  wordWrap?: boolean,
}
```

**Example:**
```tsx
<diff
  oldContent={oldCode}
  newContent={newCode}
  language="typescript"
  mode="split"
  showLineNumbers
/>
```

---

### Text Modifiers

These components nest within `<text>` for rich formatting:

- `<strong>` - Bold text
- `<em>` - Emphasized text (italic)
- `<u>` - Underlined text

**Example:**
```tsx
<text>
  This is <strong>bold</strong> and <em>italic</em> text
</text>
```

---

### Styling Approaches

OpenTUI supports two styling approaches:

**1. Direct Props:**
```tsx
<box backgroundColor="blue" padding={2} margin={1} />
```

**2. Style Prop:**
```tsx
<box style={{ backgroundColor: "blue", padding: 2, margin: 1 }} />
```

Both approaches support identical property names. The type system excludes event handlers and non-styleable properties from the `style` prop.

---

## Integration Patterns

### Integrating with Smithers' Custom Reconciler

OpenTUI's React reconciler can serve as a reference for integrating TUI rendering into Smithers' existing `SmithersNode` reconciler.

#### Architecture Similarities

Both projects use custom React reconcilers to render to non-DOM targets:

| Aspect | Smithers | OpenTUI |
|--------|----------|---------|
| Target | XML plans + execution | Terminal UI |
| Reconciler | `react-reconciler` | `react-reconciler` |
| Mode | Mutation-based | Mutation-based |
| Host Config | `src/reconciler/host-config.ts` | `packages/react/src/reconciler/host-config.ts` |
| Node Type | `SmithersNode` | `Renderable` |

#### Key Integration Points

**1. Extend hostConfig with TUI operations:**

```typescript
// In Smithers' host-config.ts
import { createTuiRenderer } from "./tui-renderer"

const tuiRenderer = createTuiRenderer()

const hostConfig = {
  // ... existing Smithers hostConfig ...

  // Add TUI-specific operations
  createTuiRoot(rootNode: SmithersNode) {
    return tuiRenderer.createRoot(rootNode)
  },

  renderNodeToTui(node: SmithersNode) {
    return tuiRenderer.render(node)
  },
}
```

**2. Create a TUI Renderer for SmithersNode:**

```typescript
// src/tui-renderer.ts
import { createCliRenderer } from "@opentui/core"
import { BoxRenderable, TextRenderable } from "@opentui/core"
import type { SmithersNode } from "./types"

export async function createTuiRenderer() {
  const renderer = await createCliRenderer()

  function convertSmithersNodeToRenderable(node: SmithersNode): Renderable {
    switch (node.type) {
      case "phase":
        return new BoxRenderable(renderer.ctx, {
          border: true,
          title: node.props.name,
        })

      case "step":
        return new TextRenderable(renderer.ctx, {
          text: node.children.map(c => c.props.children).join("\n"),
        })

      case "claude":
        // Render Claude execution node as interactive box
        return new BoxRenderable(renderer.ctx, {
          border: true,
          borderColor: "#00FF00",
          // ... map other props
        })

      // ... other node types
    }
  }

  return {
    createRoot(rootNode: SmithersNode) {
      const rootRenderable = convertSmithersNodeToRenderable(rootNode)
      renderer.setRoot(rootRenderable)
      return rootRenderable
    },

    render(node: SmithersNode) {
      const renderable = convertSmithersNodeToRenderable(node)
      // Update the renderable tree
    },
  }
}
```

**3. Add TUI visualization mode to Smithers:**

```typescript
// In src/core/execute.ts or render.ts
import { createTuiRenderer } from "./tui-renderer"

export async function executePlan(plan: SmithersNode, options?: {
  visualize?: "xml" | "tui"  // Add TUI visualization option
}) {
  if (options?.visualize === "tui") {
    const tuiRenderer = await createTuiRenderer()
    tuiRenderer.render(plan)
    // ... continue with execution
  }
  // ... existing execution logic
}
```

---

### Hybrid Approach: When to Use Core vs Reconciler

OpenTUI recommends choosing the integration level based on requirements:

#### Use `@opentui/core` (Imperative API) when:
- **Low-latency, high-frequency updates** are required (real-time logs, interactive shells)
- **Precise control** over cursor and partial redraws is necessary
- The environment is **resource-constrained** and requires maximal performance
- Building custom tooling or CLIs with minimal overhead

#### Use `@opentui/react` (Reconciler) when:
- **Faster development** and maintainability via component patterns
- Leveraging **existing React expertise** for rapid iteration
- Building **complex UIs** with state management and composition
- Developer experience is prioritized over absolute performance

#### Hybrid Approach (Recommended for Smithers):
- Use React reconciler for overall UI structure (phases, steps, agent tree)
- Switch to `@opentui/core` imperative API for performance hotspots (live streaming output, rapid updates)
- **Benchmark first**: Measure reconciler-induced latency/memory on critical paths before optimizing

**Example Hybrid Pattern:**
```tsx
function AgentOutput({ streamingText }: { streamingText: string }) {
  const renderer = useRenderer()
  const bufferRef = useRef<Renderable>()

  useEffect(() => {
    if (!bufferRef.current) {
      // Create imperative renderable for high-frequency updates
      bufferRef.current = new TextRenderable(renderer.ctx, {
        text: streamingText,
      })
    } else {
      // Update imperatively, bypassing React reconciler
      bufferRef.current.text = streamingText
    }
  }, [streamingText])

  return <box>{/* Other React components */}</box>
}
```

---

### Custom Components Pattern

To extend OpenTUI with custom components:

**1. Create Renderable Class:**

```typescript
import { BoxRenderable, OptimizedBuffer, RGBA, type BoxOptions, type RenderContext } from "@opentui/core"

class ButtonRenderable extends BoxRenderable {
  private _label: string = "Button"
  private _hovered: boolean = false

  constructor(ctx: RenderContext, options: BoxOptions & { label?: string }) {
    super(ctx, {
      border: true,
      borderStyle: "single",
      minHeight: 3,
      ...options,
    })

    if (options.label) {
      this._label = options.label
    }

    // Register mouse event handlers
    this.on("mouseenter", () => {
      this._hovered = true
      this.requestRender()
    })

    this.on("mouseleave", () => {
      this._hovered = false
      this.requestRender()
    })
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    super.renderSelf(buffer)

    // Center the label
    const centerX = this.x + Math.floor(this.width / 2 - this._label.length / 2)
    const centerY = this.y + Math.floor(this.height / 2)

    // Draw with different color when hovered
    const color = this._hovered
      ? RGBA.fromHex("#00FF00")
      : RGBA.fromHex("#FFFFFF")

    buffer.drawText(this._label, centerX, centerY, color)
  }

  set label(value: string) {
    this._label = value
    this.requestRender()
  }
}
```

**2. Register with TypeScript:**

```typescript
import { extend } from "@opentui/react"

// Register component
extend({
  button: ButtonRenderable,
})

// TypeScript module augmentation
declare module "@opentui/react" {
  interface OpenTUIComponents {
    button: typeof ButtonRenderable
  }
}
```

**3. Use in JSX:**

```tsx
function App() {
  return (
    <box>
      <button label="Click Me" onClick={() => console.log("Clicked!")} />
    </box>
  )
}
```

---

## Performance

### Sub-Millisecond Rendering

OpenTUI achieves sub-millisecond frame times through several optimizations:

**1. Zig Native Backend:**
- Performance-critical operations (rendering, text buffers, hit detection) execute at native speeds
- FFI boundary via `Bun.dlopen()` minimizes overhead
- TypeScript ergonomics with native performance where it matters

**2. Frame Diffing:**
- Zig compares only changed cells between frames
- Minimal re-rendering of unchanged content
- Efficient dirty-region tracking

**3. ANSI Optimization:**
- Run-length encoding combines adjacent cells with identical styling
- Reduces terminal escape sequence overhead
- Optimized for modern terminal emulators

**4. Render-On-Change:**
- Passive mode: Re-renders only when renderable tree or layout changes
- Live mode: Optional FPS-capped rendering loop
- Smart invalidation of dirty regions

**Performance Characteristics:**
- **Sub-millisecond frame times** for typical UIs
- **60+ FPS** rendering for complex, animated interfaces
- Efficient even with large component trees

### Performance Best Practices

**1. Minimize Reconciler Overhead:**
```tsx
// Bad: Frequent re-renders through React state
function BadExample() {
  const [ticks, setTicks] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTicks(t => t + 1), 16)
    return () => clearInterval(interval)
  }, [])

  return <text>Ticks: {ticks}</text>  // Re-renders entire tree every 16ms
}

// Good: Use imperative API for high-frequency updates
function GoodExample() {
  const renderer = useRenderer()
  const textRef = useRef<TextRenderable>()

  useEffect(() => {
    const interval = setInterval(() => {
      if (textRef.current) {
        textRef.current.text = `Ticks: ${Date.now()}`
      }
    }, 16)
    return () => clearInterval(interval)
  }, [])

  // React manages static structure, imperative updates for dynamic content
  return <text ref={textRef}>Ticks: 0</text>
}
```

**2. Use Passive Mode When Possible:**
```typescript
const renderer = await createCliRenderer()
// Don't call renderer.start() unless you need constant re-rendering
```

**3. Batch Layout Changes:**
```typescript
// Bad: Multiple layout invalidations
box.width = 100
box.height = 50
box.padding = 2

// Good: Batch changes
box.updateLayout({
  width: 100,
  height: 50,
  padding: 2,
})
```

---

## Dependencies and Setup

### Prerequisites

**Required:**
- **Bun**: JavaScript runtime and package manager
- **Zig**: Required to build native modules (Zig 0.14+ for Go bindings)

**Installation:**
```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install Zig (required for building packages)
# macOS
brew install zig

# Linux
# See: https://ziglang.org/download/

# Windows
# See: https://ziglang.org/download/
```

---

### Package Installation

#### For React Projects:

```bash
bun install @opentui/react @opentui/core react
```

#### For Core (Imperative) Projects:

```bash
bun install @opentui/core
```

---

### Version Information

As of January 2026:
- Latest release: **v0.1.69**
- Status: **Active development, not production-ready**
- React peer dependency: React 18+
- Zig version: 0.14+ (for building)

---

### Build Requirements

**Dual Build System:**

1. **TypeScript**: No transpilation needed (Bun executes `.ts` files directly)
2. **Zig**: Compiles native performance libraries

**Development Builds:**
```bash
# Build native Zig modules
bun run build:native:dev

# Production build
bun run build:native
```

**Platform Support:**
- darwin-x64 (macOS Intel)
- darwin-arm64 (macOS Apple Silicon)
- linux-x64
- linux-arm64
- win32-x64
- win32-arm64

Native libraries are packaged as separate npm packages and loaded at runtime via `Bun.dlopen()`.

---

### Quick Start with `create-tui`

The fastest way to get started:

```bash
bun create tui
```

This scaffolds a new OpenTUI project with:
- Proper TypeScript configuration
- Example components
- Development scripts

---

### Development Environment

#### React DevTools Integration

OpenTUI supports React DevTools for debugging:

**1. Install DevTools:**
```bash
bun add --dev react-devtools-core@7
```

**2. Start DevTools Server:**
```bash
npx react-devtools@7
```

**3. Run App with DEV Mode:**
```bash
DEV=true bun run your-app.tsx
```

**Features:**
- Real-time component tree inspection
- Props editing (changes reflected immediately in terminal)
- State inspection
- Performance profiling

**Note:** WebSocket connection may prevent process from exiting naturally. Use Ctrl+C to force exit.

---

#### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DEV` | Enable React DevTools | `DEV=true bun run app.tsx` |
| Custom console config | See `consoleOptions` in renderer setup | |

---

#### Debugging Console

OpenTUI includes a built-in console overlay:

**Toggle:** Press backtick (`` ` ``) or call `renderer.console.toggle()`

**Features:**
- Captures all `console.log`, `info`, `warn`, `error`, `debug`
- Color-coded output by level
- Scrollable with arrow keys
- Configurable position and size
- Persists across renders

---

## Code Examples

### 1. Simple "Hello World"

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

function App() {
  return <text>Hello, world!</text>
}

const renderer = await createCliRenderer()
createRoot(renderer).render(<App />)
```

---

### 2. Keyboard Navigation

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard } from "@opentui/react"
import { useState } from "react"

function App() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const items = ["Option 1", "Option 2", "Option 3"]

  useKeyboard((key) => {
    if (key.name === "up" || key.name === "k") {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIndex(i => Math.min(items.length - 1, i + 1))
    } else if (key.name === "escape") {
      process.exit(0)
    }
  })

  return (
    <box border title="Select an option" style={{ padding: 1 }}>
      {items.map((item, i) => (
        <text key={i} color={i === selectedIndex ? "#00FF00" : "#FFFFFF"}>
          {i === selectedIndex ? ">" : " "} {item}
        </text>
      ))}
      <text style={{ marginTop: 1 }} color="#888888">
        Use ↑/↓ or k/j to navigate, ESC to exit
      </text>
    </box>
  )
}

const renderer = await createCliRenderer()
createRoot(renderer).render(<App />)
```

---

### 3. Split Pane Layout

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot, useTerminalDimensions } from "@opentui/react"

function App() {
  const { width, height } = useTerminalDimensions()

  return (
    <box style={{ flexDirection: "row", width, height }}>
      {/* Left pane */}
      <box
        border
        borderStyle="rounded"
        title="Left Panel"
        style={{
          width: "50%",
          padding: 1,
          marginRight: 1,
        }}
      >
        <text>Content in left pane</text>
      </box>

      {/* Right pane */}
      <box
        border
        borderStyle="rounded"
        title="Right Panel"
        style={{
          width: "50%",
          padding: 1,
        }}
      >
        <text>Content in right pane</text>
      </box>
    </box>
  )
}

const renderer = await createCliRenderer()
createRoot(renderer).render(<App />)
```

---

### 4. State Management with Forms

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard } from "@opentui/react"
import { useState } from "react"

type FormField = "username" | "password"

function LoginForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [focusedField, setFocusedField] = useState<FormField>("username")
  const [status, setStatus] = useState("")

  useKeyboard((key) => {
    if (key.name === "tab") {
      // Toggle focus between fields
      setFocusedField(f => f === "username" ? "password" : "username")
    } else if (key.name === "escape") {
      process.exit(0)
    }
  })

  const handleSubmit = () => {
    if (!username || !password) {
      setStatus("Please fill in all fields")
      return
    }
    setStatus(`Logging in as ${username}...`)
    // Simulate login
    setTimeout(() => {
      setStatus("Login successful!")
    }, 1000)
  }

  return (
    <box
      border
      borderStyle="double"
      title="Login"
      style={{
        padding: 2,
        margin: 2,
        width: 50,
      }}
    >
      <box style={{ marginBottom: 1 }}>
        <text>Username:</text>
        <input
          value={username}
          onChange={setUsername}
          focused={focusedField === "username"}
          placeholder="Enter username"
        />
      </box>

      <box style={{ marginBottom: 1 }}>
        <text>Password:</text>
        <input
          value={password}
          onChange={setPassword}
          focused={focusedField === "password"}
          placeholder="Enter password"
        />
      </box>

      <box style={{ marginTop: 1 }}>
        <text
          color="#00FF00"
          onClick={handleSubmit}
          style={{ cursor: "pointer" }}
        >
          [Submit]
        </text>
      </box>

      {status && (
        <box style={{ marginTop: 1 }}>
          <text color="#FFFF00">{status}</text>
        </box>
      )}

      <box style={{ marginTop: 2 }}>
        <text color="#888888">Tab: Switch fields | Enter: Submit | ESC: Exit</text>
      </box>
    </box>
  )
}

const renderer = await createCliRenderer()
createRoot(renderer).render(<LoginForm />)
```

---

### 5. Live Streaming Output (Hybrid Approach)

```tsx
import { createCliRenderer, TextRenderable } from "@opentui/core"
import { createRoot, useRenderer } from "@opentui/react"
import { useEffect, useRef } from "react"

function StreamingLog() {
  const renderer = useRenderer()
  const textRenderableRef = useRef<TextRenderable>()
  const linesRef = useRef<string[]>([])

  useEffect(() => {
    // Create imperative renderable for high-frequency updates
    if (!textRenderableRef.current) {
      textRenderableRef.current = new TextRenderable(renderer.ctx, {
        text: "",
      })
    }

    // Simulate streaming logs - interval created once, uses ref for state
    const interval = setInterval(() => {
      const newLine = `[${new Date().toISOString()}] Log entry ${linesRef.current.length + 1}`
      linesRef.current = [...linesRef.current, newLine].slice(-20)  // Keep last 20 lines

      // Update imperatively (bypasses React reconciler for performance)
      if (textRenderableRef.current) {
        textRenderableRef.current.text = linesRef.current.join("\n")
      }
    }, 100)  // 10 updates per second

    return () => clearInterval(interval)
  }, [renderer])  // Include renderer to avoid stale references

  return (
    <box
      border
      title="Live Logs (10 updates/sec)"
      style={{
        padding: 1,
        height: 25,
      }}
    >
      <scrollbox>
        <text ref={textRenderableRef} />
      </scrollbox>
    </box>
  )
}

const renderer = await createCliRenderer()
createRoot(renderer).render(<StreamingLog />)
```

---

### 6. Animated Progress Bar

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot, useTimeline } from "@opentui/react"
import { useState, useEffect } from "react"

function ProgressBar() {
  const [progress, setProgress] = useState(0)

  const timeline = useTimeline({
    duration: 5000,
    loop: false,
    onComplete: () => {
      console.log("Download complete!")
    },
  })

  useEffect(() => {
    timeline.add(
      { value: 0 },
      {
        value: 100,
        duration: 5000,
        ease: "linear",
        onUpdate: (values) => {
          setProgress(Math.round(values.targets[0].value))
        },
      },
      0
    )
  }, [])

  const barWidth = 40
  const filledWidth = Math.floor((progress / 100) * barWidth)
  const bar = "█".repeat(filledWidth) + "░".repeat(barWidth - filledWidth)

  return (
    <box
      border
      title="Downloading..."
      style={{
        padding: 2,
        width: 50,
      }}
    >
      <text color="#00FF00">{bar}</text>
      <text style={{ marginTop: 1 }}>{progress}% complete</text>
    </box>
  )
}

const renderer = await createCliRenderer()
createRoot(renderer).render(<ProgressBar />)
```

---

## Best Practices

### 1. Choose the Right Integration Level

**Use @opentui/core (Imperative) for:**
- Real-time streaming output (logs, agent responses)
- High-frequency updates (animations, live data)
- Performance-critical hotspots
- Custom low-level rendering

**Use @opentui/react (Reconciler) for:**
- Complex UI structure and composition
- State management with React patterns
- Developer velocity and maintainability
- Leveraging existing React knowledge

**Hybrid Approach (Recommended):**
- React for overall UI structure
- Imperative API for performance-critical sections
- Benchmark first, optimize where needed

---

### 2. Performance Optimization

**Minimize Re-renders:**
```tsx
// Use React.memo for static components
const StaticHeader = React.memo(({ title }: { title: string }) => (
  <box border title={title}>
    <text>Static content</text>
  </box>
))

// Use useCallback for event handlers
const handleKeyPress = useCallback((key: KeyEvent) => {
  // Handle key
}, [])

useKeyboard(handleKeyPress)
```

**Batch State Updates:**
```tsx
// Bad: Multiple state updates cause multiple re-renders
setUsername(newUsername)
setPassword(newPassword)
setFocused("username")

// Good: Batch updates with useReducer or single state object
dispatch({ username: newUsername, password: newPassword, focused: "username" })
```

---

### 3. Layout Best Practices

**Use Flexbox for Responsive Layouts:**
```tsx
<box style={{ flexDirection: "row", width: "100%", gap: 2 }}>
  <box style={{ flexGrow: 1 }}>Flexible width</box>
  <box style={{ width: 30 }}>Fixed width</box>
</box>
```

**Leverage Yoga Properties:**
- `flexDirection`: Control flow direction
- `justifyContent`: Distribute space along main axis
- `alignItems`: Align items on cross axis
- `flexGrow`: Proportional sizing
- `gap`: Spacing between children

---

### 4. Input Handling

**Use Consistent Key Bindings:**
- Arrow keys or vim keys (h/j/k/l) for navigation
- Tab for focus switching
- Enter for selection/submission
- Escape for exit/cancel
- Ctrl+C for force quit

**Provide Visual Feedback:**
```tsx
<text color={focused ? "#00FF00" : "#FFFFFF"}>
  {focused ? "▶" : " "} Option
</text>
```

---

### 5. Error Handling

**Graceful Degradation:**
```tsx
try {
  const renderer = await createCliRenderer()
  createRoot(renderer).render(<App />)
} catch (error) {
  console.error("Failed to initialize TUI:", error)
  console.log("Falling back to plain text output...")
  // Provide fallback
}
```

**User Feedback:**
```tsx
const [error, setError] = useState<string | null>(null)

if (error) {
  return (
    <box border borderColor="#FF0000" title="Error">
      <text color="#FF0000">{error}</text>
    </box>
  )
}
```

---

### 6. TypeScript Integration

**Enable JSX:**
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react"
  }
}
```

**Type Custom Components:**
```typescript
declare module "@opentui/react" {
  interface OpenTUIComponents {
    myComponent: typeof MyComponentRenderable
  }
}
```

---

### 7. Accessibility Considerations

**Keyboard Navigation:**
- Always provide keyboard alternatives to mouse interactions
- Support standard terminal key bindings
- Provide help text showing available keys

**Visual Indicators:**
- Clear focus states
- Sufficient color contrast
- Use symbols for states (▶ for selected, ✓ for checked)

**Screen Reader Compatibility:**
- Use semantic component names
- Provide text alternatives for visual elements

---

## References

### Documentation

- [OpenTUI GitHub Repository](https://github.com/sst/opentui)
- [OpenTUI Getting Started (Core Docs)](https://github.com/sst/opentui/blob/main/packages/core/docs/getting-started.md)
- [OpenTUI Development Guide](https://github.com/sst/opentui/blob/main/packages/core/docs/development.md)
- [@opentui/react on npm](https://www.npmjs.com/package/@opentui/react)
- [@opentui/core on npm](https://www.npmjs.com/package/@opentui/core)

### Related Projects

- [opencode](https://opencode.ai/docs/tui/) - AI code editor built with OpenTUI
- [terminaldotshop](https://terminal.shop) - Terminal-based applications
- [create-tui](https://github.com/msmps/create-tui) - Quick start scaffolding tool
- [opentui-examples](https://github.com/msmps/opentui-examples) - Community examples

### Technical References

- [React Reconciler Documentation](https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md)
- [Yoga Layout Engine](https://yogalayout.dev/)
- [DeepWiki OpenTUI Documentation](https://deepwiki.com/sst/opentui)
- [Refft: OpenTUI Overview](https://refft.com/en/sst_opentui.html)
- [TypeVar: OpenTUI Tutorial](https://typevar.dev/articles/sst/opentui)

### Community

- [awesome-opentui](https://github.com/sst/opentui) - Curated list of OpenTUI projects
- GitHub Discussions: https://github.com/sst/opentui/discussions

---

## Appendix: Key Takeaways for Smithers Integration

### Architecture Lessons

1. **Separation of Concerns**: OpenTUI's clear separation between core primitives (`@opentui/core`) and framework adapters (`@opentui/react`) enables flexibility and reusability.

2. **Mutation-Based Reconciler**: Both Smithers and OpenTUI use mutation-based reconcilers, making them architecturally compatible for integration.

3. **Hybrid Rendering**: OpenTUI demonstrates the value of combining declarative (React) and imperative (core API) approaches for optimal performance.

### Integration Strategy for Smithers

**Goal**: Add TUI visualization to Smithers' execution workflow without compromising existing functionality.

**Approach**:
1. **Non-invasive**: TUI rendering as opt-in visualization mode
2. **Parallel**: TUI renders SmithersNode tree alongside XML serialization
3. **Live Updates**: Real-time visualization of Ralph Wiggum loop execution
4. **Performance**: Use imperative API for streaming agent output, React for UI structure

**Implementation Path**:
1. Create `src/tui/renderer.ts` - Converts SmithersNode to OpenTUI Renderables
2. Add TUI mode to `executePlan()` - Optional visualization flag
3. Map Smithers components to TUI components:
   - `<Phase>` → BoxRenderable with title
   - `<Step>` → TextRenderable
   - `<Claude>` → Interactive box with streaming output
   - `<Human>` → Interactive approval prompt
4. Live execution updates via imperative TextRenderable updates

**Benefits for Smithers**:
- Visual debugging of agent execution
- Real-time progress tracking
- Interactive approval workflows
- Terminal-native user experience
- Performance metrics visualization

---

*Last Updated: January 2026*
*Based on OpenTUI v0.1.69*
