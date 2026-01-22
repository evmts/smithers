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

```pseudocode
interface Component {
    // Render to array of strings for given viewport width
    render(width: number) -> string[]

    // Handle keyboard input when focused
    handleInput?(data: string) -> void

    // Opt-in for key release events (Kitty protocol)
    wantsKeyRelease?: boolean

    // Invalidate cached state (theme change, etc.)
    invalidate() -> void
}

interface Focusable extends Component {
    focused: boolean  // Set by TUI when focus changes
}
```

### TUI Class Hierarchy

```
Container
    |
    +-- Component[]  (children)
    |
    +-- render(width) -> concatenates child renders
    |
    +-- invalidate() -> propagates to children

TUI extends Container
    |
    +-- terminal: Terminal
    |
    +-- previousLines: string[]   (diff cache)
    |
    +-- focusedComponent: Component | null
    |
    +-- overlayStack: OverlayEntry[]
    |
    +-- start() / stop()
    |
    +-- requestRender(force?)
    |
    +-- showOverlay() / hideOverlay()
```

### Rendering Pipeline

```
                        +-------------------+
                        |   requestRender() |
                        +---------+---------+
                                  |
                                  v
                        +-------------------+
                        | process.nextTick  |
                        | (coalesce calls)  |
                        +---------+---------+
                                  |
                                  v
+----------------------------------------------------------------------+
|                           doRender()                                 |
+----------------------------------------------------------------------+
|                                                                      |
|  1. Render all children -> newLines[]                                |
|                                                                      |
|  2. Composite overlays (if any)                                      |
|     - Calculate overlay position from OverlayOptions                 |
|     - Blend overlay lines into content                               |
|                                                                      |
|  3. Extract cursor position (CURSOR_MARKER)                          |
|                                                                      |
|  4. Apply line resets (ANSI cleanup)                                 |
|                                                                      |
|  5. Differential compare with previousLines                          |
|     - Find firstChanged, lastChanged indices                         |
|     - Handle width changes (full re-render)                          |
|     - Handle viewport scroll (check bounds)                          |
|                                                                      |
|  6. Build terminal output buffer                                     |
|     - Synchronized output mode (\x1b[?2026h ... \x1b[?2026l)         |
|     - Cursor movement sequences                                      |
|     - Line clear + content write                                     |
|                                                                      |
|  7. Position hardware cursor (IME support)                           |
|                                                                      |
+----------------------------------------------------------------------+
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

```pseudocode
interface Terminal {
    start(onInput: fn, onResize: fn) -> void
    stop() -> void
    write(data: string) -> void

    columns: number  // Current width
    rows: number     // Current height

    kittyProtocolActive: boolean

    // Cursor control
    moveBy(lines: number) -> void
    hideCursor() -> void
    showCursor() -> void

    // Clear operations
    clearLine() -> void
    clearFromCursor() -> void
    clearScreen() -> void

    setTitle(title: string) -> void
}
```

### ProcessTerminal Implementation

```
ProcessTerminal
    |
    +-- stdin/stdout management
    |
    +-- Raw mode handling
    |
    +-- Kitty keyboard protocol
    |       - Query: \x1b[?u
    |       - Enable: \x1b[>7u (flags 1+2+4)
    |       - Disable: \x1b[<u
    |
    +-- Bracketed paste mode
    |       - Enable: \x1b[?2004h
    |       - Disable: \x1b[?2004l
    |
    +-- StdinBuffer for input parsing
            - Splits batched sequences
            - Handles paste content
            - Timeout-based sequence completion
```

### Input Flow

```
stdin (raw bytes)
       |
       v
+-------------------+
|   StdinBuffer     |
|                   |
| - Sequence split  |
| - Paste detection |
| - Timeout flush   |
+--------+----------+
         |
         v
+-------------------+
|  Kitty Protocol   |
|  Detection        |
|                   |
| - Response parse  |
| - Protocol enable |
+--------+----------+
         |
         v
+-------------------+
|  TUI.handleInput  |
|                   |
| - Debug key check |
| - Overlay focus   |
| - Key release     |
|   filtering       |
| - Forward to      |
|   focused comp    |
+-------------------+
```

---

## Overlay System

### Overlay Stack

```pseudocode
overlayStack: Array<{
    component: Component
    options?: OverlayOptions
    preFocus: Component | null  // Restore on hide
    hidden: boolean
}>

interface OverlayOptions {
    // Sizing
    width?: number | "50%"
    minWidth?: number
    maxHeight?: number | "50%"

    // Positioning (anchor-based)
    anchor?: "center" | "top-left" | "top-right" |
             "bottom-left" | "bottom-right" |
             "top-center" | "bottom-center" |
             "left-center" | "right-center"
    offsetX?: number
    offsetY?: number

    // Positioning (absolute/percentage)
    row?: number | "25%"
    col?: number | "50%"

    // Margins from terminal edges
    margin?: number | { top, right, bottom, left }

    // Dynamic visibility
    visible?: (width, height) => boolean
}
```

### Overlay Compositing

```
+---------------------------------------+
|            Base Content               |
|                                       |
|   Line 0: "Hello world..."            |
|   Line 1: "Some text here..."         |
|   Line 2: "More content..."           |
|   ...                                 |
+---------------------------------------+
              |
              v
+---------------------------------------+
|    For each visible overlay:          |
|                                       |
|    1. Calculate layout (row, col, w)  |
|    2. Render at calculated width      |
|    3. Apply maxHeight truncation      |
|    4. Composite into base:            |
|       - Extract before segment        |
|       - Insert overlay content        |
|       - Extract after segment         |
|       - Handle ANSI resets            |
+---------------------------------------+
              |
              v
+---------------------------------------+
|   Line 0: "Hello world..."            |
|   Line 1: "Som+--------+here..."      |
|   Line 2: "Mor| Overlay|ent..."       |
|   Line 3: "   | Dialog |   ..."       |
|   Line 4: "   +--------+   ..."       |
+---------------------------------------+
```

---

## Event System

### Agent Events

```pseudocode
type AgentEvent =
    | { type: "agent_start" }
    | { type: "agent_end", messages: AgentMessage[] }
    | { type: "turn_start" }
    | { type: "turn_end", message: AssistantMessage, toolResults: ToolResultMessage[] }
    | { type: "message_start", message: AgentMessage }
    | { type: "message_update", message: AgentMessage }
    | { type: "message_end", message: AgentMessage }
    | { type: "tool_execution_start", toolCallId: string, name: string, args: object }
    | { type: "tool_execution_end", toolCallId: string, result: any }
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

## Design Principles

1. **Separation of Concerns**: TUI knows nothing about AI/agents. Agent knows nothing about display.

2. **Event-Driven**: All communication flows through events. Components are reactive.

3. **Differential Updates**: Only changed lines are rewritten. Minimize terminal I/O.

4. **Focus Management**: Single focused component at a time. Overlays capture focus.

5. **Composable Components**: Small, single-purpose components combine into complex UIs.

6. **Terminal Agnostic**: Terminal interface allows mock implementations for testing.

7. **Graceful Degradation**: Works without Kitty protocol. Bracketed paste optional.

8. **State Persistence**: Session state survives process restart. JSONL for append-only.

9. **Interruptibility**: Steering queue allows user to interrupt mid-response.

10. **Error Recovery**: Auto-retry for transient errors. Auto-compaction for overflow.
