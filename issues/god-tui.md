# God TUI: Complete Engineering Specification

Language-agnostic spec for production terminal UI with AI integration. Based on pi-mono reverse-engineering.

**Deep-dive specs**: `issues/god-tui/01-*.md` through `12-*.md` (~13k lines total)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION LAYER                              │
│  Agent Loop ←→ Session Manager ←→ Extension Runner ←→ Tool Execution    │
├──────────────────────────────────────────────────────────────────────────┤
│                          TUI FRAMEWORK LAYER                             │
│  Component Container ←→ Renderer (Diffing) ←→ Input Handler (Keys/IME)  │
├──────────────────────────────────────────────────────────────────────────┤
│                       TERMINAL ABSTRACTION LAYER                         │
│  Terminal { write(), columns, rows, start(), stop(), kittyProtocolActive }│
├──────────────────────────────────────────────────────────────────────────┤
│                            SYSTEM LAYER                                  │
│  stdin/stdout (raw mode) + SIGWINCH + Kitty protocol negotiation        │
└──────────────────────────────────────────────────────────────────────────┘
```

**Core Principles**: No external TUI frameworks (raw ANSI), differential line rendering, DEC 2026 synchronized output, grapheme-aware width calculation, component composition, event-driven extension hooks.

---

## 2. Terminal Abstraction Layer

```
Terminal {
  start(onInput: fn(string), onResize: fn())  // Enable raw mode, register handlers
  stop()                                       // Restore cooked mode, disable protocols
  write(data: string)                          // Buffered stdout write

  columns: int                                 // Current terminal width
  rows: int                                    // Current terminal height
  kittyProtocolActive: bool                    // True if CSI-u negotiation succeeded
  cellPixelWidth: int?                         // From CSI 16t response (for images)
  cellPixelHeight: int?

  hideCursor() -> write("\x1b[?25l")
  showCursor() -> write("\x1b[?25h")
  moveBy(n: int) -> write(n < 0 ? "\x1b[{-n}A" : "\x1b[{n}B")
  clearLine() -> write("\x1b[2K")
  clearFromCursor() -> write("\x1b[J")
  clearScreen() -> write("\x1b[2J\x1b[3J\x1b[H")  // Screen + scrollback + home
  setTitle(t: string) -> write("\x1b]0;{t}\x07")
}
```

**Start sequence**:
1. Save terminal state, enable raw mode (disable echo, canonical, signals)
2. Set stdin encoding UTF-8
3. Enable bracketed paste: `\x1b[?2004h`
4. Query Kitty protocol: `\x1b[?u` → response `\x1b[?{flags}u` means supported
5. Enable Kitty flags 7: `\x1b[>7u` (1=disambiguate + 2=report-events + 4=alternate-keys)
6. Query cell size: `\x1b[16t` → response `\x1b[6;{height};{width}t`
7. Register SIGWINCH handler (Unix) for resize → call `onResize()`

**Stop sequence**: `\x1b[<u` (pop Kitty) + `\x1b[?2004l` (disable paste) + restore saved state

---

## 3. Rendering Engine

**Constants**:
```
CURSOR_MARKER = "\x1b_pi:c\x07"   // APC sequence, zero-width, stripped before write
LINE_RESET = "\x1b[0m\x1b]8;;\x07" // SGR reset + hyperlink reset
SYNC_START = "\x1b[?2026h"
SYNC_END = "\x1b[?2026l"
```

**State**: `previousLines: string[]`, `maxLinesRendered: int`, `pendingRender: bool`

**Request coalescing**: `requestRender()` sets `pendingRender=true`, schedules via `nextTick()`. Multiple calls before tick = single render.

```
doRender():
  newLines = container.render(terminal.columns)
  newLines = compositeOverlays(newLines, terminal.columns, terminal.rows)
  cursorPos = extractAndStripCursorMarker(newLines)  // Find CURSOR_MARKER, remove it
  newLines = applyLineResets(newLines)               // Append LINE_RESET (skip image lines)

  if !previousLines.length or widthChanged:
    fullRender(newLines); return

  // Find change bounds (string equality, not hash - marginal gains for typical lines)
  firstChanged, lastChanged = -1, -1
  for i in 0..max(newLines.length, previousLines.length):
    if newLines[i] != previousLines[i]:
      if firstChanged == -1: firstChanged = i
      lastChanged = i

  if firstChanged == -1:
    positionHardwareCursor(cursorPos); return  // No changes

  // Viewport check: changes above visible area → full redraw
  viewportTop = max(0, maxLinesRendered - terminal.rows)
  if firstChanged < viewportTop:
    fullRender(newLines); return

  // Build incremental update buffer
  buf = SYNC_START + moveTo(firstChanged)
  for i in firstChanged..lastChanged+1:
    if i > firstChanged: buf += "\r\n"
    buf += "\x1b[2K" + (newLines[i] ?? "")

  // Clear removed lines if content shrunk
  for i in newLines.length..previousLines.length:
    buf += "\r\n\x1b[2K"
  if previousLines.length > newLines.length:
    buf += "\x1b[{previousLines.length - newLines.length}A"

  buf += SYNC_END
  terminal.write(buf)
  previousLines = newLines
  maxLinesRendered = max(maxLinesRendered, newLines.length)
  positionHardwareCursor(cursorPos)
```

**Image line detection**: Skip LINE_RESET for lines containing `\x1b_G` (Kitty) or `\x1b]1337;File=` (iTerm2) - binary corruption risk.

---

## 4. Component System

```
Component {
  render(width: int) -> string[]  // Lines to display (may include ANSI)
  handleInput?(data: string)      // Keyboard/paste handler
  invalidate()                    // Clear cached render, propagate to children
  wantsKeyRelease?: bool          // Opt-in for Kitty key release events
}

Focusable extends Component {
  focused: bool                   // Set by TUI.setFocus()
  // When focused=true, emit CURSOR_MARKER at cursor position for IME
}

Container implements Component {
  children: Component[]
  render(width) -> children.flatMap(c => c.render(width))
  invalidate() -> children.forEach(c => c.invalidate())
  addChild(c), removeChild(c), clear()
}
```

**Caching pattern**: Components cache `render()` output. Invalidation triggers:
- Explicit `invalidate()` call
- Width change (detected by comparing `width` param)
- Background function change (sample `bgFn?.toString()` to detect closure changes)

**Focus management**: TUI maintains focus stack. `setFocus(component)` sets `focused=false` on previous, `focused=true` on new. Input routes to focused component first.

**Built-in components**:

| Component | Lines | Key Implementation Details |
|-----------|-------|----------------------------|
| Text | ~100 | `wrapTextWithAnsi(text, width)`, optional background/padding |
| Box | ~130 | Child container + padding, caches rendered output |
| Editor | ~1900 | See §5. Multi-line, word wrap, kill ring, undo, autocomplete |
| Input | ~350 | Single-line, horizontal scroll, grapheme-aware cursor |
| SelectList | ~190 | Scrolling viewport, wrap-around nav, theme support |
| Loader | ~60 | Braille spinner `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`, 80ms frame interval |
| Markdown | ~650 | Uses `marked` parser, syntax highlighting, table rendering |
| Image | ~90 | Auto-detect Kitty/iTerm2, calculate rows from pixel dimensions |

---

## 5. Text Editor

**Core state**: `{ lines: string[], cursorLine: int, cursorCol: int }` (logical positions)

**Auxiliary**: undoStack (deep clones), killRing (string[], max ~100), history (string[]), pasteMarkers (Map<id, content>), autocompleteState

**Keybindings**:
| Key | Action | Key | Action |
|-----|--------|-----|--------|
| `Ctrl+A/E` | line start/end | `Ctrl+K/U` | kill to end/start |
| `Ctrl+W` | kill word back | `Alt+D` | kill word fwd |
| `Ctrl+Y` | yank | `Alt+Y` | yank-pop (cycle) |
| `Ctrl+Z` | undo | `Alt+←/→` | word nav |
| `↑/↓` | line or history | `Enter` | submit |
| `Shift+Enter` | newline | `Tab` | autocomplete |

**Kill ring**: Consecutive kills accumulate (`Ctrl+K` twice = both segments in one entry). `add(text, prepend)` appends/prepends to last entry if `lastAction=="kill"`, else pushes new. `yankPop()` rotates ring.

**Undo coalescing** (fish-style): Word chars coalesce; whitespace captures word+space as unit; non-typing = immediate snapshot.

**Word wrap**: Build `TextChunk[]` mapping visual→logical lines. Token-based: split on whitespace, greedily fit, break graphemes if token > width.

**Large paste**: >10 lines or >1000 chars → compress to `[paste #{id} +{n} lines]` marker, expand on submit.

**Cursor render**: `before + CURSOR_MARKER + "\x1b[7m" + grapheme + "\x1b[27m" + rest`

---

## 6. Input Handling

**StdinBuffer** buffers raw stdin, emits discrete sequences:

```
process(data):
  buffer += convertHighBytes(data)  // 0x80-0x9F → ESC sequences for legacy terms

  // Bracketed paste: buffer until end marker
  if inPaste or buffer.contains("\x1b[200~"):
    if (endIdx = buffer.indexOf("\x1b[201~")) != -1:
      emit("paste", extractBetween(buffer, "\x1b[200~", "\x1b[201~"))
      buffer = buffer[endIdx + 6:]
    else: inPaste = true; return

  // Parse sequences
  while buffer.notEmpty:
    if (seq = tryParseComplete(buffer)):  // CSI, OSC, DCS, APC, SS3
      emit("data", seq.value); buffer = buffer[seq.length:]
    else if buffer[0] == "\x1b":
      if timedOut(10ms): emit("data", "\x1b"); buffer = buffer[1:]
      else: break  // Wait for more data
    else:
      emit("data", buffer[0]); buffer = buffer[1:]
```

**Sequence completeness**: CSI ends at `@-~`, OSC/DCS/APC end at `\x07` or `\x1b\\`, SS3 is `\x1bO` + single char.

**Kitty CSI-u format**: `\x1b[{codepoint};{modifiers}u` or `\x1b[{codepoint};{modifiers}:{eventType}u`
- Modifiers: 1-indexed bitmask (1=shift, 2=alt, 4=ctrl, 8=super)
- Event types: 1=press, 2=repeat, 3=release

**Legacy key patterns**:
| Key | Sequences |
|-----|-----------|
| `Ctrl+A-Z` | `\x01`-`\x1a` |
| `↑↓←→` | `\x1b[A/B/D/C` or `\x1bOA/B/D/C` |
| `Shift+↑` | `\x1b[1;2A` |
| `F1-F4` | `\x1bOP`-`\x1bOS` |
| `F5-F12` | `\x1b[15~`-`\x1b[24~` |

**Key release**: `isKeyRelease(data)` checks for `:3u` suffix in Kitty format.

---

## 7. Width Calculation

```
visibleWidth(str) -> int:
  if !str: return 0
  if /^[\x20-\x7e]*$/.test(str): return str.length  // ASCII fast path

  if (cached = widthCache.get(str)): return cached  // FIFO cache, 512 entries

  clean = str
    .replace("\t", "   ")
    .replace(/\x1b\[[0-9;]*[mGKHJsu]/g, "")        // SGR, cursor
    .replace(/\x1b\]8;;[^\x07]*\x07[^\x1b]*/g, "") // Hyperlinks (OSC 8)
    .replace(/\x1b_[^\x07]*\x07/g, "")             // APC (cursor marker)

  width = 0
  for seg in Intl.Segmenter(clean, {granularity: "grapheme"}):
    if /^\p{M}+$/u.test(seg.segment): continue     // Zero-width (combining marks)
    if isRgiEmoji(seg.segment): width += 2         // Pre-filter: has ZWJ or VS16
    else: width += eastAsianWidth(seg.segment.codePointAt(0))

  widthCache.set(str, width)
  return width
```

**East Asian Width** (UAX #11): Wide (W) and Fullwidth (F) = 2 columns, all others = 1. Common wide ranges: CJK `\u4E00-\u9FFF`, Hangul `\uAC00-\uD7AF`, fullwidth `\uFF00-\uFFEF`.

**sliceByColumn(line, startCol, length, strict?)**: Extract segment preserving ANSI codes. If `strict=true` and wide char straddles boundary, replace with space (prevents half-char rendering).

**AnsiCodeTracker**: State machine tracking active SGR (bold, fg, bg, underline style). Used by `wrapTextWithAnsi()` to emit correct reset/restore sequences at line breaks. Tracks: intensity, italic, underline (style + color), strikethrough, inverse, fg (type + value), bg (type + value).

---

## 8. ANSI Escape Sequences

**Cursor**: `\x1b[{n}A/B/C/D` (up/down/right/left), `\x1b[{n}G` (column), `\x1b[{r};{c}H` (position), `\x1b[?25h/l` (show/hide)

**Clear**: `\x1b[K` (to EOL), `\x1b[2K` (line), `\x1b[J` (to EOS), `\x1b[2J` (screen), `\x1b[3J` (scrollback)

**SGR** (`\x1b[{n}m`): 0=reset, 1=bold, 2=dim, 3=italic, 4=underline, 7=inverse, 9=strike, 22-29=reset attrs
- Colors: 30-37/40-47 (fg/bg), 90-97/100-107 (bright), 39/49 (default)
- Extended: `38;5;{n}` (256), `38;2;{r};{g};{b}` (RGB), same for 48=bg
- Underline: `4:0-5` (none/single/double/curly/dotted/dashed), `58;5;{n}` or `58;2;r;g;b` (color)

**OSC**: `\x1b]0;{title}\x07` (title), `\x1b]8;;{url}\x07{text}\x1b]8;;\x07` (hyperlink), `\x1b]52;c;{base64}\x07` (clipboard)

**DEC modes**: `\x1b[?2004h/l` (bracketed paste), `\x1b[?2026h/l` (sync output), `\x1b[?1049h/l` (alt screen)

**APC**: `\x1b_{payload}\x07` - used for cursor marker `\x1b_pi:c\x07`

**Kitty graphics**: `\x1b_Ga=T,f=100,s={w},v={h};{base64}\x1b\\` (transmission keys: a=action, f=format, s/v=size, m=more chunks)

**iTerm2 images**: `\x1b]1337;File=inline=1;width={w};height={h};preserveAspectRatio=1:{base64}\x07`

---

## 9. Overlay System

```
OverlayOptions {
  width: int | "%"      // Absolute or percentage of terminal
  minWidth: int
  maxHeight: int | "%"
  anchor: "center" | "top-left" | "top-right" | "bottom-left" |
          "bottom-right" | "top-center" | "bottom-center" | "left-center" | "right-center"
  row: int | "%"        // Explicit position (overrides anchor vertical)
  col: int | "%"        // Explicit position (overrides anchor horizontal)
  offsetX: int          // Offset from anchor position
  offsetY: int
  margin: int | {top, right, bottom, left}  // Constrains positioning
  visible: fn(termWidth, termHeight) -> bool
}
```

**Compositing algorithm**:
1. Resolve layout (width, row, col) from options + terminal dimensions
2. Render overlay component at resolved width
3. Extend base content if overlay extends past it
4. For each overlay line: `compositeLineAt(base, overlay, col, width)`

```
compositeLineAt(base, overlay, col, overlayWidth):
  before = sliceByColumn(base, 0, col, strict=true)        // Strict: space for half wide chars
  after = sliceByColumn(base, col + overlayWidth, ∞, strict=true)
  beforePad = " ".repeat(col - visibleWidth(before))
  overlayPad = " ".repeat(overlayWidth - visibleWidth(overlay))
  return before + beforePad + RESET + overlay + overlayPad + RESET + after
```

**Focus management**: Overlay stack tracks `preFocus` for each entry. `showOverlay()` returns handle with `hide()` and `setHidden(bool)`. On hide, focus restores to `preFocus` or next visible overlay.

**Image line skip**: Lines containing Kitty/iTerm2 image sequences are not composited (binary corruption risk).

---

## 10. AI Provider Abstraction

**Message types**:
```
UserMessage     { role: "user", content: string | Content[], timestamp }
AssistantMessage { role: "assistant", content: Content[], usage, stopReason, model, provider, timestamp }
ToolResultMessage { role: "toolResult", toolCallId, toolName, content: Content[], isError }

Content = TextContent | ImageContent | ThinkingContent | ToolCall
```

**Streaming events**: `start`, `text_start/delta/end`, `thinking_start/delta/end`, `toolcall_start/delta/end`, `done`, `error`

**Model definition**:
```
Model { id, name, api, provider, baseUrl, reasoning: bool, input: ("text"|"image")[],
        cost: {input, output, cacheRead, cacheWrite}, contextWindow, maxTokens }
```

**Provider implementations**:
| Provider | API Key Env | Notes |
|----------|-------------|-------|
| Anthropic | `ANTHROPIC_API_KEY` | OAuth stealth mode, cache control headers |
| OpenAI | `OPENAI_API_KEY` | Completions + Responses API, reasoning variants |
| Google Gemini | `GOOGLE_API_KEY` | REST, thought signatures |
| Google Vertex | ADC | `gcloud auth application-default login` |
| AWS Bedrock | AWS creds | Region from `AWS_REGION`, prompt caching |
| OpenRouter | `OPENROUTER_API_KEY` | OpenAI-compatible with provider routing |

**Thinking levels**: `minimal | low | medium | high | xhigh` → provider-specific mapping:
- Anthropic: `budget_tokens` (1k → 128k)
- OpenAI: `reasoning_effort` (low/medium/high)
- Google: `thinkingConfig.thinkingBudget`

**Streaming JSON parser**: For tool call arguments, parse partial JSON incrementally to enable early UI updates.

**Cache control**: Anthropic prompt caching via `cache_control: {type: "ephemeral"}` on system/messages. Reduces cost 90% for cached tokens.

---

## 11. Extension System

**Extension entry**: `export default (api: ExtensionAPI) => { ... }` - called once at load time.

**ExtensionAPI**:
```
on(event, handler)              // Subscribe to lifecycle events
registerTool(definition)        // Add tool for LLM
registerCommand(name, options)  // Add /command
registerShortcut(key, options)  // Add keyboard shortcut
sendMessage(msg, opts?)         // Queue message to agent
appendEntry(customType, data?)  // Add custom session entry
setActiveTools(names[])         // Filter available tools
setModel(model) / setThinkingLevel(level)
setSessionName(name) / setLabel(entryId, label)
```

**Events** (handler returns can modify/cancel):
| Event | Payload | Returns |
|-------|---------|---------|
| `session_start` | session | - |
| `before_agent_start` | - | `{systemPrompt?}` to modify |
| `context` | messages, tools | `{messages?}` to modify |
| `tool_call` | name, args | `{block: true}` to prevent |
| `tool_result` | name, result | `{content?}` to modify |
| `input` | content | `{content?}` to transform |
| `agent_end` | result, usage | - |
| `session_compact` | summary | - |

**Tool definition**:
```
{ name, label, description, parameters: JSONSchema,
  execute(id, params, onUpdate, ctx, signal?) -> {content, isError?},
  renderCall?(args, theme) -> Component,
  renderResult?(result, opts, theme) -> Component }
```

**Extension loading**: `~/.config/claude/extensions/`, project `.claude/extensions/`, package.json `"claude": {"extensions": [...]}`. Load order: global → project. Error isolation: handler errors logged, don't crash host.

**Inter-extension EventBus**: `api.eventBus.emit(channel, data)`, `api.eventBus.on(channel, handler)` for extension communication.

---

## 12. Session Management

**File format**: NDJSON with header line:
```
{"version":3,"id":"uuid","parentId?":"uuid","leafId":"uuid","name?":"string"}
{"type":"user","id":"uuid","parentId":"uuid","content":"...","timestamp":1234567890}
{"type":"assistant","id":"uuid","parentId":"uuid","content":[...],"usage":{...}}
```

**Entry types**:
- `user` - content, images?, timestamp
- `assistant` - content[], usage, stopReason, model, provider
- `toolResult` - toolCallId, toolName, content[], isError
- `compaction` - summary, compactedEntryIds[], tokensSaved
- `branchSummary` - summary, branchLeafId (for navigating away from branch)
- `custom` - customType, data (extension state)
- `label` - entryId, label (bookmarks)
- `session_info` - name (session naming)

**Tree structure**: DAG via `parentId` references. `leafId` in header tracks current position. Fork creates new session file with `parentId` pointing to fork point.

**Branch navigation**: Find common ancestor, summarize abandoned branch entries, update leaf pointer, fire `session_tree` event.

**Context compaction**: When tokens exceed threshold (e.g., 80% of context window):
1. Find valid cut point (complete assistant turn, not mid-tool-use)
2. Estimate tokens (chars/4 heuristic)
3. Generate summary via LLM
4. Create `compaction` entry, entries before become inaccessible
5. Can iterate: multiple compaction entries in history

**Crash recovery**: Append-only format survives crashes. On load, skip malformed lines, reconstruct tree from valid entries.

**Version migration**: V1→V2 added tree structure, V2→V3 renamed roles. Migrations run on session load.

---

## Implementation Phases

### Library Phases (Complete ✅)

| Phase | Components | Key Milestones |
|-------|------------|----------------|
| 1. Terminal | Terminal interface, raw mode, Kitty protocol | Echo typed chars, handle Ctrl+C |
| 2. Rendering | visibleWidth, graphemes, differential, sync output | Render "Hello" without flicker |
| 3. Components | Component/Container, Text, focus, requestRender | Scrollable text display |
| 4. Editor | Cursor nav, kill ring, undo, history, paste, wrap | Functional multiline input |
| 5. Overlays | Stack, anchoring, compositing, focus restore | Modal dialog over content |
| 6. AI | Message types, streaming events (types only) | Event stream interface |
| 7. Extensions | Loading, events, tool/command registration | Custom /command works |
| 8. Sessions | NDJSON, tree, compaction, crash recovery | Resume after restart |

### Application Phases (TODO)

| Phase | Components | Dependencies | Key Milestones |
|-------|------------|--------------|----------------|
| 9. CLI | Argument parsing, subcommands, config | [zig-clap](https://github.com/Hejsil/zig-clap) | `god-agent --help` works |
| 10. Agent | Agent loop, tool execution, queues | [ai-zig](https://github.com/evmts/ai-zig) | Tool calls execute |
| 11. Interactive | Chat UI, header, status, commands | god-tui lib | Full TUI running |
| 12. Integration | E2E testing, polish, docs | All above | Production ready |

**Deep-dive spec**: `issues/god-tui/13-application-layer.md`

---

## External Dependencies

| Package | Purpose | URL |
|---------|---------|-----|
| zig-clap | CLI argument parsing | https://github.com/Hejsil/zig-clap |
| ai-zig | LLM providers (30+ supported) | https://github.com/evmts/ai-zig |

---

## Reference: pi-mono/packages/tui

| File | LOC | Purpose |
|------|-----|---------|
| tui.ts | 1062 | TUI class, rendering, overlays |
| keys.ts | 1133 | Key parsing, Kitty protocol |
| utils.ts | 889 | Width, ANSI tracking, wrap |
| terminal.ts | 232 | Terminal abstraction |
| stdin-buffer.ts | 386 | Input sequence parsing |
| components/editor.ts | 1921 | Full text editor |
| components/markdown.ts | 655 | Markdown rendering |

**Total**: ~9k LOC (TUI framework) + ~15k LOC (coding agent app)
