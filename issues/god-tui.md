# God TUI: Complete Engineering Specification

Zig-native TUI with AI integration built on **libvaxis**.

**Foundation Library**: [rockorager/libvaxis](https://github.com/rockorager/libvaxis) - Production terminal UI library in Zig
**Reference**: `reference/libvaxis/` (git submodule for AI context)
**Deep-dive specs**: `issues/god-tui/01-*.md` through `13-*.md` (~13k lines total)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION LAYER                              │
│  Agent Loop ←→ Session Manager ←→ Extension Runner ←→ Tool Execution    │
├──────────────────────────────────────────────────────────────────────────┤
│                          TUI FRAMEWORK LAYER                             │
│  Component System ←→ Window Hierarchy ←→ Event Dispatch                 │
├──────────────────────────────────────────────────────────────────────────┤
│                        LIBVAXIS LAYER (external)                         │
│  Vaxis { render(), window(), resize() } ←→ Screen/Cell ←→ Parser        │
├──────────────────────────────────────────────────────────────────────────┤
│                            TTY LAYER (libvaxis)                          │
│  PosixTty/WindowsTty + SIGWINCH + Protocol Negotiation                  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Core Principles**: Build on libvaxis primitives, leverage differential cell rendering, use libvaxis capability detection, grapheme-aware via libvaxis gwidth, component composition on Window abstraction.

---

## 2. Terminal Abstraction Layer (via libvaxis)

Libvaxis provides `Tty` (PosixTty/WindowsTty) and `Vaxis` for terminal abstraction:

```zig
// libvaxis Tty handles raw mode, signal handlers, buffered I/O
const tty = try vaxis.tty.Tty.init(.{});
defer tty.deinit();

// Vaxis is main API surface
var vx = try vaxis.Vaxis.init(allocator, .{});
defer vx.deinit(&tty);

// Properties from Vaxis
vx.screen.width   // Terminal columns
vx.screen.height  // Terminal rows
vx.caps           // Detected capabilities (kitty_keyboard, kitty_graphics, etc.)
```

**Capability Queries (automatic on init)**:
- DA1 (primary device attributes)
- CSI-u keyboard protocol
- Kitty graphics protocol
- SGR pixel mouse
- Unicode width mode 2027
- Color scheme subscription

**Control Sequences (via vaxis.ctlseqs)**:
```zig
ctlseqs.smcup           // Enter alt screen
ctlseqs.rmcup           // Exit alt screen
ctlseqs.bp_set          // Enable bracketed paste
ctlseqs.bp_reset        // Disable bracketed paste
ctlseqs.csi_u_push      // Enable Kitty keyboard (flags 31)
ctlseqs.csi_u_pop       // Disable Kitty keyboard
ctlseqs.sync_set        // Begin synchronized output
ctlseqs.sync_reset      // End synchronized output
```

**Event Loop (via vaxis.Loop)**:
```zig
var loop = try vaxis.Loop(Event).init(&tty, &vx, .{});
defer loop.deinit();

while (true) {
    const event = loop.nextEvent();
    switch (event) {
        .key_press => |key| handleKey(key),
        .winsize => |ws| vx.resize(allocator, &tty, ws),
        .paste_start, .paste_end => handlePaste(),
        // ...
    }
}
```

---

## 3. Rendering Engine (via libvaxis)

Libvaxis uses **Cell-based differential rendering** - far more efficient than line-based:

```zig
// Get root window
var win = vx.window();

// Create child windows (clipped, offset)
var content = win.child(.{ .x_off = 0, .y_off = 1, .height = .{ .limit = 10 } });
var sidebar = win.child(.{ .x_off = 40, .width = .{ .limit = 20 } });

// Write to cells directly
win.writeCell(0, 0, .{
    .char = .{ .grapheme = "H", .width = 1 },
    .style = .{ .fg = .{ .rgb = .{255, 0, 0} }, .bold = true },
});

// Or use print for text with wrapping
_ = try win.print(&.{
    .{ .str = "Hello ", .style = .{ .fg = .blue } },
    .{ .str = "World", .style = .{ .bold = true } },
}, .{});

// Render diffs to terminal (automatic sync protocol)
try vx.render(&tty);
```

**Cell Structure** (libvaxis):
```zig
Cell {
    char: Character,        // grapheme + width
    style: Style,           // fg, bg, underline, bold, italic, etc.
    link: Hyperlink,        // OSC-8 hyperlinks
    image: ?Image.Placement // Kitty graphics
}
```

**Differential Rendering** (handled by libvaxis):
1. Compare current Screen vs InternalScreen (last frame)
2. Only emit escape sequences for changed cells
3. Optimize cursor movement (relative jumps)
4. Automatic synchronized output wrapping

**Style System**:
```zig
Style {
    fg: Color,              // .default | .index(u8) | .rgb([3]u8)
    bg: Color,
    ul: Color,              // underline color
    ul_style: UnderlineStyle, // none/single/double/curly/dotted/dashed
    bold: bool,
    italic: bool,
    // ... more attributes
}
```

**Image Support** (Kitty protocol via libvaxis):
```zig
const img = try vx.loadImage(allocator, &tty, .{ .path = "image.png" });
cell.image = .{ .img_id = img.id, .scale = .contain };
```

---

## 4. Component System

Build components on libvaxis **Window** abstraction:

```zig
const Component = struct {
    /// Render into the given window
    fn render(self: *@This(), win: vaxis.Window) void;

    /// Handle input event, return true if consumed
    fn handleEvent(self: *@This(), event: vaxis.Event) bool;

    /// Get minimum size requirements
    fn getSize(self: *@This()) struct { width: u16, height: u16 };
};

// Container pattern - compose child windows
fn renderContainer(win: vaxis.Window, children: []Component) void {
    var y_offset: u16 = 0;
    for (children) |child| {
        const size = child.getSize();
        const child_win = win.child(.{ .y_off = y_offset, .height = .{ .limit = size.height } });
        child.render(child_win);
        y_offset += size.height;
    }
}
```

**Window Features** (libvaxis built-in):
```zig
win.child(opts)              // Create clipped child window
win.print(segments, opts)    // Rich text with wrapping
win.writeCell(x, y, cell)    // Direct cell access
win.fill(.{ .char = .{ .grapheme = " " } })  // Clear area
win.drawBorder(.{ .style = .single_rounded })  // Box drawing
```

**Focus Management**: Application-level via event routing:
```zig
fn handleEvent(event: vaxis.Event) void {
    // Route to focused component first
    if (focused_component.handleEvent(event)) return;
    // Then to parent containers
    // ...
}
```

**Built-in Components** (application layer - `src/god-tui/src/components/`):

| Component | Description |
|-----------|-------------|
| Text | Word wrap via libvaxis print with segments |
| Box | Child window with border via `win.drawBorder()` |
| Editor | Multi-line, kill ring, undo (see §5) |
| Input | Single-line with horizontal scroll |
| SelectList | Scrolling list with viewport management |
| Loader | Braille spinner `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` |
| Markdown | Syntax highlight via Cell styles |
| Image | Kitty protocol via `vx.loadImage()` |

---

## 5. Text Editor

**Core state** (Zig):
```zig
const Editor = struct {
    lines: std.ArrayList([]u8),
    cursor_line: usize,
    cursor_col: usize,       // Grapheme index, not byte
    undo_stack: UndoStack,
    kill_ring: KillRing,
    history: History,
};
```

**Keybindings** (via libvaxis Key matching):
| Key | Action | Key | Action |
|-----|--------|-----|--------|
| `Ctrl+A/E` | line start/end | `Ctrl+K/U` | kill to end/start |
| `Ctrl+W` | kill word back | `Alt+D` | kill word fwd |
| `Ctrl+Y` | yank | `Alt+Y` | yank-pop (cycle) |
| `Ctrl+Z` | undo | `Alt+←/→` | word nav |
| `↑/↓` | line or history | `Enter` | submit |
| `Shift+Enter` | newline | `Tab` | autocomplete |

**Key Matching** (libvaxis):
```zig
fn handleKey(key: vaxis.Key) void {
    if (key.matches('a', .{ .ctrl = true })) {
        moveToBOL();
    } else if (key.matches('e', .{ .ctrl = true })) {
        moveToEOL();
    } else if (key.matches(.arrow_left, .{ .alt = true })) {
        moveWordBack();
    }
    // ...
}
```

**Kill ring**: Consecutive kills accumulate. `add(text, prepend)` appends/prepends to last if `lastAction==.kill`, else pushes new.

**Undo coalescing** (fish-style): Word chars coalesce; whitespace captures word+space as unit; non-typing = immediate snapshot.

**Cursor rendering** (via libvaxis Cell):
```zig
// Cursor cell uses reverse video
win.writeCell(cursor_x, cursor_y, .{
    .char = char_under_cursor,
    .style = .{ .reverse = true },
});
```

**Width calculation** (via libvaxis gwidth):
```zig
const width = vaxis.gwidth.gwidth(grapheme, vx.caps.unicode);
```

---

## 6. Input Handling (via libvaxis)

Libvaxis provides **Parser** and **Loop** for complete input handling:

```zig
// Event union from libvaxis
const Event = union(enum) {
    key_press: Key,
    key_release: Key,
    mouse: Mouse,
    paste_start,
    paste_end,
    paste: []const u8,      // OSC-52 clipboard
    focus_in,
    focus_out,
    winsize: Winsize,
    // Capability detection events
    cap_kitty_keyboard,
    cap_kitty_graphics,
    cap_rgb,
    cap_unicode,
    // ...
};
```

**Key Structure** (libvaxis):
```zig
const Key = struct {
    codepoint: u21,         // Unicode codepoint
    text: ?[]const u8,      // Text if available
    mods: Mods,             // Modifier state

    pub fn matches(self: Key, cp: anytype, mods: Mods) bool;
};

const Mods = struct {
    shift: bool,
    alt: bool,
    ctrl: bool,
    super: bool,
    // Lock keys
    caps_lock: bool,
    num_lock: bool,
};
```

**Parser State Machine** (libvaxis handles):
- CSI sequences (cursor, function keys, Kitty enhanced)
- OSC sequences (clipboard, colors, notifications)
- SS3 sequences (function keys)
- Kitty CSI-u format with full modifier/event support
- Bracketed paste detection

**Mouse Events**:
```zig
const Mouse = struct {
    col: u16,
    row: u16,
    button: Button,
    mods: Mods,
    type: Type,  // press, release, motion, drag
};

// Enable mouse
vx.setMouseMode(&tty, true);
```

**Example Event Loop**:
```zig
while (true) {
    const event = loop.nextEvent();
    switch (event) {
        .key_press => |key| {
            if (key.matches('c', .{ .ctrl = true })) {
                break;  // Ctrl+C to exit
            }
            editor.handleKey(key);
        },
        .paste => |text| editor.insertText(text),
        .winsize => |ws| vx.resize(allocator, &tty, ws),
        else => {},
    }
    try vx.render(&tty);
}
```

---

## 7. Width Calculation (via libvaxis gwidth)

Libvaxis provides comprehensive Unicode width calculation in `gwidth.zig`:

```zig
// Three calculation methods available
const Method = enum {
    unicode,    // Full grapheme cluster width + emoji
    wcwidth,    // Simpler, faster, POSIX-compatible
    no_zwj,     // Split on ZWJ (for specific use cases)
};

// Get width of a grapheme cluster
const width = vaxis.gwidth.gwidth(grapheme_str, vx.caps.unicode);
```

**Character Structure** (libvaxis):
```zig
const Character = struct {
    grapheme: []const u8,  // UTF-8 encoded grapheme cluster
    width: u8,             // 0 = calculate at render time
};
```

**Unicode Method Details** (libvaxis gwidth):
- Iterates grapheme clusters (not codepoints)
- Emoji variation selectors: `FE0F` → force width 2
- Text variation selectors: `FE0E` → keep width 1
- Regional indicator pairs (flags)
- Zero-width marks and combining chars
- Uses UAX #11 East Asian Width for CJK

**East Asian Width** (handled by libvaxis):
- Wide (W) and Fullwidth (F) = 2 columns
- CJK: `U+4E00-U+9FFF`, Hangul: `U+AC00-U+D7AF`
- Fullwidth forms: `U+FF00-U+FFEF`

**Print with Wrapping** (libvaxis handles width automatically):
```zig
// Print automatically handles width, wrapping, ANSI
_ = try win.print(&.{
    .{ .str = "Wide: 世界", .style = .{} },
}, .{ .wrap = .word });
```

**Style Tracking** (via libvaxis Cell styles):
```zig
// No manual ANSI tracking needed - styles are per-cell
win.writeCell(x, y, .{
    .char = .{ .grapheme = "A" },
    .style = .{ .bold = true, .fg = .{ .rgb = .{255, 0, 0} } },
});
```

---

## 8. ANSI Escape Sequences (via libvaxis ctlseqs)

Libvaxis abstracts escape sequences via `ctlseqs.zig` constants:

```zig
const ctlseqs = vaxis.ctlseqs;

// Cursor
ctlseqs.hide_cursor          // CSI ? 25 l
ctlseqs.show_cursor          // CSI ? 25 h
ctlseqs.home                 // CSI H

// Screen modes
ctlseqs.smcup                // Enter alt screen (CSI ? 1049 h)
ctlseqs.rmcup                // Exit alt screen (CSI ? 1049 l)
ctlseqs.sync_set             // Begin sync (CSI ? 2026 h)
ctlseqs.sync_reset           // End sync (CSI ? 2026 l)
ctlseqs.bp_set               // Bracketed paste on
ctlseqs.bp_reset             // Bracketed paste off

// Kitty keyboard
ctlseqs.csi_u_push           // Enable (flags 31)
ctlseqs.csi_u_pop            // Disable
ctlseqs.csi_u_query          // Query support

// Mouse
ctlseqs.mouse_set            // Enable SGR mouse
ctlseqs.mouse_reset          // Disable mouse
```

**Style via Cell** (not raw ANSI):
```zig
// libvaxis handles SGR generation during render()
Cell {
    .style = .{
        .fg = .{ .rgb = .{255, 0, 0} },  // True color
        .bg = .{ .index = 240 },          // 256-color
        .bold = true,
        .italic = true,
        .underline = .curly,
        .ul_color = .{ .rgb = .{255, 255, 0} },
    }
}
```

**Color Types** (libvaxis):
```zig
const Color = union(enum) {
    default,
    index: u8,              // 256-color palette
    rgb: [3]u8,            // True color
};
```

**Hyperlinks** (via Cell.link):
```zig
cell.link = .{ .uri = "https://example.com", .params = "id=link1" };
```

**Kitty Graphics** (via libvaxis Image):
```zig
const img = try vx.loadImage(allocator, &tty, .{ .path = "img.png" });
try vx.transmitImage(&tty, img, .png);
cell.image = .{ .img_id = img.id };
```

---

## 9. Overlay System

Use libvaxis **Window hierarchy** for overlays:

```zig
const Overlay = struct {
    x: u16,
    y: u16,
    width: u16,
    height: u16,
    component: *Component,
    pre_focus: ?*Component,
};

var overlay_stack: std.ArrayList(Overlay);

fn renderWithOverlays(vx: *vaxis.Vaxis) void {
    // Base content
    var base_win = vx.window();
    renderBaseContent(base_win);

    // Overlays render on top (later windows overwrite)
    for (overlay_stack.items) |overlay| {
        const win = base_win.child(.{
            .x_off = overlay.x,
            .y_off = overlay.y,
            .width = .{ .limit = overlay.width },
            .height = .{ .limit = overlay.height },
        });
        overlay.component.render(win);
    }
}
```

**Anchor Positioning** (application layer):
```zig
const Anchor = enum {
    center,
    top_left, top_center, top_right,
    bottom_left, bottom_center, bottom_right,
    left_center, right_center,
};

fn resolvePosition(anchor: Anchor, overlay_size: Size, screen_size: Size) Position {
    return switch (anchor) {
        .center => .{
            .x = (screen_size.width - overlay_size.width) / 2,
            .y = (screen_size.height - overlay_size.height) / 2,
        },
        .top_left => .{ .x = 0, .y = 0 },
        // ...
    };
}
```

**Focus Management**:
```zig
fn showOverlay(component: *Component) *Overlay {
    const overlay = Overlay{
        .component = component,
        .pre_focus = focused_component,
        // ...
    };
    overlay_stack.append(overlay);
    focused_component = component;
    return &overlay_stack.items[overlay_stack.items.len - 1];
}

fn hideOverlay(overlay: *Overlay) void {
    // Restore focus to pre_focus or next visible overlay
    focused_component = overlay.pre_focus orelse findNextFocusable();
    // Remove from stack...
}
```

**Borders** (via libvaxis):
```zig
var overlay_win = base.child(.{ .x_off = 10, .y_off = 5, .width = .{ .limit = 40 } });
overlay_win.drawBorder(.{ .style = .double, .where = .all });
var content = overlay_win.child(.{ .x_off = 1, .y_off = 1 });  // Inside border
```

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

### Library Phases (via libvaxis ✅)

Libvaxis provides phases 1-5 out of the box:

| Phase | libvaxis Coverage | Notes |
|-------|-------------------|-------|
| 1. Terminal | ✅ `Tty`, `Vaxis` | Raw mode, signals, protocols |
| 2. Rendering | ✅ `Screen`, `Cell`, `render()` | Differential cell rendering |
| 3. Components | ✅ `Window`, borders | Build app components on Window |
| 4. Editor | ⚙️ Application layer | Use libvaxis Key, gwidth |
| 5. Overlays | ✅ Window.child() | Compositing via window hierarchy |
| 6. AI | ⚙️ Application layer | Types only |
| 7. Extensions | ⚙️ Application layer | Event hooks |
| 8. Sessions | ⚙️ Application layer | NDJSON persistence |

### Application Phases (TODO)

| Phase | Components | Dependencies | Key Milestones |
|-------|------------|--------------|----------------|
| 9. CLI | Argument parsing, subcommands, config | [zig-clap](https://github.com/Hejsil/zig-clap) | `god-agent --help` works |
| 10. Agent | Agent loop, tool execution, queues | [ai-zig](https://github.com/evmts/ai-zig) | Tool calls execute |
| 11. Interactive | Chat UI, header, status, commands | libvaxis + components | Full TUI running |
| 12. Integration | E2E testing, polish, docs | All above | Production ready |

**Deep-dive spec**: `issues/god-tui/13-application-layer.md`

---

## External Dependencies

| Package | Purpose | URL |
|---------|---------|-----|
| libvaxis | TUI framework (terminal, rendering, input) | https://github.com/rockorager/libvaxis |
| zig-clap | CLI argument parsing | https://github.com/Hejsil/zig-clap |
| ai-zig | LLM providers (30+ supported) | https://github.com/evmts/ai-zig |

---

## Reference: libvaxis

Key files in `reference/libvaxis/src/`:

| File | Purpose |
|------|---------|
| Vaxis.zig | Main API: init, render, window, resize, query |
| Cell.zig | Character + Style + Link + Image |
| Screen.zig | 2D grid of Cells |
| Window.zig | Drawing surface with clipping/offset |
| Parser.zig | Escape sequence state machine |
| Loop.zig | Event loop with threaded input |
| tty.zig | Platform TTY abstraction |
| gwidth.zig | Unicode width calculation |
| ctlseqs.zig | Control sequence constants |
| Key.zig | Key event with modifiers |
| Mouse.zig | Mouse event handling |
| Image.zig | Kitty graphics protocol |

**libvaxis examples**: `reference/libvaxis/examples/` for usage patterns

---

## Reference: pi-mono/packages/tui (original inspiration)

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
