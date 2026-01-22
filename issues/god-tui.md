# God TUI: Complete Engineering Specification

A language-agnostic specification for building a production-grade terminal user interface with AI integration, based on reverse-engineering pi-mono.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Terminal Abstraction Layer](#terminal-abstraction-layer)
3. [Rendering Engine](#rendering-engine)
4. [Component System](#component-system)
5. [Text Editor](#text-editor)
6. [Input Handling](#input-handling)
7. [Width Calculation](#width-calculation)
8. [ANSI Escape Sequences](#ansi-escape-sequences)
9. [Overlay System](#overlay-system)
10. [AI Provider Abstraction](#ai-provider-abstraction)
11. [Extension System](#extension-system)
12. [Session Management](#session-management)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION LAYER                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Agent     │  │  Session    │  │  Extension  │  │   Tool Execution    │ │
│  │   Loop      │  │  Manager    │  │   Runner    │  │                     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
├─────────┼────────────────┼────────────────┼────────────────────┼────────────┤
│         │                │                │                    │            │
│         ▼                ▼                ▼                    ▼            │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         TUI FRAMEWORK LAYER                             ││
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────┐   ││
│  │  │   Component   │  │   Renderer    │  │      Input Handler        │   ││
│  │  │   Container   │  │   (Diffing)   │  │   (Keyboard/Paste/IME)    │   ││
│  │  └───────┬───────┘  └───────┬───────┘  └─────────────┬─────────────┘   ││
│  └──────────┼──────────────────┼────────────────────────┼─────────────────┘│
├─────────────┼──────────────────┼────────────────────────┼──────────────────┤
│             ▼                  ▼                        ▼                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                      TERMINAL ABSTRACTION LAYER                        ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │  Terminal Interface: write(), columns, rows, start(), stop()    │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────────┤
│                              SYSTEM LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │              process.stdin / process.stdout (raw mode)                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Principles

1. **No external TUI frameworks** - Built from ANSI escape sequences
2. **Differential rendering** - Only redraw changed lines
3. **Synchronized output** - Prevent flicker with DEC synchronization
4. **Grapheme-aware** - Proper emoji and CJK character handling
5. **Component-based** - Composable UI elements
6. **Event-driven** - Lifecycle hooks for extensibility

---

## Terminal Abstraction Layer

### Interface Definition

```
Terminal {
  // Lifecycle
  start(onInput: fn(string), onResize: fn()) -> void
  stop() -> void

  // Output
  write(data: string) -> void

  // Dimensions
  columns: int (read-only)
  rows: int (read-only)

  // Cursor
  hideCursor() -> void
  showCursor() -> void
  moveBy(lines: int) -> void  // negative = up, positive = down

  // Clear operations
  clearLine() -> void
  clearFromCursor() -> void
  clearScreen() -> void

  // Metadata
  setTitle(title: string) -> void
  kittyProtocolActive: bool (read-only)
}
```

### Implementation Requirements

1. **Raw Mode**: Enable terminal raw mode on start, restore on stop
2. **Encoding**: Set stdin encoding to UTF-8
3. **Bracketed Paste**: Enable with `\x1b[?2004h`, disable with `\x1b[?2004l`
4. **Resize Handling**: Listen for SIGWINCH (Unix) or equivalent
5. **Kitty Protocol**: Query and enable enhanced keyboard reporting

### Kitty Keyboard Protocol

Query support:
```
Send: \x1b[?u
Response: \x1b[?{flags}u (if supported)
```

Enable enhanced mode:
```
Send: \x1b[>7u
Flags: 1=disambiguate, 2=report events, 4=report alternate keys
```

Disable on exit:
```
Send: \x1b[<u
```

---

## Rendering Engine

### Differential Rendering Algorithm

```
function doRender():
  newLines = renderAllComponents(terminalWidth)
  newLines = compositeOverlays(newLines)
  cursorPos = extractCursorMarker(newLines)
  newLines = applyLineResets(newLines)

  if previousLines.empty or widthChanged:
    fullRender(newLines)
    return

  // Find changed range
  firstChanged = -1
  lastChanged = -1
  for i in 0..max(newLines.length, previousLines.length):
    if newLines[i] != previousLines[i]:
      if firstChanged == -1: firstChanged = i
      lastChanged = i

  if firstChanged == -1:
    // No changes, just update cursor
    positionCursor(cursorPos)
    return

  // Check if changes are within viewport
  viewportTop = max(0, maxLinesRendered - terminalHeight)
  if firstChanged < viewportTop:
    fullRender(newLines)  // Changes above viewport
    return

  // Incremental update
  buffer = "\x1b[?2026h"  // Begin synchronized output
  buffer += moveCursorTo(firstChanged)

  for i in firstChanged..lastChanged:
    if i > firstChanged: buffer += "\r\n"
    buffer += "\x1b[2K"  // Clear line
    buffer += newLines[i]

  // Clear extra lines if content shrunk
  if previousLines.length > newLines.length:
    for i in newLines.length..previousLines.length:
      buffer += "\r\n\x1b[2K"
    buffer += moveCursorUp(previousLines.length - newLines.length)

  buffer += "\x1b[?2026l"  // End synchronized output
  terminal.write(buffer)

  previousLines = newLines
  positionCursor(cursorPos)
```

### Synchronized Output

Wrap all rendering in DEC synchronized update mode to prevent tearing:
- Begin: `\x1b[?2026h`
- End: `\x1b[?2026l`

### Line Reset Strategy

Append reset sequence to each line to prevent style bleeding:
```
RESET = "\x1b[0m\x1b]8;;\x07"  // SGR reset + hyperlink reset
```

Exception: Lines containing images (Kitty/iTerm2 protocol) should not be reset.

---

## Component System

### Component Interface

```
Component {
  render(width: int) -> string[]  // Returns array of lines
  handleInput?(data: string) -> void  // Optional keyboard handler
  invalidate() -> void  // Clear cached render state
  wantsKeyRelease?: bool  // Opt-in for key release events
}
```

### Focusable Interface

```
Focusable extends Component {
  focused: bool  // Set by TUI when focus changes
}
```

When focused, component should emit `CURSOR_MARKER` at cursor position for hardware cursor positioning.

### Container Component

```
Container implements Component {
  children: Component[]

  addChild(component) -> void
  removeChild(component) -> void
  clear() -> void

  render(width):
    lines = []
    for child in children:
      lines.append(...child.render(width))
    return lines

  invalidate():
    for child in children:
      child.invalidate()
}
```

### Built-in Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| Text | Static text display | Word wrap, ANSI styling |
| Box | Bordered container | Configurable borders, padding |
| Editor | Multi-line text input | See [Text Editor](#text-editor) |
| Input | Single-line input | Autocomplete support |
| SelectList | Scrollable selection | Keyboard navigation |
| Loader | Spinner animation | Frame-based animation |
| Markdown | MD to ANSI | Headers, code, lists, links |
| Image | Inline images | Kitty/iTerm2 protocol |

---

## Text Editor

### State Model

```
EditorState {
  lines: string[]      // Content split by newlines
  cursorLine: int      // Current line index
  cursorCol: int       // Current column (character offset)
}
```

### Features Checklist

- [ ] Multi-line editing
- [ ] Word wrap with preserved cursor position
- [ ] Grapheme-aware cursor movement
- [ ] Kill ring (Emacs-style clipboard)
- [ ] Undo stack with coalescing
- [ ] Command history
- [ ] Bracketed paste handling
- [ ] Large paste compression
- [ ] Autocomplete integration
- [ ] Vertical scrolling
- [ ] IME support (hardware cursor)

### Keybinding Map

| Key | Action |
|-----|--------|
| `Ctrl+A` | Move to line start |
| `Ctrl+E` | Move to line end |
| `Ctrl+K` | Kill to end of line |
| `Ctrl+U` | Kill to start of line |
| `Ctrl+W` | Kill word backward |
| `Alt+D` | Kill word forward |
| `Ctrl+Y` | Yank (paste from kill ring) |
| `Alt+Y` | Yank-pop (cycle kill ring) |
| `Ctrl+Z` | Undo |
| `Alt+Left` | Word backward |
| `Alt+Right` | Word forward |
| `Up/Down` | Line navigation or history |
| `Enter` | Submit |
| `Shift+Enter` | Insert newline |
| `Tab` | Trigger autocomplete |
| `Backspace` | Delete character/grapheme backward |
| `Delete` | Delete character/grapheme forward |

### Kill Ring Implementation

```
KillRing {
  entries: string[]
  lastAction: "kill" | "yank" | null

  add(text, prepend: bool):
    if lastAction == "kill" and entries.notEmpty:
      // Accumulate with previous
      if prepend:
        entries.last = text + entries.last
      else:
        entries.last = entries.last + text
    else:
      entries.push(text)

  yank() -> string:
    return entries.last

  yankPop():
    // Rotate: move last to front
    last = entries.pop()
    entries.unshift(last)
    return entries.last
}
```

### Undo Coalescing

Group consecutive character insertions into single undo units:
- Whitespace triggers snapshot (so undo removes word + space together)
- Each whitespace is separately undoable
- Non-typing actions (paste, delete-word) create immediate snapshots

```
insertCharacter(char):
  if isWhitespace(char) or lastAction != "type-word":
    pushUndoSnapshot()
  lastAction = "type-word"
  // ... insert logic
```

### Visual Line Mapping

For word-wrapped content, maintain mapping between visual and logical positions:

```
VisualLine {
  logicalLine: int    // Index into state.lines
  startCol: int       // Start column in logical line
  length: int         // Length of this visual segment
}

buildVisualLineMap(width) -> VisualLine[]:
  result = []
  for i, line in state.lines:
    if visibleWidth(line) <= width:
      result.push({logicalLine: i, startCol: 0, length: line.length})
    else:
      chunks = wordWrapLine(line, width)
      for chunk in chunks:
        result.push({logicalLine: i, startCol: chunk.start, length: chunk.length})
  return result
```

### Cursor Rendering

```
renderCursorAtPosition(line, cursorPos):
  before = line[0:cursorPos]
  after = line[cursorPos:]
  marker = CURSOR_MARKER if focused else ""

  if after.notEmpty:
    // Cursor on character - highlight first grapheme
    firstGrapheme = segmentGraphemes(after)[0]
    rest = after[firstGrapheme.length:]
    return before + marker + "\x1b[7m" + firstGrapheme + "\x1b[0m" + rest
  else:
    // Cursor at end - show highlighted space
    return before + marker + "\x1b[7m \x1b[0m"
```

---

## Input Handling

### Stdin Buffer

Parse raw stdin into discrete input sequences:

```
StdinBuffer {
  buffer: string
  timeout: int  // ms to wait for escape sequence completion

  process(data):
    buffer += data

    // Check for bracketed paste
    if buffer.contains("\x1b[200~"):
      // Buffer until paste end marker
      endIdx = buffer.indexOf("\x1b[201~")
      if endIdx != -1:
        pasteContent = extract(buffer, "\x1b[200~", "\x1b[201~")
        emit("paste", pasteContent)
        buffer = buffer[endIdx + 6:]

    // Parse escape sequences
    while buffer.notEmpty:
      seq = tryParseSequence(buffer)
      if seq:
        emit("data", seq.value)
        buffer = buffer[seq.length:]
      else if buffer.startsWith("\x1b"):
        // Incomplete escape - wait for more data or timeout
        if timedOut:
          emit("data", buffer[0])
          buffer = buffer[1:]
        else:
          break
      else:
        emit("data", buffer[0])
        buffer = buffer[1:]
}
```

### Key Matching

Match input sequences to key identifiers:

```
matchesKey(data, keyId) -> bool:
  // Handle Kitty CSI-u format: \x1b[{code};{modifiers}u
  // Handle legacy format: \x1b[{letter} or \x1b{letter}
  // Handle special: \x1b[A (up), \x1b[B (down), etc.

  patterns = {
    "ctrl+a": ["\x01"],
    "ctrl+c": ["\x03"],
    "up": ["\x1b[A", "\x1bOA"],
    "down": ["\x1b[B", "\x1bOB"],
    "shift+enter": ["\x1b[13;2u", "\x1b\r"],
    // ... etc
  }

  return data in patterns[keyId]
```

### Key Release Detection (Kitty)

```
isKeyRelease(data) -> bool:
  // Kitty format: \x1b[{code};{modifiers}:{eventType}u
  // eventType 3 = release
  match = data.match(/\x1b\[\d+;\d+:(\d+)u/)
  return match and match[1] == "3"
```

---

## Width Calculation

### Visible Width Algorithm

```
visibleWidth(str) -> int:
  if str.empty: return 0

  // Fast path: pure ASCII printable
  if isPureAscii(str): return str.length

  // Check cache
  if cached = widthCache.get(str): return cached

  // Normalize
  clean = str
    .replace("\t", "   ")                    // Tab expansion
    .replace(/\x1b\[[0-9;]*[mGKHJ]/g, "")   // Strip SGR/cursor
    .replace(/\x1b\]8;;[^\x07]*\x07/g, "")  // Strip hyperlinks
    .replace(/\x1b_[^\x07]*\x07/g, "")      // Strip APC sequences

  // Calculate using grapheme segmentation
  width = 0
  for segment in Intl.Segmenter(clean, {granularity: "grapheme"}):
    width += graphemeWidth(segment)

  widthCache.set(str, width)
  return width

graphemeWidth(segment) -> int:
  // Zero-width characters
  if isZeroWidth(segment): return 0

  // RGI Emoji = 2 columns
  if isRgiEmoji(segment): return 2

  // East Asian Width
  codepoint = segment.codePointAt(0)
  return eastAsianWidth(codepoint)  // 1 or 2
```

### East Asian Width Categories

| Category | Width | Examples |
|----------|-------|----------|
| Narrow (Na) | 1 | ASCII letters, digits |
| Halfwidth (H) | 1 | Halfwidth Katakana |
| Wide (W) | 2 | CJK ideographs |
| Fullwidth (F) | 2 | Fullwidth ASCII |
| Ambiguous (A) | 1* | Greek, Cyrillic |
| Neutral (N) | 1 | Other |

*Ambiguous characters may be 2 in East Asian context

### Grapheme Segmentation

Use `Intl.Segmenter` (or equivalent library) for proper Unicode segmentation:
- Handles emoji sequences (👨‍👩‍👧 = 1 grapheme)
- Handles combining characters (é = 1 grapheme)
- Handles regional indicators (🇺🇸 = 1 grapheme)

### Text Slicing by Column

```
sliceByColumn(line, startCol, length) -> string:
  result = ""
  resultWidth = 0
  currentCol = 0
  pendingAnsi = ""

  for char in line:
    if isAnsiEscape(char):
      if currentCol >= startCol and currentCol < startCol + length:
        result += char
      else:
        pendingAnsi += char
      continue

    charWidth = graphemeWidth(char)

    if currentCol >= startCol and currentCol < startCol + length:
      if pendingAnsi:
        result += pendingAnsi
        pendingAnsi = ""
      result += char
      resultWidth += charWidth

    currentCol += charWidth
    if currentCol >= startCol + length:
      break

  return result
```

---

## ANSI Escape Sequences

### Cursor Movement

| Sequence | Action |
|----------|--------|
| `\x1b[{n}A` | Move up n lines |
| `\x1b[{n}B` | Move down n lines |
| `\x1b[{n}C` | Move right n columns |
| `\x1b[{n}D` | Move left n columns |
| `\x1b[{n}G` | Move to column n (1-indexed) |
| `\x1b[H` | Move to home (1,1) |
| `\x1b[{r};{c}H` | Move to row r, column c |
| `\r` | Carriage return (column 1) |

### Cursor Visibility

| Sequence | Action |
|----------|--------|
| `\x1b[?25h` | Show cursor |
| `\x1b[?25l` | Hide cursor |

### Clearing

| Sequence | Action |
|----------|--------|
| `\x1b[K` | Clear from cursor to end of line |
| `\x1b[2K` | Clear entire line |
| `\x1b[J` | Clear from cursor to end of screen |
| `\x1b[2J` | Clear entire screen |
| `\x1b[3J` | Clear scrollback buffer |

### SGR (Select Graphic Rendition)

Format: `\x1b[{params}m`

| Code | Effect |
|------|--------|
| 0 | Reset all |
| 1 | Bold |
| 2 | Dim |
| 3 | Italic |
| 4 | Underline |
| 7 | Inverse |
| 9 | Strikethrough |
| 22 | Normal intensity |
| 23 | Not italic |
| 24 | Not underline |
| 30-37 | Foreground colors |
| 38;5;{n} | 256-color foreground |
| 38;2;{r};{g};{b} | RGB foreground |
| 40-47 | Background colors |
| 48;5;{n} | 256-color background |
| 48;2;{r};{g};{b} | RGB background |
| 39 | Default foreground |
| 49 | Default background |
| 90-97 | Bright foreground |
| 100-107 | Bright background |

### OSC (Operating System Command)

| Sequence | Action |
|----------|--------|
| `\x1b]0;{title}\x07` | Set window title |
| `\x1b]8;;{url}\x07{text}\x1b]8;;\x07` | Hyperlink |

### DEC Private Modes

| Sequence | Action |
|----------|--------|
| `\x1b[?2004h` | Enable bracketed paste |
| `\x1b[?2004l` | Disable bracketed paste |
| `\x1b[?2026h` | Begin synchronized update |
| `\x1b[?2026l` | End synchronized update |

### APC (Application Program Command)

Used for custom markers:
```
\x1b_{payload}\x07
```

Cursor marker example: `\x1b_pi:c\x07`

---

## Overlay System

### Overlay Data Structure

```
Overlay {
  component: Component
  options: OverlayOptions
  preFocus: Component?  // Restore focus when closed
  hidden: bool
}

OverlayOptions {
  // Sizing
  width: int | percentage
  minWidth: int
  maxHeight: int | percentage

  // Positioning
  anchor: "center" | "top-left" | "top-right" | "bottom-left" |
          "bottom-right" | "top-center" | "bottom-center"
  offsetX: int
  offsetY: int
  row: int | percentage
  col: int | percentage

  // Margin
  margin: int | {top, right, bottom, left}

  // Visibility
  visible: fn(width, height) -> bool
}
```

### Overlay Compositing

```
compositeOverlays(baseLines, termWidth, termHeight) -> string[]:
  result = [...baseLines]

  for overlay in overlayStack:
    if not isVisible(overlay): continue

    // Calculate layout
    layout = resolveOverlayLayout(overlay.options, termWidth, termHeight)
    overlayLines = overlay.component.render(layout.width)

    // Apply maxHeight
    if layout.maxHeight:
      overlayLines = overlayLines[0:layout.maxHeight]

    // Extend result if needed
    while result.length < layout.row + overlayLines.length:
      result.push("")

    // Composite each line
    for i, line in overlayLines:
      resultIdx = layout.row + i
      result[resultIdx] = compositeLineAt(
        result[resultIdx],
        line,
        layout.col,
        layout.width,
        termWidth
      )

  return result

compositeLineAt(baseLine, overlayLine, col, overlayWidth, totalWidth):
  // Extract "before" segment (0 to col)
  // Extract "after" segment (col + overlayWidth to totalWidth)
  // Preserve ANSI styling across boundaries

  before = sliceByColumn(baseLine, 0, col)
  after = sliceByColumn(baseLine, col + overlayWidth, totalWidth - col - overlayWidth)

  // Pad segments to target widths
  beforePad = " ".repeat(max(0, col - visibleWidth(before)))
  overlayPad = " ".repeat(max(0, overlayWidth - visibleWidth(overlayLine)))

  return before + beforePad + RESET + overlayLine + overlayPad + RESET + after
```

### Overlay Focus Management

```
showOverlay(component, options) -> OverlayHandle:
  entry = {component, options, preFocus: focusedComponent, hidden: false}
  overlayStack.push(entry)
  setFocus(component)
  requestRender()

  return {
    hide: fn():
      overlayStack.remove(entry)
      setFocus(entry.preFocus or topVisibleOverlay())
      requestRender()

    setHidden: fn(hidden):
      entry.hidden = hidden
      if hidden and focusedComponent == component:
        setFocus(topVisibleOverlay() or entry.preFocus)
      else if not hidden:
        setFocus(component)
      requestRender()
  }
```

---

## AI Provider Abstraction

### Unified Message Types

```
UserMessage {
  role: "user"
  content: string | (TextContent | ImageContent)[]
  timestamp: int
}

AssistantMessage {
  role: "assistant"
  content: (TextContent | ThinkingContent | ToolCall)[]
  api: string
  provider: string
  model: string
  usage: Usage
  stopReason: StopReason
  timestamp: int
}

ToolResultMessage {
  role: "toolResult"
  toolCallId: string
  toolName: string
  content: (TextContent | ImageContent)[]
  isError: bool
  timestamp: int
}

TextContent { type: "text", text: string }
ImageContent { type: "image", data: base64, mimeType: string }
ThinkingContent { type: "thinking", thinking: string }
ToolCall { type: "toolCall", id: string, name: string, arguments: object }
```

### Streaming Event Types

```
AssistantMessageEvent =
  | { type: "start", partial: AssistantMessage }
  | { type: "text_start", contentIndex: int, partial }
  | { type: "text_delta", contentIndex: int, delta: string, partial }
  | { type: "text_end", contentIndex: int, content: string, partial }
  | { type: "thinking_start", contentIndex: int, partial }
  | { type: "thinking_delta", contentIndex: int, delta: string, partial }
  | { type: "thinking_end", contentIndex: int, content: string, partial }
  | { type: "toolcall_start", contentIndex: int, partial }
  | { type: "toolcall_delta", contentIndex: int, delta: string, partial }
  | { type: "toolcall_end", contentIndex: int, toolCall: ToolCall, partial }
  | { type: "done", reason: StopReason, message: AssistantMessage }
  | { type: "error", reason: StopReason, error: AssistantMessage }
```

### Provider Interface

```
Model<TApi> {
  id: string
  name: string
  api: TApi
  provider: string
  baseUrl: string
  reasoning: bool
  input: ("text" | "image")[]
  cost: { input, output, cacheRead, cacheWrite }  // $/million tokens
  contextWindow: int
  maxTokens: int
}

Context {
  systemPrompt: string?
  messages: Message[]
  tools: Tool[]?
}

Tool {
  name: string
  description: string
  parameters: JSONSchema
}

StreamOptions {
  temperature: float?
  maxTokens: int?
  signal: AbortSignal?
  apiKey: string?
}

stream(model, context, options) -> AsyncIterable<AssistantMessageEvent>
```

### Provider Implementations

| Provider | API Style | Authentication |
|----------|-----------|----------------|
| Anthropic | Native SDK | API key or OAuth |
| OpenAI | Completions/Responses | API key |
| Google Gemini | REST | API key |
| Google Vertex | SDK + ADC | Application Default Credentials |
| AWS Bedrock | SDK | AWS credentials |
| OpenAI-compatible | Completions | Various |

### Thinking Level Abstraction

```
ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh"

// Map to provider-specific parameters:
// Anthropic: budget_tokens
// OpenAI: reasoning_effort
// Google: thinkingLevel or budgetTokens
```

---

## Extension System

### Extension API

```
ExtensionAPI {
  // Event subscription
  on(event: string, handler: fn(event, ctx) -> result?)

  // Tool registration
  registerTool(definition: ToolDefinition)

  // Command registration
  registerCommand(name: string, options: CommandOptions)

  // Shortcut registration
  registerShortcut(key: KeyId, options: ShortcutOptions)

  // Actions
  sendMessage(message, options?)
  sendUserMessage(content, options?)
  appendEntry(customType, data?)
  setActiveTools(toolNames: string[])
  setModel(model) -> bool
  setThinkingLevel(level)

  // Session
  setSessionName(name)
  getSessionName() -> string?
  setLabel(entryId, label)
}
```

### Event Types

| Event | When Fired | Can Modify |
|-------|------------|------------|
| `session_start` | Initial session load | - |
| `session_before_switch` | Before session switch | Cancel |
| `session_switch` | After session switch | - |
| `before_agent_start` | Before agent loop | systemPrompt |
| `agent_start` | Agent loop begins | - |
| `agent_end` | Agent loop ends | - |
| `turn_start` | Each turn begins | - |
| `turn_end` | Each turn ends | - |
| `context` | Before LLM call | messages |
| `tool_call` | Before tool executes | Block |
| `tool_result` | After tool executes | content |
| `input` | User input received | Transform |
| `model_select` | Model changed | - |

### Tool Definition

```
ToolDefinition {
  name: string
  label: string  // UI display
  description: string  // For LLM
  parameters: JSONSchema

  execute(toolCallId, params, onUpdate, ctx, signal?) -> ToolResult

  renderCall?(args, theme) -> Component
  renderResult?(result, options, theme) -> Component
}
```

### Extension Context

```
ExtensionContext {
  ui: ExtensionUIContext
  hasUI: bool
  cwd: string
  sessionManager: ReadonlySessionManager
  modelRegistry: ModelRegistry
  model: Model?

  isIdle() -> bool
  abort() -> void
  hasPendingMessages() -> bool
  shutdown() -> void
  getContextUsage() -> ContextUsage?
  compact(options?) -> void
}
```

---

## Session Management

### Session Entry Types

```
SessionEntry =
  | UserEntry { type: "user", content, images?, timestamp }
  | AssistantEntry { type: "assistant", content, usage, stopReason, timestamp }
  | ToolResultEntry { type: "toolResult", toolCallId, toolName, content, isError }
  | CompactionEntry { type: "compaction", summary, fromEntries, toEntries }
  | BranchSummaryEntry { type: "branchSummary", summary, branchLeafId }
  | CustomEntry { type: "custom", customType, data }
```

### Session File Format

NDJSON (newline-delimited JSON):
```
{"type":"user","content":"Hello","timestamp":1234567890}
{"type":"assistant","content":[...],"usage":{...},"timestamp":1234567891}
```

### Tree Navigation

Sessions form a tree structure via forking:
- Each session file represents a branch
- Entries have parent references
- Navigation requires branch summarization

```
navigateTree(targetId, options):
  // 1. Find common ancestor
  // 2. Summarize entries being left behind
  // 3. Update current branch pointer
  // 4. Fire session_tree event
```

### Context Compaction

When context exceeds limits:
1. Prepare compaction (identify entries to summarize)
2. Fire `session_before_compact` (extensions can cancel/override)
3. Generate summary via LLM
4. Create CompactionEntry
5. Fire `session_compact`

---

## Implementation Checklist

### Phase 1: Terminal Foundation
- [ ] Terminal abstraction interface
- [ ] Raw mode management
- [ ] ANSI escape sequence output
- [ ] Stdin parsing and buffering
- [ ] Kitty keyboard protocol

### Phase 2: Rendering Engine
- [ ] Width calculation (ASCII fast path)
- [ ] Width calculation (Unicode/emoji)
- [ ] Grapheme segmentation
- [ ] Differential rendering
- [ ] Synchronized output
- [ ] Line reset handling

### Phase 3: Component System
- [ ] Component interface
- [ ] Container component
- [ ] Text component with word wrap
- [ ] Focus management
- [ ] Render loop (requestRender/nextTick)

### Phase 4: Text Editor
- [ ] Basic text editing
- [ ] Cursor movement (char/word/line)
- [ ] Kill ring
- [ ] Undo/redo
- [ ] Command history
- [ ] Bracketed paste
- [ ] Visual line mapping (word wrap)
- [ ] Scrolling
- [ ] Autocomplete

### Phase 5: Overlay System
- [ ] Overlay stack
- [ ] Anchor-based positioning
- [ ] Line compositing
- [ ] Focus management for overlays

### Phase 6: AI Integration
- [ ] Unified message types
- [ ] Streaming event system
- [ ] Anthropic provider
- [ ] OpenAI provider
- [ ] Tool calling abstraction
- [ ] Thinking/reasoning levels

### Phase 7: Extension System
- [ ] Extension loading
- [ ] Event bus
- [ ] Tool registration
- [ ] Command registration
- [ ] UI context for extensions

### Phase 8: Session Management
- [ ] Session file format
- [ ] Entry types
- [ ] Tree navigation
- [ ] Context compaction
- [ ] State persistence

---

## Reference Implementation

See `pi-mono/packages/tui` (~9k LOC) for the reference implementation:

| File | LOC | Purpose |
|------|-----|---------|
| `tui.ts` | 1062 | Main TUI class, rendering, overlays |
| `keys.ts` | 1133 | Key parsing, Kitty protocol |
| `utils.ts` | 889 | Width calc, ANSI tracking, wrap |
| `terminal.ts` | 232 | Terminal abstraction |
| `components/editor.ts` | 1921 | Full text editor |
| `components/markdown.ts` | 655 | Markdown rendering |
| `stdin-buffer.ts` | 386 | Input sequence parsing |

Total: ~9k lines for complete TUI framework + ~15k lines for coding agent application.
