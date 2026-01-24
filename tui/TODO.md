# TUI Implementation TODO

## Architecture Decision

**Rendering**: Keep vaxis (already integrated)
**Logic Components**: Port from god-tui (already Zig, tested)
**UI Patterns**: Reference codex for features god-tui lacks

---

## ✅ Completed

### Core Features
- [x] Multi-line editor with word wrap, cursor navigation
- [x] Kill ring (Ctrl+K/U/W/Y)
- [x] Undo stack with coalescing
- [x] Input history (Up/Down to recall)
- [x] Markdown rendering (headings, code blocks, links, lists, blockquotes)
- [x] SQLite persistence for chat history
- [x] Multiple sessions/tabs (Ctrl+B prefix mode)

### AI Integration
- [x] Anthropic API integration via curl
- [x] Tool registry with builtin tools (bash, read_file, write_file, edit_file, glob, grep, list_dir)
- [x] Automatic tool execution loop
- [x] Graceful fallback to demo mode without API key

### Slash Commands
- [x] /help - Show keybinding help
- [x] /clear - Clear chat history
- [x] /new - Start new conversation
- [x] /model - Show current model
- [x] /status - Show session status
- [x] /diff - Show git diff
- [x] /exit - Exit application

### Keybindings
- [x] Ctrl+E - Open $EDITOR for long messages
- [x] Ctrl+L - Redraw screen
- [x] Ctrl+Z - Suspend to shell
- [x] Ctrl+C - Clear input / double-press to exit
- [x] Ctrl+D - Exit when input empty
- [x] Ctrl+B prefix mode for tabs

---

## In Progress

### Streaming & Display
- [ ] Streaming text display (show response as it arrives)
  - Currently using blocking curl; need async HTTP or chunked reading
- [ ] Syntax highlighting for code blocks
  - Ref: `reference/codex/codex-rs/tui/src/render/highlight.rs`
- [ ] Shimmer animation during loading
  - Ref: `reference/codex/codex-rs/tui/src/shimmer.rs`

---

## Next Up

### Overlay System (from god-tui)
- [ ] Port overlay stack with positioning and compositing
  - Source: `src/god-tui/overlay/overlay.zig` (15 tests)
- [ ] Transcript overlay (Ctrl+T for full scrollable history)
  - Ref: `reference/codex/codex-rs/tui/src/pager_overlay.rs`

### Keyboard Handling
- [ ] Ctrl+C interrupt handling
  - Ref: `reference/codex/codex-rs/tui/src/app.rs`
- [ ] Port key parsing (Kitty CSI-u, legacy CSI, SS3)
  - Source: `src/god-tui/terminal/keys.zig` (4 tests)
- [ ] Port bracketed paste handling
  - Source: `src/god-tui/terminal/stdin_buffer.zig`
- [ ] Key hints footer
  - Ref: `reference/codex/codex-rs/tui/src/key_hint.rs`
  - Ref: `reference/codex/codex-rs/tui/src/bottom_pane/footer.rs`

---

## Backlog

### Session Management (from god-tui)
- [ ] Port NDJSON session persistence
  - Source: `src/god-tui/session/session.zig` (6 tests)
- [ ] Resume/Fork sessions
  - Ref: `reference/codex/codex-rs/tui/src/resume_picker.rs`

### Components (from god-tui)
- [ ] Port loader/spinner component
  - Source: `src/god-tui/components/loader.zig`
- [ ] Port box container (borders)
  - Source: `src/god-tui/components/box.zig`
- [ ] Port text component (wrap/truncate)
  - Source: `src/god-tui/components/text.zig`

### Rendering Utilities (from god-tui)
- [ ] Port unicode width calculation
  - Source: `src/god-tui/rendering/width.zig` (14 tests)

### Status/Info
- [ ] Token usage display (`/status`)
  - Ref: `reference/codex/codex-rs/tui/src/status/`
- [ ] Git diff view (`/diff`)
  - Ref: `reference/codex/codex-rs/tui/src/diff_render.rs`
  - Ref: `reference/codex/codex-rs/tui/src/get_git_diff.rs`

### External Editor
- [ ] Ctrl+E to open $EDITOR
  - Ref: `reference/codex/codex-rs/tui/src/external_editor.rs`

---

## Deprioritized

### Approvals (not implementing - security theatre)
- ~~Approval dialogs for tool execution~~
  - Ref: `reference/codex/codex-rs/tui/src/bottom_pane/approval_overlay.rs`

---

## Test Reference

god-tui has 113 tests across modules:
- `editor/editor.zig` - 25 tests
- `rendering/renderer.zig` - 31 tests
- `rendering/width.zig` - 14 tests
- `overlay/overlay.zig` - 15 tests
- `components/component.zig` - 5 tests
- `session/session.zig` - 6 tests
- `terminal/keys.zig` - 4 tests
- `ai/provider.zig` - 5 tests
- `extensions/extension.zig` - 8 tests
