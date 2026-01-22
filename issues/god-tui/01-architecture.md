# TUI Architecture Overview

Reference implementation: `pi-mono/packages/` (pi coding agent)

## Executive Summary

The TUI architecture implements a layered, event-driven terminal UI system for AI agent interfaces:

- **Differential rendering**: Line-by-line diffing, only changed lines rewritten
- **Synchronized output**: DEC 2026 mode prevents flicker/tearing
- **Component hierarchy**: Container → children, render(width) → string[]
- **Overlay system**: Z-ordered stack with anchor positioning, focus capture
- **Event-driven**: Agent events flow through session to UI listeners
- **Separation**: TUI knows nothing about AI; Agent knows nothing about display

---

## Package Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            coding-agent                                     │
│  main.ts, InteractiveMode, PrintMode, RpcMode, tools/, extensions          │
│  ~15k LOC                                                                   │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   agent-core     │  │       ai         │  │      tui         │
│                  │  │                  │  │                  │
│  Agent           │  │  Model           │  │  TUI             │
│  AgentLoop       │  │  Provider        │  │  Terminal        │
│  AgentEvent      │  │  stream()        │  │  Component       │
│  ~3k LOC         │  │  ~5k LOC         │  │  ~9k LOC         │
└────────┬─────────┘  └────────┬─────────┘  └──────────────────┘
         │                     │
         └─────────┬───────────┘
                   ▼
          ┌──────────────────┐
          │  External SDKs   │
          │  @anthropic-ai   │
          │  openai          │
          │  @google/genai   │
          │  @aws-sdk        │
          └──────────────────┘
```

### Package Responsibilities

| Package | LOC | Key Exports | External Deps |
|---------|-----|-------------|---------------|
| `tui` | ~9k | `TUI`, `Component`, `Terminal`, `Editor`, `Markdown` | `chalk`, `marked` |
| `ai` | ~5k | `Model`, `stream`, `Provider`, message types | Anthropic/OpenAI/Google SDKs |
| `agent-core` | ~3k | `Agent`, `AgentLoop`, `AgentEvent`, `ToolExecutor` | pi-ai, pi-tui |
| `coding-agent` | ~15k | `main()`, modes, tools, extensions | all above |

### Internal File Structure (tui package)

```
tui/src/
├── tui.ts              (1062)  Core TUI class, diff rendering, overlays
├── terminal.ts         (232)   Terminal interface, ProcessTerminal
├── keys.ts             (1133)  Key parsing, Kitty protocol, KeyId type
├── stdin-buffer.ts     (386)   Input buffering, sequence detection
├── utils.ts            (889)   visibleWidth, wrapTextWithAnsi, sliceByColumn
├── keybindings.ts      (168)   EditorAction enum, keybinding manager
├── autocomplete.ts     (591)   AutocompleteProvider, file/command completion
├── fuzzy.ts            (134)   Fuzzy matching algorithm
├── terminal-image.ts   (341)   Kitty/iTerm2 image protocols
├── editor-component.ts (66)    EditorComponent interface
└── components/
    ├── editor.ts       (1921)  Multi-line editor, kill ring, undo
    ├── markdown.ts     (655)   Markdown → ANSI rendering
    ├── input.ts        (346)   Single-line input
    ├── select-list.ts  (189)   Scrollable selection list
    ├── text.ts         (107)   Word-wrapped text
    ├── box.ts          (135)   Bordered container
    ├── loader.ts       (56)    Spinner animation
    ├── image.ts        (88)    Inline image display
    └── ...
```

---

## Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          APPLICATION LAYER                                  │
│  coding-agent/src/modes/interactive/interactive-mode.ts                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  InteractiveMode {                                                          │
│    ui: TUI                    // Root container                             │
│    session: AgentSession      // Wrapped agent                              │
│    editor: CustomEditor       // Input component                            │
│    chatContainer: Container   // Message history                            │
│                                                                             │
│    // Initialization                                                        │
│    init() → build UI hierarchy, setup keybindings, subscribe to agent       │
│    run()  → render history, process --message args, main input loop         │
│                                                                             │
│    // Event handlers                                                        │
│    handleAgentEvent(e) → route to UI update methods                         │
│    handleSlashCommand(cmd) → /model, /tools, /compact, /clear, etc.         │
│    handleKeybinding(key) → Ctrl+C abort, Ctrl+L clear, etc.                 │
│  }                                                                          │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ session.prompt(text)
                                     │ session.on("event", handler)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SESSION LAYER                                     │
│  coding-agent/src/core/agent-session.ts                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  AgentSession {                                                             │
│    agent: Agent               // Core agent                                 │
│    sessionManager: SessionManager  // Persistence                           │
│    model: Model               // Current LLM                                │
│    tools: AgentTool[]         // Active tools                               │
│    extensions: Extension[]    // Loaded extensions                          │
│                                                                             │
│    prompt(text, images?) → agent.prompt() + persist + emit events           │
│    compact(options?) → summarize old messages, create CompactionEntry       │
│    setModel(model) → update agent, emit model_select                        │
│                                                                             │
│    // Auto-recovery                                                         │
│    _handleAgentEvent(e) → check for overflow → auto-compact → retry         │
│                         → check for rate limit → backoff → retry            │
│  }                                                                          │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ agent.prompt(messages)
                                     │ for await (event of agent)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AGENT LAYER                                      │
│  agent-core/src/agent.ts + agent-core/src/agent-loop.ts                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Agent {                                                                    │
│    state: AgentState          // messages, model, tools, systemPrompt       │
│    steeringQueue: Message[]   // Interrupt current turn                     │
│    followUpQueue: Message[]   // After turn completes                       │
│                                                                             │
│    *prompt(msg) → yields AgentEvent                                         │
│    steer(msg) → push to steeringQueue, abort current tool                   │
│    followUp(msg) → push to followUpQueue                                    │
│  }                                                                          │
│                                                                             │
│  agentLoop(state, onEvent) {                                                │
│    while (hasMoreWork) {                                                    │
│      response = await stream(model, context)   // AI layer                  │
│      for (toolCall of response.toolCalls) {                                 │
│        if (checkSteering()) break             // Interrupt check            │
│        result = await executeTool(toolCall)   // May run parallel           │
│        yield tool_execution_end event                                       │
│      }                                                                      │
│      if (response.stopReason == "end_turn") break                           │
│    }                                                                        │
│  }                                                                          │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ stream(model, context, options)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI LAYER                                       │
│  ai/src/providers/, ai/src/streaming.ts, ai/src/models.ts                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  stream(model, context, options) → AsyncIterable<AssistantMessageEvent>     │
│                                                                             │
│  Provider implementations:                                                  │
│  ├── AnthropicProvider    → @anthropic-ai/sdk, cache_control support        │
│  ├── OpenAIProvider       → openai, Completions + Responses API             │
│  ├── GoogleProvider       → @google/generative-ai, thinkingConfig           │
│  ├── VertexProvider       → @google-cloud/vertexai, ADC auth                │
│  ├── BedrockProvider      → @aws-sdk/client-bedrock-runtime                 │
│  └── OpenRouterProvider   → OpenAI-compatible with routing                  │
│                                                                             │
│  Message transformation: unified types ↔ provider-specific formats          │
│  Streaming JSON parser: partial tool arguments for early UI updates         │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼ (parallel, not sequential)
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RENDERING LAYER                                    │
│  tui/src/tui.ts, tui/src/terminal.ts                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  TUI extends Container {                                                    │
│    terminal: Terminal         // I/O abstraction                            │
│    previousLines: string[]    // Diff cache                                 │
│    overlayStack: Overlay[]    // Z-ordered overlays                         │
│    focusedComponent: Component // Current focus                             │
│                                                                             │
│    requestRender() → nextTick coalescing → doRender()                       │
│    showOverlay(component, options) → push to stack, capture focus           │
│    setFocus(component) → update focused flags, route input                  │
│  }                                                                          │
│                                                                             │
│  Terminal {                                                                 │
│    start(onInput, onResize) → raw mode, Kitty protocol, bracketed paste     │
│    write(data) → buffered stdout                                            │
│    columns, rows → current dimensions                                       │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## TUI Core Architecture

### Component Interface

```typescript
interface Component {
    // Core rendering - returns lines for given viewport width
    // Lines may contain ANSI escape sequences
    // Must respect width constraint (truncate/wrap as needed)
    render(width: number): string[]

    // Keyboard/paste input handler (when focused or overlay)
    // data is raw terminal input (may be escape sequence)
    handleInput?(data: string): void

    // Kitty protocol: opt-in for key release events
    // Default false - only receives key press
    wantsKeyRelease?: boolean

    // Clear cached render output
    // Called on: theme change, explicit invalidation, width change
    invalidate(): void
}

interface Focusable extends Component {
    // Set by TUI.setFocus() - component should:
    // 1. Render differently when focused (cursor, highlight)
    // 2. Emit CURSOR_MARKER at cursor position for hardware cursor/IME
    focused: boolean
}

// CURSOR_MARKER: APC sequence stripped before terminal write
// Used to position hardware cursor for IME input
const CURSOR_MARKER = "\x1b_pi:c\x07"
```

### TUI Class Hierarchy

```
Container {
    children: Component[]

    addChild(component, index?) → insert at position
    removeChild(component) → remove from children
    clear() → remove all children

    render(width):
        return children.flatMap(c => c.render(width))

    handleInput(data):
        // Default: no-op (override in subclasses)

    invalidate():
        children.forEach(c => c.invalidate())
}

TUI extends Container {
    terminal: Terminal              // I/O abstraction

    // Rendering state
    previousLines: string[]         // Last rendered output (for diff)
    previousWidth: number           // Last terminal width
    maxLinesRendered: number        // High-water mark (for scrollback)
    pendingRender: boolean          // Coalescing flag

    // Focus management
    focusedComponent: Component | null
    preFocusStack: Component[]      // Restore chain for overlays

    // Overlay system
    overlayStack: OverlayEntry[]    // Z-ordered, last = top

    // Cell dimensions (for image rendering)
    cellPixelWidth: number | null
    cellPixelHeight: number | null

    // Lifecycle
    start():
        terminal.start(this.handleInput, this.handleResize)
        queryCellSize()
        requestRender()

    stop():
        terminal.stop()

    // Rendering
    requestRender(force = false):
        if force: previousLines = []
        if !pendingRender:
            pendingRender = true
            process.nextTick(() => doRender())

    // Focus
    setFocus(component):
        if focusedComponent != component:
            if focusedComponent?.focused: focusedComponent.focused = false
            focusedComponent = component
            if component?.focused !== undefined: component.focused = true
            requestRender()

    // Overlays
    showOverlay(component, options?) → OverlayHandle
    hideOverlay(handle) → void
}
```

### OverlayEntry Structure

```typescript
interface OverlayEntry {
    component: Component
    options: OverlayOptions
    preFocus: Component | null   // Restore focus when hidden
    hidden: boolean              // Temporarily invisible
}

interface OverlayHandle {
    hide(): void                 // Permanent removal
    setHidden(hidden: boolean)   // Temporary toggle
    isHidden(): boolean
}
```

### Rendering Pipeline

```
requestRender(force?)
    │
    │  if force: previousLines = []
    │  if !pendingRender: schedule nextTick
    │
    ▼
process.nextTick (coalesces multiple requestRender calls)
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              doRender()                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. RENDER COMPONENTS                                                       │
│     newLines = this.render(terminal.columns)                                │
│     // Recursively calls render() on all children                           │
│     // Each component returns string[] respecting width                     │
│                                                                             │
│  2. COMPOSITE OVERLAYS                                                      │
│     for overlay in overlayStack (bottom to top):                            │
│         if overlay.hidden or !overlay.options.visible?.(w, h): continue     │
│         layout = resolveLayout(overlay.options, w, h)                       │
│         overlayLines = overlay.component.render(layout.width)               │
│         if layout.maxHeight: overlayLines = overlayLines.slice(0, max)      │
│         // Extend newLines if overlay extends past content                  │
│         for i, line in overlayLines:                                        │
│             newLines[layout.row + i] = compositeLineAt(...)                 │
│                                                                             │
│  3. EXTRACT CURSOR POSITION                                                 │
│     cursorPos = null                                                        │
│     for i, line in newLines:                                                │
│         if (idx = line.indexOf(CURSOR_MARKER)) != -1:                       │
│             cursorPos = { row: i, col: visibleWidth(line.slice(0, idx)) }   │
│             newLines[i] = line.replace(CURSOR_MARKER, "")                   │
│             break                                                           │
│                                                                             │
│  4. APPLY LINE RESETS                                                       │
│     LINE_RESET = "\x1b[0m\x1b]8;;\x07"  // SGR + hyperlink reset            │
│     for i, line in newLines:                                                │
│         if !containsImageSequence(line):  // Skip Kitty/iTerm2 images       │
│             newLines[i] = line + LINE_RESET                                 │
│                                                                             │
│  5. DIFFERENTIAL COMPARE                                                    │
│     if !previousLines.length or widthChanged:                               │
│         fullRender(newLines)                                                │
│         return                                                              │
│                                                                             │
│     firstChanged = lastChanged = -1                                         │
│     for i in 0..max(newLines.length, previousLines.length):                 │
│         if newLines[i] != previousLines[i]:                                 │
│             if firstChanged == -1: firstChanged = i                         │
│             lastChanged = i                                                 │
│                                                                             │
│     if firstChanged == -1:                                                  │
│         positionHardwareCursor(cursorPos)                                   │
│         return  // No changes                                               │
│                                                                             │
│     // Check if changes outside viewport (scrollback)                       │
│     viewportTop = max(0, maxLinesRendered - terminal.rows)                  │
│     if firstChanged < viewportTop:                                          │
│         fullRender(newLines)                                                │
│         return                                                              │
│                                                                             │
│  6. BUILD OUTPUT BUFFER                                                     │
│     buf = "\x1b[?2026h"  // Begin synchronized output                       │
│     buf += moveCursorToLine(firstChanged)                                   │
│                                                                             │
│     for i in firstChanged..lastChanged+1:                                   │
│         if i > firstChanged: buf += "\r\n"                                  │
│         buf += "\x1b[2K"  // Clear entire line                              │
│         buf += newLines[i] ?? ""                                            │
│                                                                             │
│     // Clear removed lines if content shrunk                                │
│     for i in newLines.length..previousLines.length:                         │
│         buf += "\r\n\x1b[2K"                                                │
│     if previousLines.length > newLines.length:                              │
│         buf += "\x1b[" + (previousLines.length - newLines.length) + "A"     │
│                                                                             │
│     buf += "\x1b[?2026l"  // End synchronized output                        │
│     terminal.write(buf)                                                     │
│                                                                             │
│     previousLines = newLines                                                │
│     maxLinesRendered = max(maxLinesRendered, newLines.length)               │
│                                                                             │
│  7. POSITION HARDWARE CURSOR                                                │
│     if cursorPos:                                                           │
│         terminal.write("\x1b[" + (cursorPos.row+1) + ";" +                   │
│                        (cursorPos.col+1) + "H")                             │
│         terminal.showCursor()                                               │
│     else:                                                                   │
│         terminal.hideCursor()                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Image Sequence Detection

```typescript
function containsImageSequence(line: string): boolean {
    // Kitty graphics protocol
    if (line.includes("\x1b_G")) return true
    // iTerm2 inline images
    if (line.includes("\x1b]1337;File=")) return true
    return false
}
```

### Differential Rendering Algorithm

```pseudocode
function doRender():
    newLines = this.render(terminal.columns)
    newLines = compositeOverlays(newLines)
    cursorPos = extractCursorPosition(newLines)  // Strips CURSOR_MARKER
    newLines = applyLineResets(newLines)

    widthChanged = previousWidth != terminal.columns

    if previousLines.isEmpty() and not widthChanged:
        // First render - output everything
        fullRender(clear=false)
        return

    if widthChanged:
        // Terminal resized - clear and re-render
        fullRender(clear=true)
        return

    // Find diff bounds
    firstChanged = -1
    lastChanged = -1
    maxLines = max(newLines.length, previousLines.length)

    for i in 0..maxLines:
        oldLine = previousLines[i] or ""
        newLine = newLines[i] or ""
        if oldLine != newLine:
            if firstChanged == -1: firstChanged = i
            lastChanged = i

    if firstChanged == -1:
        // No changes - just update cursor
        positionHardwareCursor(cursorPos)
        return

    // Check if changes are outside viewport
    viewportTop = max(0, maxLinesRendered - terminal.rows)
    if firstChanged < viewportTop:
        fullRender(clear=true)
        return

    // Incremental update
    buffer = BEGIN_SYNCHRONIZED_OUTPUT
    buffer += moveCursor(firstChanged)

    for i in firstChanged..lastChanged+1:
        if i > firstChanged: buffer += "\r\n"
        buffer += CLEAR_LINE + newLines[i]

    // Clear deleted lines if content shrunk
    if previousLines.length > newLines.length:
        for each deleted line:
            buffer += "\r\n" + CLEAR_LINE
        buffer += moveCursorUp(deletedCount)

    buffer += END_SYNCHRONIZED_OUTPUT
    terminal.write(buffer)

    positionHardwareCursor(cursorPos)
    previousLines = newLines
```

---

## Terminal Abstraction

### Terminal Interface

```typescript
interface Terminal {
    // Lifecycle
    start(onInput: (data: string) => void, onResize: () => void): void
    stop(): void

    // Output
    write(data: string): void

    // Dimensions (updated on SIGWINCH)
    readonly columns: number
    readonly rows: number

    // Protocol state
    readonly kittyProtocolActive: boolean

    // Cursor control
    moveBy(lines: number): void    // negative = up, positive = down
    hideCursor(): void             // \x1b[?25l
    showCursor(): void             // \x1b[?25h

    // Clear operations
    clearLine(): void              // \x1b[2K
    clearFromCursor(): void        // \x1b[J
    clearScreen(): void            // \x1b[2J\x1b[3J\x1b[H

    // Window
    setTitle(title: string): void  // \x1b]0;{title}\x07
}
```

### ProcessTerminal Implementation

```typescript
class ProcessTerminal implements Terminal {
    private stdinBuffer: StdinBuffer
    private savedRawMode: boolean
    private kittyEnabled: boolean = false

    start(onInput, onResize):
        // 1. Save and enable raw mode
        savedRawMode = process.stdin.isRaw
        process.stdin.setRawMode(true)
        process.stdin.setEncoding("utf8")

        // 2. Enable bracketed paste
        process.stdout.write("\x1b[?2004h")

        // 3. Query Kitty keyboard protocol
        //    Send: \x1b[?u
        //    If supported, terminal responds: \x1b[?{flags}u
        process.stdout.write("\x1b[?u")

        // 4. Enable Kitty with flags 7 (1+2+4)
        //    1 = disambiguate escape codes
        //    2 = report event types (press/repeat/release)
        //    4 = report alternate keys
        process.stdout.write("\x1b[>7u")

        // 5. Query cell pixel size for images
        //    Send: \x1b[16t
        //    Response: \x1b[6;{height};{width}t
        process.stdout.write("\x1b[16t")

        // 6. Setup input handling
        stdinBuffer = new StdinBuffer()
        stdinBuffer.on("data", onInput)
        stdinBuffer.on("paste", (content) => onInput(content))
        process.stdin.on("data", (data) => stdinBuffer.process(data))

        // 7. Handle resize
        process.stdout.on("resize", () => {
            // Force terminal to update dimensions
            process.kill(process.pid, "SIGWINCH")
            onResize()
        })
        process.on("SIGWINCH", onResize)

    stop():
        // Disable Kitty
        process.stdout.write("\x1b[<u")

        // Disable bracketed paste
        process.stdout.write("\x1b[?2004l")

        // Show cursor (may have been hidden)
        process.stdout.write("\x1b[?25h")

        // Restore raw mode
        process.stdin.setRawMode(savedRawMode)

    get columns(): number { return process.stdout.columns || 80 }
    get rows(): number { return process.stdout.rows || 24 }
}
```

### StdinBuffer State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           StdinBuffer                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  buffer: string = ""           // Accumulated input                         │
│  inPaste: boolean = false      // Inside bracketed paste                    │
│  timeout: Timer | null         // Sequence completion timeout               │
│                                                                             │
│  process(data: string):                                                     │
│      buffer += convertHighBytes(data)  // 0x80-0x9F → ESC sequences         │
│                                                                             │
│      // Handle bracketed paste                                              │
│      if inPaste or buffer.includes("\x1b[200~"):                            │
│          startIdx = buffer.indexOf("\x1b[200~")                             │
│          endIdx = buffer.indexOf("\x1b[201~")                               │
│          if endIdx != -1:                                                   │
│              paste = buffer.slice(startIdx + 6, endIdx)                     │
│              emit("paste", paste)                                           │
│              buffer = buffer.slice(endIdx + 6)                              │
│              inPaste = false                                                │
│          else:                                                              │
│              inPaste = true                                                 │
│              return                                                         │
│                                                                             │
│      // Parse sequences                                                     │
│      while buffer.length > 0:                                               │
│          seq = tryParseSequence(buffer)                                     │
│          if seq:                                                            │
│              emit("data", seq.value)                                        │
│              buffer = buffer.slice(seq.length)                              │
│          else if buffer[0] == "\x1b":                                       │
│              // Incomplete escape - wait or timeout                         │
│              if timeout expired (10ms):                                     │
│                  emit("data", "\x1b")  // Just ESC key                      │
│                  buffer = buffer.slice(1)                                   │
│              else:                                                          │
│                  scheduleTimeout(10ms)                                      │
│                  break                                                      │
│          else:                                                              │
│              emit("data", buffer[0])                                        │
│              buffer = buffer.slice(1)                                       │
│                                                                             │
│  tryParseSequence(buf) -> { value, length } | null:                         │
│      // CSI: \x1b[ ... ends at byte in @-~                                  │
│      // OSC: \x1b] ... ends at \x07 or \x1b\\                               │
│      // DCS: \x1bP ... ends at \x1b\\                                       │
│      // APC: \x1b_ ... ends at \x07 or \x1b\\                               │
│      // SS3: \x1bO + single char                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### High-Byte Conversion

Some legacy terminals send C1 control codes (0x80-0x9F) instead of ESC sequences:

```typescript
function convertHighBytes(data: string): string {
    // 0x9B → \x1b[  (CSI)
    // 0x90 → \x1bP  (DCS)
    // 0x9D → \x1b]  (OSC)
    // 0x9F → \x1b_  (APC)
    return data.replace(/[\x80-\x9f]/g, (c) => {
        return "\x1b" + String.fromCharCode(c.charCodeAt(0) - 0x40)
    })
}
```

### Input Flow

```
stdin (raw bytes)
       │
       │  May arrive chunked (partial sequences)
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           StdinBuffer                                       │
│  - Buffers until sequence complete                                          │
│  - Handles bracketed paste (\x1b[200~ ... \x1b[201~)                         │
│  - Converts C1 high bytes (0x80-0x9F → ESC sequences)                       │
│  - 10ms timeout for incomplete escape sequences                             │
│  - Emits: "data" (single sequence) or "paste" (paste content)               │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Terminal Protocol Detection                            │
│  - Kitty query response: \x1b[?{flags}u → set kittyProtocolActive           │
│  - Cell size response: \x1b[6;{h};{w}t → set cellPixelWidth/Height          │
│  - XTVersion response: \x1bP>|{name}\x1b\\ → detect terminal type           │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TUI.handleInput(data)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Check for debug key (Ctrl+Shift+D → dump state)                         │
│                                                                             │
│  2. Check key release events                                                │
│     if isKeyRelease(data):                                                  │
│         // Kitty format: \x1b[{code};{mods}:3u                              │
│         if !focusedComponent?.wantsKeyRelease: return                       │
│                                                                             │
│  3. Route to overlay (if any visible)                                       │
│     for overlay in overlayStack.reverse():  // Top to bottom                │
│         if !overlay.hidden:                                                 │
│             overlay.component.handleInput?.(data)                           │
│             return                                                          │
│                                                                             │
│  4. Route to focused component                                              │
│     focusedComponent?.handleInput?.(data)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Parsing (keys.ts)

```typescript
// Type-safe key identifiers
type KeyId =
    | "enter" | "tab" | "escape" | "backspace" | "delete"
    | "up" | "down" | "left" | "right"
    | "home" | "end" | "pageup" | "pagedown"
    | "f1" | "f2" | ... | "f12"
    | "ctrl+a" | "ctrl+b" | ... | "ctrl+z"
    | "alt+a" | "alt+b" | ... | "alt+z"
    | "shift+enter" | "shift+tab" | ...
    | "ctrl+shift+a" | ...

// Match input data against key identifier
function matchesKey(data: string, keyId: KeyId): boolean {
    // Try Kitty CSI-u format first
    if (kittyMatch = tryParseKitty(data)) {
        return kittyMatch.keyId === keyId
    }

    // Fall back to legacy sequences
    return LEGACY_SEQUENCES[keyId]?.includes(data) ?? false
}

// Kitty CSI-u format: \x1b[{codepoint};{modifiers}u
//                  or \x1b[{codepoint};{modifiers}:{eventType}u
// Modifiers: 1-indexed (1=shift, 2=alt, 4=ctrl, 8=super, 16=hyper, 32=meta)
// Event types: 1=press, 2=repeat, 3=release

// Legacy sequence examples:
const LEGACY_SEQUENCES = {
    "up":     ["\x1b[A", "\x1bOA"],
    "down":   ["\x1b[B", "\x1bOB"],
    "right":  ["\x1b[C", "\x1bOC"],
    "left":   ["\x1b[D", "\x1bOD"],
    "ctrl+a": ["\x01"],
    "ctrl+c": ["\x03"],
    "enter":  ["\r", "\n"],
    "tab":    ["\t"],
    "escape": ["\x1b"],
    "backspace": ["\x7f", "\x08"],
    // ...
}
```

---

## Overlay System

### Overlay Stack

```typescript
overlayStack: OverlayEntry[] = []

interface OverlayEntry {
    component: Component
    options: OverlayOptions
    preFocus: Component | null  // Restore focus when hidden/removed
    hidden: boolean             // Temporarily invisible
}

interface OverlayOptions {
    // Sizing
    width?: number | `${number}%`     // Absolute pixels or percentage
    minWidth?: number                  // Minimum width constraint
    maxHeight?: number | `${number}%` // Truncate if taller

    // Anchor-based positioning (mutually exclusive with row/col)
    anchor?: "center"
           | "top-left" | "top-center" | "top-right"
           | "left-center" | "right-center"
           | "bottom-left" | "bottom-center" | "bottom-right"
    offsetX?: number  // Offset from anchor position
    offsetY?: number

    // Absolute positioning (percentage of terminal)
    row?: number | `${number}%`
    col?: number | `${number}%`

    // Margins (constrains positioning within terminal)
    margin?: number | { top: number, right: number, bottom: number, left: number }

    // Dynamic visibility
    visible?: (termWidth: number, termHeight: number) => boolean
}
```

### Anchor Position Resolution

```typescript
function resolveLayout(options: OverlayOptions, termW: number, termH: number): ResolvedLayout {
    // 1. Resolve width
    let width = options.width
        ? (typeof options.width === "string"
            ? Math.floor(termW * parseFloat(options.width) / 100)
            : options.width)
        : termW

    if (options.minWidth) width = Math.max(width, options.minWidth)
    width = Math.min(width, termW)

    // 2. Resolve margins
    const margin = normalizeMargin(options.margin)  // { top, right, bottom, left }

    // 3. Calculate position based on anchor
    let row: number, col: number

    if (options.row !== undefined) {
        row = resolvePercentage(options.row, termH)
    } else {
        // Anchor-based positioning
        switch (options.anchor ?? "center") {
            case "top-left":     row = margin.top; break
            case "top-center":   row = margin.top; break
            case "top-right":    row = margin.top; break
            case "left-center":  row = Math.floor((termH - estimatedHeight) / 2); break
            case "center":       row = Math.floor((termH - estimatedHeight) / 2); break
            case "right-center": row = Math.floor((termH - estimatedHeight) / 2); break
            case "bottom-left":  row = termH - estimatedHeight - margin.bottom; break
            case "bottom-center":row = termH - estimatedHeight - margin.bottom; break
            case "bottom-right": row = termH - estimatedHeight - margin.bottom; break
        }
    }

    if (options.col !== undefined) {
        col = resolvePercentage(options.col, termW)
    } else {
        switch (options.anchor ?? "center") {
            case "top-left":     col = margin.left; break
            case "left-center":  col = margin.left; break
            case "bottom-left":  col = margin.left; break
            case "top-center":   col = Math.floor((termW - width) / 2); break
            case "center":       col = Math.floor((termW - width) / 2); break
            case "bottom-center":col = Math.floor((termW - width) / 2); break
            case "top-right":    col = termW - width - margin.right; break
            case "right-center": col = termW - width - margin.right; break
            case "bottom-right": col = termW - width - margin.right; break
        }
    }

    // Apply offsets
    row += options.offsetY ?? 0
    col += options.offsetX ?? 0

    // Clamp to terminal bounds
    row = Math.max(0, Math.min(row, termH - 1))
    col = Math.max(0, Math.min(col, termW - width))

    return { row, col, width, maxHeight: resolvePercentage(options.maxHeight, termH) }
}
```

### Overlay Compositing Algorithm

```
Base content (newLines[]):
┌─────────────────────────────────────────────────────────────────────┐
│ Line 0: "Hello world, this is some content..."                      │
│ Line 1: "More text here with ANSI \x1b[1mbold\x1b[0m styling..."    │
│ Line 2: "And another line of content..."                            │
│ Line 3: "Final line..."                                             │
└─────────────────────────────────────────────────────────────────────┘

Overlay at (row=1, col=10, width=20):
┌────────────────────┐
│ Overlay Line 0     │
│ Overlay Line 1     │
└────────────────────┘

Compositing:
┌─────────────────────────────────────────────────────────────────────┐
│ Line 0: "Hello world, this is some content..."         (unchanged)  │
│ Line 1: "More text ┌────────────────────┐styling..."                │
│ Line 2: "And anothe│ Overlay Line 1     │ent..."                    │
│ Line 3: "Final line└────────────────────┘"             (extended)   │
└─────────────────────────────────────────────────────────────────────┘
```

```typescript
function compositeLineAt(
    baseLine: string,
    overlayLine: string,
    col: number,
    overlayWidth: number,
    termWidth: number
): string {
    // Extract segments preserving ANSI codes
    const before = sliceByColumn(baseLine, 0, col, /* strict */ true)
    const after = sliceByColumn(baseLine, col + overlayWidth, termWidth - col - overlayWidth, true)

    // Pad to exact widths
    const beforePad = " ".repeat(Math.max(0, col - visibleWidth(before)))
    const overlayPad = " ".repeat(Math.max(0, overlayWidth - visibleWidth(overlayLine)))

    // Reset ANSI state between segments
    const RESET = "\x1b[0m"

    return before + beforePad + RESET + overlayLine + overlayPad + RESET + after
}

// strict=true: If wide character straddles boundary, replace with space
// Prevents half-character rendering artifacts
function sliceByColumn(line: string, startCol: number, length: number, strict: boolean): string
```

### Focus Management with Overlays

```typescript
showOverlay(component: Component, options?: OverlayOptions): OverlayHandle {
    const entry: OverlayEntry = {
        component,
        options: options ?? {},
        preFocus: this.focusedComponent,  // Save current focus
        hidden: false
    }

    this.overlayStack.push(entry)
    this.setFocus(component)  // Overlay captures focus
    this.requestRender()

    return {
        hide: () => {
            const idx = this.overlayStack.indexOf(entry)
            if (idx !== -1) {
                this.overlayStack.splice(idx, 1)
                // Restore focus to previous, or next visible overlay, or preFocus
                const topVisible = this.overlayStack.findLast(o => !o.hidden)
                this.setFocus(topVisible?.component ?? entry.preFocus)
                this.requestRender()
            }
        },

        setHidden: (hidden: boolean) => {
            entry.hidden = hidden
            if (hidden && this.focusedComponent === component) {
                // Focus moves to next visible overlay or preFocus
                const topVisible = this.overlayStack.findLast(o => !o.hidden && o !== entry)
                this.setFocus(topVisible?.component ?? entry.preFocus)
            } else if (!hidden) {
                // Restoring visibility - recapture focus
                this.setFocus(component)
            }
            this.requestRender()
        },

        isHidden: () => entry.hidden
    }
}
```

---

## Theme System

### Theme Structure

```typescript
interface Theme {
    // Colors (ANSI 256 or RGB)
    colors: {
        primary: string        // Main accent color
        secondary: string      // Secondary accent
        success: string        // Green for success states
        warning: string        // Yellow for warnings
        error: string          // Red for errors
        muted: string          // Dim text
        background: string     // Background color (if supported)
    }

    // Component-specific styling
    editor: {
        border: string         // Border characters
        borderColor: string
        cursorColor: string
        placeholder: string    // Placeholder text color
    }

    markdown: {
        heading: { h1: string, h2: string, h3: string }  // Colors
        code: { fg: string, bg: string }
        codeBlock: { fg: string, bg: string, border: string }
        link: string
        emphasis: string
        strong: string
        listMarker: string
    }

    messages: {
        user: { prefix: string, color: string }
        assistant: { prefix: string, color: string }
        tool: { prefix: string, color: string }
        error: { prefix: string, color: string }
    }

    selectList: {
        selected: { fg: string, bg: string }
        unselected: { fg: string }
    }
}
```

### Theme Loading

```typescript
// Theme search order:
// 1. --theme CLI argument
// 2. $PI_THEME environment variable
// 3. ~/.config/pi/theme.json
// 4. Built-in default theme

function loadTheme(): Theme {
    const paths = [
        process.env.PI_THEME,
        path.join(os.homedir(), ".config", "pi", "theme.json"),
    ].filter(Boolean)

    for (const p of paths) {
        if (fs.existsSync(p)) {
            const custom = JSON.parse(fs.readFileSync(p, "utf8"))
            return deepMerge(DEFAULT_THEME, custom)
        }
    }

    return DEFAULT_THEME
}

// Watch for theme file changes (hot reload)
function watchTheme(themePath: string, onUpdate: (theme: Theme) => void) {
    fs.watch(themePath, () => {
        const theme = loadTheme()
        onUpdate(theme)
    })
}
```

### Theme Application

```typescript
// Components receive theme in constructor
class Editor {
    constructor(private tui: TUI, private theme: Theme) {}

    render(width: number): string[] {
        const borderColor = this.theme.editor.borderColor
        // Apply theme colors using ANSI codes
        return [
            `\x1b[${borderColor}m┌${"─".repeat(width-2)}┐\x1b[0m`,
            // ...
        ]
    }
}

// Theme invalidation
function onThemeChange(theme: Theme) {
    // Update theme reference
    currentTheme = theme
    // Invalidate all components to force re-render with new theme
    tui.invalidate()
    tui.requestRender()
}
```

---

## Event System

### Agent Events (Complete)

```typescript
type AgentEvent =
    // Lifecycle
    | { type: "agent_start" }
    | { type: "agent_end", messages: AgentMessage[], usage: Usage }

    // Turn-level
    | { type: "turn_start" }
    | { type: "turn_end", message: AssistantMessage, toolResults: ToolResultMessage[] }

    // Message streaming
    | { type: "message_start", message: AgentMessage }
    | { type: "message_update", message: AgentMessage }  // Streaming delta
    | { type: "message_end", message: AgentMessage }

    // Tool execution
    | { type: "tool_execution_start", toolCallId: string, name: string, args: object }
    | { type: "tool_execution_update", toolCallId: string, update: ToolUpdate }
    | { type: "tool_execution_end", toolCallId: string, result: ToolResult }

    // Session events (from AgentSession)
    | { type: "model_select", model: Model, previous: Model | null }
    | { type: "auto_retry_start", attempt: number, delay: number, reason: string }
    | { type: "auto_retry_end", success: boolean }
    | { type: "auto_compaction_start", reason: "overflow" | "threshold" }
    | { type: "auto_compaction_end", result: CompactionResult }
    | { type: "context_usage", usage: ContextUsage }

    // Extension events
    | { type: "custom", customType: string, data: unknown }
```

### Event Flow

```
+-------------------+
|   User Input      |
| (editor submit)   |
+---------+---------+
          |
          v
+-------------------+
|  AgentSession     |
|  .prompt(text)    |
+---------+---------+
          |
          v
+-------------------+
|   Agent.prompt()  |
|                   |
| - Build message   |
| - Start loop      |
+---------+---------+
          |
          v
+-------------------+
|   agentLoop()     |
|                   |
| - Stream LLM      |
| - Execute tools   |
| - Handle steering |
+---------+---------+
          |
    yields events
          |
          v
+-------------------+
|  Agent listeners  |
|                   |
| - Update state    |
| - Emit to session |
+---------+---------+
          |
          v
+-------------------+
| AgentSession      |
| ._handleAgentEvent|
|                   |
| - Persist to file |
| - Emit to UI      |
| - Check compaction|
| - Handle retry    |
+---------+---------+
          |
          v
+-------------------+
| InteractiveMode   |
| event listener    |
|                   |
| - Update TUI      |
| - Show streaming  |
| - Tool execution  |
+---------+---------+
          |
          v
+-------------------+
|  requestRender()  |
+-------------------+
```

---

## Interactive Mode Components

### UI Hierarchy

```
TUI (root container)
    |
    +-- Spacer
    |
    +-- Header (logo + keybindings)
    |
    +-- Spacer
    |
    +-- [Changelog section - conditional]
    |
    +-- chatContainer
    |       |
    |       +-- UserMessageComponent[]
    |       +-- AssistantMessageComponent[]
    |       +-- ToolExecutionComponent[]
    |       +-- Spacer[]
    |
    +-- pendingMessagesContainer
    |       |
    |       +-- [pending bash/messages]
    |
    +-- statusContainer
    |       |
    |       +-- Loader
    |       +-- Text (status line)
    |
    +-- widgetContainerAbove
    |
    +-- editorContainer
    |       |
    |       +-- CustomEditor (input box)
    |
    +-- widgetContainerBelow
    |
    +-- FooterComponent
```

### Editor Component

```pseudocode
Editor implements Component, Focusable {
    state: {
        lines: string[]     // Content lines
        cursorLine: number  // Y position
        cursorCol: number   // X position
    }

    // Rendering
    scrollOffset: number
    lastWidth: number

    // Features
    autocompleteProvider?: AutocompleteProvider
    autocompleteList?: SelectList
    isAutocompleting: boolean

    // History
    history: string[]
    historyIndex: number

    // Kill ring (Emacs-style)
    killRing: string[]
    lastAction: "kill" | "yank" | "type-word" | null

    // Undo
    undoStack: EditorState[]

    // Paste tracking
    pastes: Map<number, string>  // Large paste markers
    pasteBuffer: string
    isInPaste: boolean

    // Callbacks
    onSubmit?: (text) => void
    onChange?: (text) => void
    disableSubmit: boolean
}
```

### Word Wrapping

```pseudocode
function wordWrapLine(line: string, maxWidth: number) -> TextChunk[]:
    if visibleWidth(line) <= maxWidth:
        return [{ text: line, startIndex: 0, endIndex: line.length }]

    // Tokenize into words and whitespace
    tokens = []
    for segment in segmenter.segment(line):
        // Group consecutive word chars / whitespace
        if whitespace: add to whitespace token
        else: add to word token

    chunks = []
    currentChunk = ""
    currentWidth = 0
    atLineStart = true

    for token in tokens:
        // Skip leading whitespace at line start
        if atLineStart and token.isWhitespace:
            continue

        tokenWidth = visibleWidth(token.text)

        // Handle tokens wider than maxWidth
        if tokenWidth > maxWidth:
            // Break by grapheme
            ...

        // Normal wrapping
        if currentWidth + tokenWidth > maxWidth:
            chunks.push(currentChunk.trimEnd())
            currentChunk = token.text
            currentWidth = tokenWidth
            atLineStart = true
        else:
            currentChunk += token.text
            currentWidth += tokenWidth

    return chunks
```

---

## State Management

### Agent State

```pseudocode
interface AgentState {
    systemPrompt: string
    model: Model
    thinkingLevel: ThinkingLevel  // off | minimal | low | medium | high | xhigh
    tools: AgentTool[]
    messages: AgentMessage[]

    // Streaming state
    isStreaming: boolean
    streamMessage: AgentMessage | null
    pendingToolCalls: Set<string>
    error: string | undefined
}
```

### Session Manager

```pseudocode
SessionManager {
    // Persistence
    sessionFile: string  // JSONL format

    // Session metadata
    sessionId: string
    sessionName?: string

    // State
    messages: AgentMessage[]  // In-memory copy

    // Operations
    appendMessage(msg) -> void       // Append to file
    appendCustomEntry(type, data)    // Extension data
    appendCompactionEntry(summary)   // Context compaction
    appendBranchSummary(summary)     // Branch navigation

    // Session lifecycle
    static create(cwd) -> SessionManager
    static open(path) -> SessionManager
    static continueRecent(cwd) -> SessionManager
    static forkFrom(path, cwd) -> SessionManager
}
```

### Message Queue System

```pseudocode
Agent {
    steeringQueue: AgentMessage[]   // Interrupt mid-run
    followUpQueue: AgentMessage[]   // After completion

    steer(msg):
        // Interrupt current tool, skip remaining
        steeringQueue.push(msg)

    followUp(msg):
        // Wait for completion, then process
        followUpQueue.push(msg)

    // In agent loop:
    function processQueues():
        if steeringQueue.length > 0:
            // Abort current tool execution
            // Deliver steering message
            return steering messages

        if noMoreToolCalls and followUpQueue.length > 0:
            // Deliver follow-up messages
            return followUp messages
}
```

---

## Initialization Sequence

```
main(args)
    |
    +-- runMigrations()           # Handle config upgrades
    |
    +-- discoverAuthStorage()     # API key sources
    |
    +-- discoverModels()          # Available models
    |
    +-- parseArgs() (first pass)  # Get extension paths
    |
    +-- loadExtensions()          # Load extension modules
    |
    +-- parseArgs() (second pass) # Include extension flags
    |
    +-- createSessionManager()    # Handle --continue, --resume, --session
    |
    +-- buildSessionOptions()     # Model, tools, system prompt
    |
    +-- createAgentSession()      # Wire everything together
    |
    +-- initTheme()               # Load/watch theme files
    |
    +-- new InteractiveMode(session)
            |
            +-- init()
            |       |
            |       +-- setupAutocomplete()
            |       +-- Build UI hierarchy
            |       +-- setupKeyHandlers()
            |       +-- ui.start()
            |       +-- initExtensions()
            |       +-- subscribeToAgent()
            |
            +-- run()
                    |
                    +-- renderInitialMessages()
                    +-- showStartupWarnings()
                    +-- processInitialMessages()
                    +-- Main loop: getUserInput() -> session.prompt()
```

---

## Error Handling Strategy

### Layers

```
+-------------------+     +-------------------+     +-------------------+
|  UI Layer         |     |  Session Layer    |     |  Agent Layer      |
|                   |     |                   |     |                   |
|  showError()      |<----|  Emit error event |<----|  errorMessage in  |
|  showWarning()    |     |  Auto-retry logic |     |  AgentMessage     |
|  showStatus()     |     |  Compaction       |     |  throws on abort  |
+-------------------+     +-------------------+     +-------------------+
```

### Retry Logic

```pseudocode
function handleRetryableError(msg: AssistantMessage):
    if msg.stopReason not in ["overloaded", "rate_limit", "server_error"]:
        return false

    if retryAttempt >= maxRetries:
        emit({ type: "auto_retry_end", success: false })
        return false

    retryAttempt++
    delay = calculateBackoff(retryAttempt)

    emit({ type: "auto_retry_start", attempt: retryAttempt, delay })

    await sleep(delay)

    // Retry the last user message
    await agent.continue()
    return true
```

### Context Overflow

```pseudocode
function checkCompaction(msg: AssistantMessage):
    if isContextOverflow(msg):
        emit({ type: "auto_compaction_start", reason: "overflow" })
        result = await compact()
        if result and not result.aborted:
            // Retry with compacted context
            await agent.continue()
        emit({ type: "auto_compaction_end", result })

    else if shouldCompact(estimateTokens(), thresholds):
        // Proactive compaction
        emit({ type: "auto_compaction_start", reason: "threshold" })
        await compact()
        emit({ type: "auto_compaction_end", result })
```

---

## Testability Considerations

### Terminal Abstraction

```pseudocode
// Use interface for testing
class MockTerminal implements Terminal {
    output: string[] = []
    inputQueue: string[] = []

    write(data): output.push(data)
    simulateInput(data): inputHandler(data)
    simulateResize(cols, rows): ...
}

// In tests
test "TUI renders correctly":
    terminal = new MockTerminal()
    tui = new TUI(terminal)
    tui.addChild(new Text("Hello"))
    tui.start()

    assert terminal.output contains "Hello"
```

### Component Testing

```pseudocode
test "Editor handles backspace":
    editor = new Editor(mockTui, theme)
    editor.setText("Hello")

    // Simulate backspace
    editor.handleInput("\x7f")

    assert editor.getText() == "Hell"
    assert editor.getCursor() == { line: 0, col: 4 }
```

### Event Testing

```pseudocode
test "AgentSession emits events":
    session = createTestSession()
    events = []

    session.subscribe(e => events.push(e))

    await session.prompt("Hello")

    assert events contains { type: "agent_start" }
    assert events contains { type: "message_end" }
    assert events contains { type: "agent_end" }
```

### Integration Testing

```pseudocode
test "Full interaction flow":
    terminal = new MockTerminal()
    session = createTestSession()
    mode = new InteractiveMode(session)

    // Inject mock terminal
    mode.ui = new TUI(terminal)

    await mode.init()

    // Simulate user typing
    terminal.simulateInput("Hello\r")

    // Wait for response
    await session.agent.waitForIdle()

    // Verify UI updated
    assert terminal.output contains assistantMessage
```

---

## Memory/State Patterns

### Render State Lifecycle

```
+-------------------+     +-------------------+     +-------------------+
|  Component State  |     |  previousLines    |     |  Terminal Buffer  |
|                   |     |  (diff cache)     |     |                   |
|  - Owned by comp  |---->|  - Owned by TUI   |---->|  - System stdout  |
|  - Mutable        |     |  - Replaced each  |     |  - Write-only     |
|  - invalidate()   |     |    render         |     |                   |
+-------------------+     +-------------------+     +-------------------+
```

### Session State Flow

```
+-------------------+     +-------------------+     +-------------------+
|  AgentSession     |     |  SessionManager   |     |  JSONL File       |
|  (in-memory)      |     |  (persistence)    |     |  (durable)        |
|                   |     |                   |     |                   |
|  messages[]       |---->|  appendMessage()  |---->|  one line per     |
|  model            |     |  appendEntry()    |     |  message/event    |
|  tools            |     |                   |     |                   |
+-------------------+     +-------------------+     +-------------------+
        ^                         |
        |                         v
        |                 +-------------------+
        |                 |  Session Resume   |
        +-----------------+  (load all lines) |
                          +-------------------+
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `tui/src/tui.ts` | Core TUI class, diff rendering, overlays |
| `tui/src/terminal.ts` | Terminal abstraction, ProcessTerminal |
| `tui/src/components/editor.ts` | Input editor with word wrap, history |
| `tui/src/keys.ts` | Key parsing, Kitty protocol |
| `tui/src/stdin-buffer.ts` | Input sequence splitting |
| `agent/src/agent.ts` | Agent state machine, prompt handling |
| `agent/src/agent-loop.ts` | Streaming loop, tool execution |
| `coding-agent/src/main.ts` | CLI entry, mode selection |
| `coding-agent/src/core/agent-session.ts` | Session wrapper, events |
| `coding-agent/src/modes/interactive/interactive-mode.ts` | Interactive UI |

---

## Image Rendering

### Terminal Image Protocols

```typescript
// Detect terminal image support
function detectImageSupport(): "kitty" | "iterm2" | "sixel" | null {
    const term = process.env.TERM_PROGRAM ?? ""
    const termEnv = process.env.TERM ?? ""

    // Kitty graphics protocol
    if (term === "kitty" || process.env.KITTY_WINDOW_ID) return "kitty"

    // iTerm2 inline images
    if (term === "iTerm.app" || process.env.ITERM_SESSION_ID) return "iterm2"

    // WezTerm supports both
    if (term === "WezTerm") return "kitty"

    // Ghostty supports Kitty
    if (term === "ghostty") return "kitty"

    // Sixel (older protocol, not commonly used)
    if (termEnv.includes("xterm") && process.env.COLORTERM === "truecolor") {
        // Query for sixel support: \x1b[c
        // Response contains ;4; if sixel supported
    }

    return null
}
```

### Kitty Graphics Protocol

```typescript
// Kitty image transmission
// Format: \x1b_G<key>=<value>,...;<base64>\x1b\\

function encodeKitty(imageData: Buffer, options: ImageOptions): string {
    const { width, height, id } = options

    // Transmission keys:
    // a=T    → transmit and display
    // f=100  → format: PNG (also 24=RGB, 32=RGBA)
    // s=W    → width in pixels
    // v=H    → height in pixels
    // i=ID   → image ID for later reference
    // m=0/1  → 0=last chunk, 1=more chunks follow

    const base64 = imageData.toString("base64")

    // Split into 4096-byte chunks (terminal limit)
    const chunks: string[] = []
    for (let i = 0; i < base64.length; i += 4096) {
        const chunk = base64.slice(i, i + 4096)
        const isLast = i + 4096 >= base64.length
        const m = isLast ? 0 : 1

        if (i === 0) {
            // First chunk includes all metadata
            chunks.push(`\x1b_Ga=T,f=100,s=${width},v=${height},m=${m};${chunk}\x1b\\`)
        } else {
            // Continuation chunks
            chunks.push(`\x1b_Gm=${m};${chunk}\x1b\\`)
        }
    }

    return chunks.join("")
}
```

### iTerm2 Inline Images

```typescript
// iTerm2 image format
// \x1b]1337;File=<args>:<base64>\x07

function encodeITerm2(imageData: Buffer, options: ImageOptions): string {
    const { width, height, preserveAspectRatio = true } = options

    const params = [
        "inline=1",                              // Display inline
        width ? `width=${width}` : "",           // Width (cells, pixels, %, or auto)
        height ? `height=${height}` : "",        // Height
        `preserveAspectRatio=${preserveAspectRatio ? 1 : 0}`,
    ].filter(Boolean).join(";")

    const base64 = imageData.toString("base64")

    return `\x1b]1337;File=${params}:${base64}\x07`
}
```

### Image Dimension Calculation

```typescript
// Calculate terminal rows needed for image
function calculateImageRows(
    imageWidth: number,
    imageHeight: number,
    cellPixelWidth: number,
    cellPixelHeight: number,
    maxWidthCells: number
): { widthCells: number, heightCells: number } {
    // Scale to fit within maxWidthCells
    const scaleFactor = Math.min(1, (maxWidthCells * cellPixelWidth) / imageWidth)
    const scaledWidth = Math.floor(imageWidth * scaleFactor)
    const scaledHeight = Math.floor(imageHeight * scaleFactor)

    // Convert to cell dimensions
    const widthCells = Math.ceil(scaledWidth / cellPixelWidth)
    const heightCells = Math.ceil(scaledHeight / cellPixelHeight)

    return { widthCells, heightCells }
}

// Extract dimensions from image data
function getImageDimensions(data: Buffer): { width: number, height: number } | null {
    // PNG: bytes 16-23 contain width/height (big-endian)
    if (data[0] === 0x89 && data[1] === 0x50) {  // PNG signature
        const width = data.readUInt32BE(16)
        const height = data.readUInt32BE(20)
        return { width, height }
    }

    // JPEG: scan for SOF0/SOF2 marker
    if (data[0] === 0xFF && data[1] === 0xD8) {
        // ... JPEG parsing
    }

    // GIF: bytes 6-9 contain width/height (little-endian)
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
        const width = data.readUInt16LE(6)
        const height = data.readUInt16LE(8)
        return { width, height }
    }

    return null
}
```

### Image Component

```typescript
class Image implements Component {
    constructor(
        private imageData: Buffer,
        private options: { maxWidth?: number, fallbackText?: string }
    ) {}

    render(width: number): string[] {
        const protocol = detectImageSupport()
        if (!protocol) {
            // Fallback for unsupported terminals
            return [this.options.fallbackText ?? "[Image]"]
        }

        const dims = getImageDimensions(this.imageData)
        if (!dims) return ["[Invalid image]"]

        const maxWidth = Math.min(width, this.options.maxWidth ?? width)
        const { widthCells, heightCells } = calculateImageRows(
            dims.width, dims.height,
            cellPixelWidth, cellPixelHeight,
            maxWidth
        )

        // Generate protocol-specific output
        const encoded = protocol === "kitty"
            ? encodeKitty(this.imageData, dims)
            : encodeITerm2(this.imageData, { width: widthCells })

        // Image takes heightCells rows
        // First row contains the image sequence, rest are empty (image spans them)
        const lines = [encoded]
        for (let i = 1; i < heightCells; i++) {
            lines.push("")
        }

        return lines
    }
}
```

---

## Design Principles

1. **Separation of Concerns**: TUI knows nothing about AI/agents. Agent knows nothing about display.

2. **Event-Driven**: All communication flows through events. Components are reactive.

3. **Differential Updates**: Only changed lines are rewritten. Minimize terminal I/O.

4. **Focus Management**: Single focused component at a time. Overlays capture focus.

5. **Composable Components**: Small, single-purpose components combine into complex UIs.

6. **Terminal Agnostic**: Terminal interface allows mock implementations for testing.

7. **Graceful Degradation**: Works without Kitty protocol. Bracketed paste optional. Images have text fallback.

8. **State Persistence**: Session state survives process restart. JSONL for append-only.

9. **Interruptibility**: Steering queue allows user to interrupt mid-response.

10. **Error Recovery**: Auto-retry for transient errors. Auto-compaction for overflow.

11. **Unicode Correctness**: Grapheme-aware width calculation. Proper emoji/CJK handling.

12. **ANSI Preservation**: Text operations preserve escape codes through wrap/truncate/slice.
