# OpenTUI Internals: A Deep Dive for Contributors

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Zig + TypeScript: The Dual Language Architecture](#zig--typescript-the-dual-language-architecture)
3. [The Rendering Pipeline](#the-rendering-pipeline)
4. [Layout Engine: Yoga Integration](#layout-engine-yoga-integration)
5. [Building TUIs Without React/Solid](#building-tuis-without-reactsolid)
6. [Buffer System & Grapheme Handling](#buffer-system--grapheme-handling)
7. [FFI Boundary & Performance](#ffi-boundary--performance)
8. [Debugging Guide](#debugging-guide)
9. [Common Pitfalls](#common-pitfalls)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     TypeScript Layer                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Renderables │  │ CliRenderer  │  │  Yoga Layout     │   │
│  │  (Tree)     │──│  (Orchestr.) │──│  (Flexbox)       │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
│         │                 │                                  │
│         └─────────────────┴──────────┐                      │
│                                       ↓                      │
│                           ┌────────────────────┐            │
│                           │  Bun FFI Bridge    │            │
│                           └────────────────────┘            │
└───────────────────────────────────┬─────────────────────────┘
                                    │ dlopen + shared library
┌───────────────────────────────────┴─────────────────────────┐
│                        Zig Layer                             │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────┐ │
│  │ OptimizedBuf │  │  CliRenderer   │  │   Terminal      │ │
│  │ (Frame buf.) │──│  (Diff/ANSI)   │──│   (Caps/Seq)    │ │
│  └──────────────┘  └────────────────┘  └─────────────────┘ │
│         │                                       │            │
│         └───────────────────────────────────────┴──→ STDOUT │
└─────────────────────────────────────────────────────────────┘
```

**Key Insight**: OpenTUI splits responsibilities clearly:
- **TypeScript**: High-level API, component tree, layout computation, event handling
- **Zig**: Low-level buffer manipulation, ANSI encoding, terminal output, performance-critical paths

---

## Zig + TypeScript: The Dual Language Architecture

### What is Zig?

Zig is a **systems programming language** designed as a modern alternative to C. In OpenTUI's context:

- **Manual memory management** (allocators are explicit)
- **No hidden control flow** (no exceptions, no async unless explicit)
- **Comptime** metaprogramming (compile-time code execution)
- **C ABI compatibility** (exports C-compatible functions for FFI)
- **Cross-compilation** (single codebase compiles to macOS/Linux/Windows)

```zig
// Example from renderer.zig
export fn createRenderer(width: u32, height: u32, testing: bool) ?*CliRenderer {
    const pool = gp.initGlobalPool(globalArena);
    return CliRenderer.create(globalAllocator, width, height, pool, testing) catch null;
}
```

**Why Zig?**
1. **Performance**: Terminal rendering requires tight loops iterating over every cell. Zig's zero-cost abstractions and SIMD capabilities make this 10-100x faster than pure JS/TS.
2. **Memory control**: Buffer allocations are predictable and cache-friendly. No GC pauses.
3. **Cross-platform**: Single Zig codebase compiles to native binaries for all platforms via `optionalDependencies`:
   ```json
   "@opentui/core-darwin-arm64": "0.1.74",
   "@opentui/core-linux-x64": "0.1.74",
   ...
   ```

### What is TypeScript's Role?

TypeScript provides:
- **Developer ergonomics**: Classes, type safety, async/await
- **Component tree management**: The Renderable hierarchy
- **Yoga layout integration**: Flexbox computations happen in JS (via `yoga-layout` npm package)
- **Event handling**: Keyboard/mouse input parsing and dispatch

```typescript
// TypeScript orchestrates, Zig executes
class CliRenderer {
  render() {
    const buffer = this.lib.getNextBuffer(this.rendererPtr);  // FFI call
    this.renderTree(this.root, buffer);                       // TS tree walk
    this.lib.render(this.rendererPtr, false);                 // FFI call → ANSI output
  }
}
```

### The FFI Bridge (Bun FFI)

OpenTUI uses **Bun's FFI** (`bun:ffi`) to load the Zig-compiled shared library:

```typescript
// src/zig.ts
import { dlopen } from "bun:ffi";

const lib = dlopen(targetLibPath, {
  createRenderer: { args: ["u32", "u32", "bool"], returns: "ptr" },
  render: { args: ["ptr", "bool"], returns: "void" },
  bufferGetCharPtr: { args: ["ptr"], returns: "ptr" },
  // ... 200+ exported functions
});
```

**Data flows across FFI boundary**:
1. **Small data** (scalars, flags): Passed directly as function arguments
2. **Large data** (buffers): Shared via pointers. TS creates `TypedArray` views over Zig memory:
   ```typescript
   const charPtr = lib.bufferGetCharPtr(bufferPtr);
   const chars = new Uint32Array(toArrayBuffer(charPtr, 0, size * 4));
   chars[0] = 0x41; // Write 'A' to buffer (Zig will see this change)
   ```

---

## The Rendering Pipeline

### Frame Lifecycle

```
1. User code modifies Renderables (e.g., text.content = "new")
   ↓
2. Renderable.markDirty() called
   ↓
3. renderer.requestRender() schedules frame
   ↓
4. CliRenderer.render() invoked (RAF loop or manual)
   ├─→ 5. Yoga layout computation (TypeScript)
   │       - Calculate x/y/width/height for all Renderables
   │       - Based on flexbox rules
   ├─→ 6. Tree traversal: renderTree(root, buffer)
   │       - Depth-first walk, respecting zIndex
   │       - Each Renderable draws to OptimizedBuffer
   ├─→ 7. Buffer → ANSI conversion (Zig)
   │       - Diff currentBuffer vs nextBuffer (minimize ANSI codes)
   │       - Generate escape sequences (cursor movement, SGR colors)
   └─→ 8. Write ANSI to stdout (Zig)
           - Single write() call via preallocated buffer
```

### The OptimizedBuffer: Core Data Structure

**Location**: `src/zig/buffer.zig` + `src/buffer.ts`

The buffer is a **2D array of cells**, where each cell stores:
```zig
const Cell = struct {
    char: u32,        // Unicode codepoint (or grapheme cluster ID)
    fg: RGBA,         // Foreground color [r,g,b,a] as f32[4]
    bg: RGBA,         // Background color
    attributes: u32,  // Bitfield: BOLD|ITALIC|UNDERLINE|...
};
```

**Layout in memory**:
```
OptimizedBuffer {
    char:       [u32; width*height]  // SoA (Structure of Arrays) for cache efficiency
    fg:         [RGBA; width*height]
    bg:         [RGBA; width*height]
    attributes: [u32; width*height]
}
```

**Why SoA?**
- When diffing buffers, we often scan only `char` or only `fg` → better cache locality
- SIMD operations can process 4-8 colors at once

### Rendering a Renderable

Example: `BoxRenderable` draws a border

```typescript
// src/renderables/Box.ts
class BoxRenderable extends Renderable {
  render(buffer: OptimizedBuffer, ctx: RenderContext) {
    if (!this.visible) return;

    // Draw background
    buffer.fillRect(this.x, this.y, this.width, this.height, this.backgroundColor);

    // Draw border (calls Zig for performance)
    if (this.border) {
      buffer.drawBox(
        this.x, this.y, this.width, this.height,
        this.borderStyle,  // "single" | "double" | "rounded"
        this.borderColor
      );
    }

    // Children render on top
    for (const child of this.children) {
      child.render(buffer, ctx);
    }
  }
}
```

`buffer.drawBox()` calls Zig:
```zig
// src/zig/buffer.zig
export fn bufferDrawBox(bufPtr: *OptimizedBuffer, x: i32, y: i32, ...) void {
    const borderChars = getBorderChars(borderStyle);

    // Top-left corner
    setCell(bufPtr, x, y, borderChars.topLeft, fg, bg, 0);

    // Horizontal line (loop in Zig for speed)
    for (x+1..x+width-1) |col| {
        setCell(bufPtr, col, y, borderChars.horizontal, fg, bg, 0);
    }
    // ... rest of border
}
```

---

## Layout Engine: Yoga Integration

**Yes, OpenTUI uses Yoga** for layout. But it's **not** React-style reconciliation—it's just the layout engine.

### What is Yoga?

[Yoga](https://yogalayout.dev/) is Facebook's **cross-platform Flexbox implementation**. Originally written in C++, OpenTUI uses the `yoga-layout` npm package (compiled to WASM or native).

```typescript
// src/Renderable.ts
import Yoga from "yoga-layout";

class Renderable {
  protected yogaNode: Yoga.Node;

  constructor() {
    this.yogaNode = Yoga.Node.create(yogaConfig);
    this.yogaNode.setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
  }

  calculateLayout(availableWidth?: number, availableHeight?: number) {
    this.yogaNode.calculateLayout(availableWidth, availableHeight);

    // Read computed values
    this.computedLayout = {
      x: this.yogaNode.getComputedLeft(),
      y: this.yogaNode.getComputedTop(),
      width: this.yogaNode.getComputedWidth(),
      height: this.yogaNode.getComputedHeight(),
    };
  }
}
```

### Layout Properties

All standard Flexbox properties work:

```typescript
new BoxRenderable(renderer, {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  flexGrow: 1,
  flexShrink: 0,
  padding: 2,
  margin: 1,
  minWidth: 20,
  maxHeight: 100,
});
```

**Units**:
- Numbers → cell counts (e.g., `width: 40` = 40 terminal columns)
- `"auto"` → Yoga auto
- `"100%"` → Percentage of parent (via `yoga.setWidthPercent()`)

### When Layout Happens

Layout is recomputed:
1. **On terminal resize** (`stdout.on("resize")`)
2. **When Renderable tree changes** (add/remove children)
3. **When layout properties change** (set `flexGrow`, etc.)

**Optimization**: Layout is cached until dirty. `requestRender()` triggers layout only if needed.

---

## Building TUIs Without React/Solid

### Imperative API (Core)

The `@opentui/core` package provides a **direct, imperative API**:

```typescript
import { createCliRenderer, BoxRenderable, TextRenderable } from "@opentui/core";

const renderer = await createCliRenderer();

// Create elements
const container = new BoxRenderable(renderer, {
  id: "container",
  flexDirection: "row",
  width: "100%",
  height: "100%",
});

const label = new TextRenderable(renderer, {
  id: "label",
  content: "Hello",
  fg: "#00FF00",
});

// Build tree
container.add(label);
renderer.root.add(container);

// Update dynamically
label.content = "World";  // Next frame will show "World"
```

**No virtual DOM, no reconciliation, no JSX**. You directly manipulate the Renderable tree.

### VNode API (Declarative, Non-Reactive)

For convenience, OpenTUI provides **Constructs** (VNodes) that look like React but aren't:

```typescript
import { Box, Text, instantiate } from "@opentui/core/renderables";

// Functional construct (returns VNode)
function MyComponent(props: { title: string }) {
  return Box({ flexDirection: "column" }, [
    Text({ content: props.title, fg: "blue" }),
    Box({ height: 10, border: true }),
  ]);
}

// Mount to renderer
const vnode = MyComponent({ title: "Hello" });
const instance = instantiate(renderer, vnode);  // Creates actual Renderables
renderer.root.add(instance);
```

**Key difference from React**:
- **Not reactive**: Changing `props.title` doesn't auto-update. You'd recreate the VNode and replace the old instance.
- **Just sugar**: `Box()` returns a VNode. `instantiate()` walks the VNode tree and creates `BoxRenderable` instances.

From `vnode.ts`:
```typescript
export function h<P>(type: Construct<P>, props?: P, ...children: VChild[]): VNode<P> {
  return {
    type,
    props,
    children: flattenChildren(children),
  };
}

export function instantiate(ctx: RenderContext, vnode: VNode): Renderable {
  if (isRenderableConstructor(vnode.type)) {
    const instance = new vnode.type(ctx, vnode.props);
    for (const child of vnode.children) {
      const childInstance = maybeMakeRenderable(ctx, child);
      if (childInstance) instance.add(childInstance);
    }
    return instance;
  }
  // ... handle functional constructs
}
```

### When to Use VNodes?

- **Static layouts**: Define UI structure once
- **Simple apps**: Less boilerplate than imperative
- **Avoiding**: You must manually manage updates (no `useState` equivalent)

For dynamic UIs, consider `@opentui/solid` or `@opentui/react` reconcilers, or stick with imperative updates.

---

## Buffer System & Grapheme Handling

### Grapheme Clusters: The Unicode Challenge

Terminal cells have **variable width**:
- ASCII `A` = 1 cell
- Emoji `👍` = 2 cells (East Asian Wide)
- Combined `é` (e + ◌́) = 1 cell (single grapheme cluster)

**Grapheme Pool** (`src/zig/grapheme.zig`):
```zig
pub const GraphemePool = struct {
    clusters: std.ArrayList(GraphemeCluster),
    allocator: Allocator,

    pub fn store(self: *GraphemePool, bytes: []const u8) u32 {
        // Returns ID to store in buffer.char
        const id = self.clusters.items.len;
        self.clusters.append(.{ .bytes = bytes, .width = computeWidth(bytes) });
        return id | GRAPHEME_FLAG;
    }
};
```

**Buffer stores**:
- Simple chars: `char = 0x41` (ASCII 'A')
- Graphemes: `char = pool_id | 0x80000000` (high bit set)

During rendering, Zig checks the high bit:
```zig
if (char & 0x80000000 != 0) {
    const cluster = pool.get(char & 0x7FFFFFFF);
    output.write(cluster.bytes);
} else {
    output.write(utf8Encode(char));
}
```

### Width Calculation

Two methods (`src/zig/utf8.zig`):
1. **`wcwidth`**: Uses POSIX `wcwidth()` C function (platform-dependent)
2. **`unicode`**: Unicode 16.0 tables (consistent, Mode 2026 support)

Set via `WidthMethod` enum. Default: `unicode`.

**Why it matters**: Mismatched widths cause:
- Cursor misalignment
- Text overflow
- Broken borders

### Scissor Stack (Clipping)

Buffers support **nested clipping regions** via `scissor_stack`:

```typescript
buffer.pushScissor(10, 10, 30, 20);  // Clip to rectangle
buffer.fillRect(0, 0, 100, 100, red);  // Only draws within scissor
buffer.popScissor();
```

**Use case**: `overflow: hidden` in Yoga layout.

From `buffer.zig`:
```zig
pub fn pushScissor(self: *OptimizedBuffer, x: i32, y: i32, w: u32, h: u32) void {
    const rect = ClipRect{ .x = x, .y = y, .width = w, .height = h };
    self.scissor_stack.append(self.allocator, rect);
}

inline fn isInsideScissor(self: *OptimizedBuffer, x: i32, y: i32) bool {
    if (self.scissor_stack.items.len == 0) return true;
    const rect = self.scissor_stack.items[self.scissor_stack.items.len - 1];
    return x >= rect.x and x < rect.x + rect.width and
           y >= rect.y and y < rect.y + rect.height;
}
```

---

## FFI Boundary & Performance

### Memory Sharing

**Zero-copy principle**: Buffers are allocated in Zig, exposed to TypeScript via `toArrayBuffer()`:

```typescript
// TypeScript
const charPtr = lib.bufferGetCharPtr(bufferPtr);
const chars = new Uint32Array(toArrayBuffer(charPtr, 0, size * 4));

// Now chars is a view over Zig memory
chars[index] = 0x1F600;  // Write emoji directly to Zig buffer
```

**Danger**: If Zig reallocates the buffer, the TS TypedArray is invalidated. OpenTUI mitigates this by:
- Pre-allocating buffers at renderer creation
- Never resizing during render loop
- Swapping double-buffered pointers instead

### FFI Call Overhead

Each FFI call has ~50-100ns overhead (Bun FFI marshaling). OpenTUI minimizes calls:

**Bad** (1000 FFI calls):
```typescript
for (let i = 0; i < 1000; i++) {
  lib.bufferSetCell(bufPtr, x, y, char, fg, bg, attr);  // FFI per cell!
}
```

**Good** (direct memory writes):
```typescript
const chars = buffer.buffers.char;  // Get TypedArray once
for (let i = 0; i < 1000; i++) {
  chars[y * width + x] = char;  // Pure JS, no FFI
}
```

**When Zig is necessary**:
- Complex operations (border drawing with corner detection)
- ANSI generation (stateful, requires prev frame comparison)
- Thread-safe rendering (Zig manages mutex)

### Threading

`renderer.setUseThread(true)` enables **background rendering**:

```zig
// src/zig/renderer.zig
pub fn setUseThread(self: *CliRenderer, use_thread: bool) void {
    self.useThread = use_thread;
    if (use_thread) {
        self.renderThread = std.Thread.spawn(.{}, renderThreadFn, .{self});
    }
}

fn renderThreadFn(self: *CliRenderer) void {
    while (!self.shouldTerminate) {
        self.renderMutex.lock();
        while (!self.renderRequested) {
            self.renderCondition.wait(&self.renderMutex);
        }
        self.renderMutex.unlock();

        // Do expensive ANSI generation off main thread
        generateANSI(self);
    }
}
```

**Note**: Currently disabled on Linux (thread spawn issue).

---

## Debugging Guide

### TypeScript Debugging

**Console overlay**:
```typescript
const renderer = await createCliRenderer({ consoleOptions: { startInDebugMode: true } });
console.log("Debug message");  // Appears in overlay
```

Toggle with backtick key. Scroll with arrows.

**Inspect Renderable tree**:
```typescript
renderer.root.getChildren().forEach(child => {
  console.log(child.id, child.computedLayout);
});
```

**Visual bounds debugging**:
```typescript
// Draw red border around Renderable
renderable.renderAfter = function(buffer) {
  buffer.drawBox(this.x, this.y, this.width, this.height, "single", RGBA.fromHex("#FF0000"));
};
```

### Zig Debugging

**Enable logging**:
```bash
export OTUI_DEBUG_FFI=1   # Log all FFI calls
export OTUI_TRACE_FFI=1   # Trace FFI arguments
```

**GDB/LLDB**:
```bash
lldb bun
(lldb) process launch -- run src/examples/hello-world.ts
(lldb) breakpoint set --name bufferSetCell
```

**Print from Zig** (visible in console overlay):
```zig
const logger = @import("logger.zig");
logger.debug("Buffer size: {} x {}", .{width, height});
```

### Common Issues

**Problem**: Text disappears or garbled
- **Cause**: Width mismatch (wcwidth vs unicode)
- **Fix**: Set `widthMethod: "unicode"` explicitly

**Problem**: Cursor position wrong
- **Cause**: Terminal doesn't support ANSI sequence
- **Debug**: Check `renderer.terminal.caps`

**Problem**: Performance drops
- **Profile**: `renderer.stats` (FPS, cellsUpdated, renderTime)
- **Fix**: Reduce dirty regions, batch updates

**Problem**: FFI crash (segfault)
- **Cause**: Passing invalid pointer or wrong type
- **Debug**: `OTUI_TRACE_FFI=1` shows args
- **Fix**: Ensure buffer not destroyed before use

---

## Common Pitfalls

### 1. Forgetting to Call `renderer.start()`

**Symptom**: Nothing renders despite calling `renderer.root.add()`

```typescript
const renderer = await createCliRenderer();
renderer.root.add(myElement);
// Nothing shows!

renderer.start();  // Starts RAF loop
```

**Alternative**: Manual render
```typescript
renderer.requestRender();  // Render once
```

### 2. Modifying VNode After `instantiate()`

```typescript
const vnode = Box({ width: 100 });
const instance = instantiate(renderer, vnode);

vnode.props.width = 200;  // DOES NOTHING!
instance.width = 200;     // Correct
```

VNodes are blueprints. Modify the Renderable instance.

### 3. Layout Not Updating

```typescript
box.flexGrow = 2;
// Layout doesn't change until:
renderer.root.calculateLayout();  // Explicit
// OR
renderer.requestRender();  // Triggers layout if dirty
```

### 4. Z-Index Confusion

```typescript
const back = new BoxRenderable(renderer, { zIndex: 10 });
const front = new BoxRenderable(renderer, { zIndex: 5 });

container.add(back);
container.add(front);  // front is on TOP (added later)
```

**Solution**: OpenTUI sorts by zIndex during render, but **insertion order** matters when zIndex is equal. Use explicit zIndex values.

### 5. Memory Leaks

```typescript
const myBox = new BoxRenderable(renderer, { id: "leaky" });
renderer.root.add(myBox);

// Later...
renderer.root.remove("leaky");  // Removes from tree

// But if you hold reference:
myBox.render(...);  // ERROR: renders to destroyed buffer

// Proper cleanup:
myBox.destroyRecursively();  // Frees Yoga nodes, Zig resources
myBox = null;
```

---

## Quick Reference

### Imperative Pattern

```typescript
import { createCliRenderer, BoxRenderable, TextRenderable } from "@opentui/core";

const renderer = await createCliRenderer({ targetFps: 30 });

const container = new BoxRenderable(renderer, {
  flexDirection: "column",
  width: "100%",
  height: "100%",
});

const text = new TextRenderable(renderer, {
  content: "Hello",
  fg: "#FFFFFF",
});

container.add(text);
renderer.root.add(container);
renderer.start();

// Update
setInterval(() => {
  text.content = `Time: ${Date.now()}`;
}, 1000);
```

### VNode Pattern

```typescript
import { createCliRenderer, Box, Text, instantiate } from "@opentui/core";

const renderer = await createCliRenderer();

function App() {
  return Box({ flexDirection: "column" }, [
    Text({ content: "Title", fg: "blue" }),
    Box({ height: 10, border: true }),
  ]);
}

const app = instantiate(renderer, App());
renderer.root.add(app);
renderer.start();
```

### Custom Rendering

```typescript
import { createCliRenderer, FrameBufferRenderable, RGBA } from "@opentui/core";

const renderer = await createCliRenderer();

const canvas = new FrameBufferRenderable(renderer, {
  width: 50,
  height: 20,
});

// Draw pixel art
canvas.frameBuffer.fillRect(10, 5, 20, 10, RGBA.fromHex("#FF0000"));
canvas.frameBuffer.drawText("Hello", 15, 8, RGBA.fromHex("#FFFFFF"));

renderer.root.add(canvas);
renderer.start();
```

---

## Performance Tips

1. **Minimize FFI calls**: Access `buffer.buffers.*` once, iterate in JS
2. **Batch updates**: Change 100 properties, then call `requestRender()` once
3. **Use `buffered: true`**: For complex custom rendering, render to off-screen buffer first
4. **Disable threading on Linux**: Known issue, will crash
5. **Profile with `renderer.stats.renderTime`**: Target <16ms for 60 FPS

---

## Architecture Decisions: Why This Way?

**Q: Why not pure Zig?**
A: Developer ergonomics. TS ecosystem (npm, bundlers, testing) is mature. Yoga has a TS binding.

**Q: Why not pure TS?**
A: Performance. Terminal rendering is 90% buffer manipulation. Zig is 50x faster for tight loops.

**Q: Why Yoga instead of custom layout?**
A: Flexbox is a proven model. Yoga is battle-tested (React Native uses it). Don't reinvent.

**Q: Why Bun FFI instead of N-API?**
A: Bun FFI is simpler (no build step), lower overhead (~50ns vs ~200ns), and OpenTUI targets Bun first.

**Q: Why double buffering?**
A: ANSI output is stateful (cursor position, colors). Diff minimizes escape sequences (600 vs 50,000 chars).

---

## Conclusion

OpenTUI is a **hybrid architecture** leveraging:
- **TypeScript** for high-level orchestration and developer UX
- **Zig** for low-level performance and cross-platform portability
- **Yoga** for battle-tested Flexbox layout
- **Bun FFI** for seamless, low-overhead glue

When debugging:
1. **TS issues**: Inspect Renderable tree, check layout values
2. **Rendering issues**: Enable console overlay, check buffer state
3. **Performance issues**: Profile FFI call frequency, check render stats
4. **Zig crashes**: Use LLDB, enable trace logging

For simple TUIs, the imperative or VNode APIs work without React/Solid. For complex reactive UIs, use the reconciler packages.

**Next steps**:
- Read `src/examples/simple-layout-example.ts` for patterns
- Experiment with `FrameBufferRenderable` for custom graphics
- Dive into `src/zig/buffer.zig` to understand buffer operations
- Profile your app with `renderer.stats` and optimize hot paths
