# Terminal Abstraction Layer - Engineering Specification

**Status:** Draft
**Version:** 1.0
**Reference Implementation:** `pi-mono/packages/tui/src/terminal.ts`

---

## 1. Overview

The Terminal Abstraction Layer provides a minimal, unified interface for terminal I/O operations. It abstracts the complexity of raw terminal control, keyboard protocols, and cross-platform differences behind a clean API.

```
+------------------------------------------------------------------+
|                         APPLICATION                               |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                     Terminal Interface                            |
|  start() | stop() | write() | columns | rows | kittyProtocolActive|
|  moveBy() | hideCursor() | showCursor() | clearLine() | ...       |
+------------------------------------------------------------------+
                              |
          +-------------------+-------------------+
          |                                       |
          v                                       v
+----------------------+              +----------------------+
|  ProcessTerminal     |              |  VirtualTerminal     |
|  (Real TTY)          |              |  (Testing)           |
+----------------------+              +----------------------+
          |                                       |
          v                                       v
+----------------------+              +----------------------+
|  process.stdin       |              |  xterm.js headless   |
|  process.stdout      |              |  (Terminal Emulator) |
+----------------------+              +----------------------+
```

---

## 2. Terminal Interface Specification

```
Interface Terminal {
    // Lifecycle
    start(onInput: Callback<string>, onResize: Callback<void>) -> void
    stop() -> void

    // Output
    write(data: string) -> void

    // Dimensions (read-only properties)
    columns: number
    rows: number

    // Protocol state
    kittyProtocolActive: boolean

    // Cursor movement (relative)
    moveBy(lines: number) -> void   // negative=up, positive=down

    // Cursor visibility
    hideCursor() -> void
    showCursor() -> void

    // Clear operations
    clearLine() -> void             // Clear current line (CSI K)
    clearFromCursor() -> void       // Clear from cursor to screen end (CSI J)
    clearScreen() -> void           // Clear entire screen + home (CSI 2J + CSI H)

    // Window operations
    setTitle(title: string) -> void // OSC 0;title BEL
}
```

---

## 3. Raw Mode Implementation

### 3.1 Enable Sequence

```
+--------------------------------------------+
| 1. Save previous raw mode state            |
| 2. Enable raw mode: setRawMode(true)       |
| 3. Set encoding to UTF-8                   |
| 4. Resume stdin                            |
| 5. Enable bracketed paste mode             |
| 6. Attach resize handler                   |
| 7. Force SIGWINCH (refresh dimensions)     |
| 8. Query + enable Kitty keyboard protocol  |
+--------------------------------------------+
```

**Escape Sequences on Start:**
```
\x1b[?2004h     Enable bracketed paste mode
\x1b[?u         Query Kitty keyboard protocol support
```

### 3.2 Disable Sequence

```
+--------------------------------------------+
| 1. Disable bracketed paste mode            |
| 2. Pop Kitty protocol flags (if enabled)   |
| 3. Clean up stdin buffer                   |
| 4. Remove event handlers                   |
| 5. Restore previous raw mode state         |
+--------------------------------------------+
```

**Escape Sequences on Stop:**
```
\x1b[?2004l     Disable bracketed paste mode
\x1b[<u         Pop Kitty keyboard protocol (if active)
```

### 3.3 Raw Mode Details

Raw mode bypasses the terminal's line discipline:
- Characters are available immediately (no line buffering)
- No echo of typed characters
- Control characters (Ctrl+C, Ctrl+Z) are passed as-is
- Application must handle all input processing

```
+-----------------+     +-----------------+
|  Cooked Mode    |     |   Raw Mode      |
+-----------------+     +-----------------+
| Line buffered   |     | Char-by-char    |
| Echo enabled    |     | No echo         |
| ^C = SIGINT     |     | ^C = 0x03 byte  |
| ^Z = SIGTSTP    |     | ^Z = 0x1A byte  |
+-----------------+     +-----------------+
```

---

## 4. TTY Detection and Fallback Strategies

### 4.1 TTY Check

```
func isTTY() -> boolean {
    return process.stdin.isTTY && process.stdout.isTTY
}
```

### 4.2 Fallback Behavior

```
+----------------------------+---------------------------+
|  TTY Available             |  No TTY (piped)           |
+----------------------------+---------------------------+
| Raw mode enabled           | Raw mode unavailable      |
| Interactive input          | Read from pipe            |
| ANSI escape sequences      | Strip/skip ANSI codes     |
| Kitty protocol negotiated  | Legacy mode only          |
| Dimensions from ioctl      | Default 80x24             |
+----------------------------+---------------------------+
```

### 4.3 Dimension Fallback

```
columns = process.stdout.columns ?? 80
rows = process.stdout.rows ?? 24
```

---

## 5. Signal Handling

### 5.1 SIGWINCH (Window Size Change)

```
+------------------+
|  Terminal Resize |
+------------------+
         |
         v
+------------------+
|  SIGWINCH sent   |
|  to process      |
+------------------+
         |
         v
+------------------+
|  stdout.on       |
|  ('resize')      |
+------------------+
         |
         v
+------------------+
|  onResize()      |
|  callback fired  |
+------------------+
         |
         v
+------------------+
|  Re-render UI    |
+------------------+
```

**Implementation Note:**
On Unix systems, SIGWINCH may be lost if process is suspended. Solution:
```
// On start, force SIGWINCH to refresh stale dimensions
if (platform != "win32") {
    process.kill(process.pid, "SIGWINCH")
}
```

### 5.2 SIGINT (Ctrl+C)

In raw mode, SIGINT is NOT automatically generated. The application receives `0x03` byte and must handle it explicitly:

```
func handleInput(data: string) {
    if (data == "\x03") {
        // Ctrl+C received - application decides what to do
        // Could: exit, cancel operation, ignore, etc.
    }
}
```

### 5.3 SIGTERM / Process Exit

Clean terminal state restoration on exit:
```
process.on('exit', () => {
    terminal.stop()      // Restore terminal state
    terminal.showCursor() // Ensure cursor visible
})
```

---

## 6. Kitty Keyboard Protocol

### 6.1 Overview

The Kitty keyboard protocol provides:
- Unambiguous key encoding (no sequence collisions)
- Modifier key reporting
- Key press/repeat/release distinction
- Non-Latin keyboard layout support (base layout key)

### 6.2 Protocol Negotiation

```
+--------------------------------+
|  Application sends query       |
|  CSI ? u (\x1b[?u)             |
+--------------------------------+
              |
              v
+--------------------------------+
|  Terminal responds with        |
|  CSI ? <flags> u               |
|  (or no response if unsupported)|
+--------------------------------+
              |
              v
+--------------------------------+
|  If supported, push flags      |
|  CSI > 7 u (\x1b[>7u)          |
+--------------------------------+
```

### 6.3 Protocol Flags

```
+------+----------------------------------------+
| Flag | Description                            |
+------+----------------------------------------+
|  1   | Disambiguate escape codes              |
|  2   | Report event types (press/repeat/rel)  |
|  4   | Report alternate keys (shifted, base)  |
+------+----------------------------------------+

Combined: 1 + 2 + 4 = 7
Push command: \x1b[>7u
Pop command: \x1b[<u
```

### 6.4 CSI u Encoding Format

```
Basic:      CSI <codepoint> u
With mod:   CSI <codepoint> ; <modifier> u
With event: CSI <codepoint> ; <modifier> : <event> u
With alt:   CSI <codepoint> : <shifted> : <base> ; <modifier> : <event> u

Codepoint: Unicode codepoint of key
Modifier:  Bitmask (1=shift, 2=alt, 4=ctrl, ...) + 1
Event:     1=press, 2=repeat, 3=release
Shifted:   Codepoint when shift pressed
Base:      Codepoint in US layout (for non-Latin keyboards)
```

**Example Sequences:**
```
\x1b[97u           'a' pressed (codepoint 97)
\x1b[97;5u         Ctrl+a (97, modifier 5 = ctrl+1)
\x1b[97;2:3u       'A' released (shift modifier, release event)
\x1b[1089::97;5:1u Cyrillic 'a' with Ctrl, base='a' (non-Latin keyboard)
```

### 6.5 Arrow Keys in Kitty Protocol

```
CSI 1 ; <modifier> A     Up
CSI 1 ; <modifier> B     Down
CSI 1 ; <modifier> C     Right
CSI 1 ; <modifier> D     Left
```

### 6.6 Functional Keys

```
CSI <keynum> ; <modifier> ~

Key Numbers:
  2 = Insert
  3 = Delete
  5 = Page Up
  6 = Page Down
  7 = Home
  8 = End
```

### 6.7 Event Type Detection

```
func isKeyRelease(data: string) -> boolean {
    // Quick check for :3 suffix before terminator
    patterns = [":3u", ":3~", ":3A", ":3B", ":3C", ":3D", ":3H", ":3F"]
    return any(p in data for p in patterns)
}
```

### 6.8 Terminal Support Matrix

```
+------------------+--------+-----------+
| Terminal         | Kitty  | Image     |
|                  | KB     | Protocol  |
+------------------+--------+-----------+
| Kitty            | Yes    | Kitty     |
| Ghostty          | Yes    | Kitty     |
| WezTerm          | Yes    | Kitty     |
| iTerm2           | No     | iTerm2    |
| VS Code          | No     | None      |
| Alacritty        | No     | None      |
| xterm            | Partial| None      |
+------------------+--------+-----------+
```

---

## 7. Input Buffer Management

### 7.1 Problem Statement

Terminal input arrives in chunks that may split escape sequences:

```
Mouse event: \x1b[<35;20;5m
May arrive as:
  Chunk 1: \x1b
  Chunk 2: [<35
  Chunk 3: ;20;5m
```

### 7.2 StdinBuffer Architecture

```
+----------------+
|  Raw Stdin     |
+----------------+
        |
        v
+----------------+
|  StdinBuffer   |
|  - Accumulates |
|  - Parses      |
|  - Emits       |
+----------------+
        |
        +------------+
        |            |
        v            v
  +---------+   +---------+
  | 'data'  |   | 'paste' |
  | event   |   | event   |
  +---------+   +---------+
```

### 7.3 Sequence Completeness Detection

```
func isCompleteSequence(data: string) -> "complete" | "incomplete" | "not-escape"

CSI sequences:  ESC [ ... <terminator>
                Terminator: byte in 0x40-0x7E range (@-~)

OSC sequences:  ESC ] ... <ST>
                ST = ESC \ or BEL (\x07)

DCS sequences:  ESC P ... ESC \

APC sequences:  ESC _ ... ESC \

SS3 sequences:  ESC O <char>
```

### 7.4 Bracketed Paste Handling

```
Start marker: \x1b[200~
End marker:   \x1b[201~

Input stream:
  \x1b[200~Hello, World!\x1b[201~

Buffer emits:
  'paste' event with content "Hello, World!"
```

### 7.5 Timeout Flush

Incomplete sequences are flushed after timeout (default 10ms):
```
// Partial ESC sequence arrives
buffer.process("\x1b")
// After 10ms with no more data, emit as-is
```

---

## 8. Escape Sequence Reference

### 8.1 Cursor Control

```
CSI n A        Move cursor up n lines
CSI n B        Move cursor down n lines
CSI n C        Move cursor right n columns
CSI n D        Move cursor left n columns
CSI n G        Move cursor to column n (1-indexed)
CSI n ; m H    Move cursor to row n, column m
CSI H          Move cursor to home (1,1)
CSI ? 25 l     Hide cursor
CSI ? 25 h     Show cursor
```

### 8.2 Erase Operations

```
CSI K          Erase from cursor to end of line
CSI 2 K        Erase entire line
CSI J          Erase from cursor to end of screen
CSI 2 J        Erase entire screen
CSI 3 J        Erase entire screen + scrollback
```

### 8.3 Mode Control

```
CSI ? 2004 h   Enable bracketed paste
CSI ? 2004 l   Disable bracketed paste
CSI ? 2026 h   Begin synchronized output
CSI ? 2026 l   End synchronized output
CSI ? 1049 h   Enable alternate screen buffer
CSI ? 1049 l   Disable alternate screen buffer
```

### 8.4 Window Operations

```
OSC 0 ; title BEL      Set window title
CSI 16 t               Query cell size in pixels
CSI 6 ; h ; w t        Response: cell height/width in pixels
```

### 8.5 Kitty Graphics Protocol

```
APC G <params> ; <data> ST

Params:
  a=T   Action: transmit and display
  f=100 Format: PNG
  q=2   Quiet mode (no response)
  c=N   Display width in cells
  r=N   Display height in rows
  m=1/0 More data follows / last chunk
```

### 8.6 iTerm2 Inline Images

```
OSC 1337 ; File=<params> : <base64data> BEL

Params:
  inline=1              Display inline
  width=N               Width in cells/pixels/%
  height=N              Height
  preserveAspectRatio=1 Keep aspect ratio
  name=<base64name>     Filename
```

---

## 9. Synchronized Output

### 9.1 Purpose

Prevents screen tearing/flicker by batching updates:

```
Without Sync:           With Sync:
  Line 1 renders        +-- CSI ? 2026 h --+
  <visible update>      |   Line 1 renders |
  Line 2 renders        |   Line 2 renders |
  <visible update>      |   Line 3 renders |
  Line 3 renders        +-- CSI ? 2026 l --+
  <visible update>      <single atomic update>
```

### 9.2 Usage Pattern

```
func render(lines: string[]) {
    buffer = "\x1b[?2026h"  // Begin sync

    for line in lines {
        buffer += line + "\r\n"
    }

    buffer += "\x1b[?2026l"  // End sync
    terminal.write(buffer)
}
```

---

## 10. Platform Considerations

### 10.1 Unix (macOS, Linux)

```
+----------------------------------+
| Raw mode via setRawMode()        |
| SIGWINCH for resize              |
| /dev/tty for direct terminal     |
| ioctl TIOCGWINSZ for dimensions  |
+----------------------------------+
```

### 10.2 Windows

```
+----------------------------------+
| ConHost vs Windows Terminal      |
| SetConsoleMode() for raw mode    |
| Console API for dimensions       |
| Limited ANSI support (ConHost)   |
| Full ANSI in Windows Terminal    |
+----------------------------------+
```

**Windows Differences:**
- No SIGWINCH - use Console API events
- `process.platform === "win32"` check
- Skip SIGWINCH force-refresh on Windows

### 10.3 Cross-Platform Dimension Query

```
func getDimensions() -> (columns, rows) {
    return (
        process.stdout.columns ?? 80,
        process.stdout.rows ?? 24
    )
}
```

---

## 11. Mouse Support

### 11.1 Mouse Protocol Modes

```
CSI ? 1000 h   Enable basic mouse reporting
CSI ? 1002 h   Enable button event tracking
CSI ? 1003 h   Enable all motion tracking
CSI ? 1006 h   Enable SGR extended mode

CSI ? 1000 l   Disable mouse reporting (etc.)
```

### 11.2 SGR Mouse Encoding

```
CSI < Cb ; Cx ; Cy M    Mouse press
CSI < Cb ; Cx ; Cy m    Mouse release

Cb = Button code:
  0-2   Left, Middle, Right
  32-34 With motion
  64-66 Scroll wheel

Cx, Cy = 1-indexed coordinates
```

### 11.3 Legacy Mouse Encoding

```
CSI M Cb Cx Cy

Each byte = value + 32 (to make printable)
Limited to 223 columns/rows
```

**Note:** Current implementation parses mouse sequences but does not expose mouse events to components. Mouse sequences are detected and buffered correctly for future use.

---

## 12. Testing Strategies

### 12.1 Virtual Terminal

Use `xterm.js` headless for accurate terminal emulation:

```
class VirtualTerminal implements Terminal {
    private xterm: XtermTerminal

    // Implements full Terminal interface
    // Uses xterm.js for escape sequence processing
    // Provides test helpers:

    sendInput(data)              // Simulate keyboard
    resize(cols, rows)           // Simulate resize
    getViewport() -> string[]    // Read screen content
    getCursorPosition() -> {x, y}
    flush() -> Promise           // Wait for pending writes
}
```

### 12.2 Testing Patterns

```
// Test setup
terminal = new VirtualTerminal(80, 24)
tui = new TUI(terminal)
tui.start()

// Simulate input
terminal.sendInput("\x1b[A")  // Up arrow

// Verify output
await terminal.flush()
lines = terminal.getViewport()
assert(lines[0] == "Expected content")

// Test resize
terminal.resize(40, 12)
// onResize callback fires, UI re-renders
```

### 12.3 Key Event Testing

```
// Test Kitty protocol
terminal.sendInput("\x1b[97;5u")  // Ctrl+a in Kitty format
assert(matchesKey(lastInput, "ctrl+a"))

// Test legacy sequences
setKittyProtocolActive(false)
terminal.sendInput("\x01")        // Ctrl+a legacy
assert(matchesKey(lastInput, "ctrl+a"))
```

### 12.4 Escape Sequence Verification

```
// Verify cursor control
terminal.write("\x1b[10B")  // Move down 10
pos = terminal.getCursorPosition()
assert(pos.y == 10)

// Verify clear operations
terminal.write("Hello")
terminal.write("\x1b[2K")   // Clear line
lines = terminal.getViewport()
assert(lines[0] == "")
```

### 12.5 Integration Test Pattern

```
describe("Terminal Integration") {
    beforeEach(() => {
        terminal = new VirtualTerminal()
        tui = new TUI(terminal)
    })

    it("renders content correctly") {
        tui.addChild(new TextComponent("Hello"))
        tui.start()

        lines = await terminal.flushAndGetViewport()
        assert(lines[0].includes("Hello"))
    }

    it("handles resize") {
        tui.start()
        terminal.resize(40, 12)

        // Verify re-render at new dimensions
        lines = await terminal.flushAndGetViewport()
        assert(lines.every(l => visibleWidth(l) <= 40))
    }
}
```

---

## 13. Error Handling

### 13.1 TTY Errors

```
try {
    stdin.setRawMode(true)
} catch (err) {
    // Not a TTY, graceful fallback
    console.warn("Raw mode unavailable")
}
```

### 13.2 Write Errors

```
func safeWrite(data: string) {
    try {
        stdout.write(data)
    } catch (err) {
        // Pipe closed, terminal disconnected
        // Stop processing, cleanup
    }
}
```

### 13.3 Cleanup on Error

```
process.on('uncaughtException', (err) => {
    terminal.stop()        // Restore terminal
    terminal.showCursor()  // Show cursor
    throw err              // Re-throw
})
```

---

## 14. Performance Considerations

### 14.1 Buffer Batching

Always batch writes to minimize syscalls:

```
// Bad: Multiple writes
terminal.write("\x1b[H")
terminal.write("\x1b[2J")
terminal.write("Hello")

// Good: Single write
terminal.write("\x1b[H\x1b[2J Hello")
```

### 14.2 Differential Rendering

Only update changed lines:

```
func render(newLines) {
    for i, line in enumerate(newLines) {
        if line != previousLines[i] {
            moveCursorTo(i)
            clearLine()
            write(line)
        }
    }
}
```

### 14.3 Synchronized Output for Atomicity

```
buffer = "\x1b[?2026h"
buffer += renderContent()
buffer += "\x1b[?2026l"
terminal.write(buffer)  // Single atomic operation
```

---

## 15. Security Considerations

### 15.1 Input Sanitization

Never write untrusted input directly to terminal:
```
// Escape sequences in user data could:
// - Change terminal title (phishing)
// - Execute commands (via OSC 52, etc.)
// - Corrupt display state

func sanitize(input) {
    return input.replace(/[\x00-\x1f\x7f]/g, '')
}
```

### 15.2 Bracketed Paste Protection

Bracketed paste prevents paste injection:
```
// Pasted content wrapped in markers
\x1b[200~ malicious \x03 data \x1b[201~

// Application sees it as paste, not keystrokes
emit('paste', "malicious \x03 data")
```

---

## 16. Implementation Checklist

```
[ ] Terminal interface with all methods
[ ] ProcessTerminal implementation
    [ ] Raw mode enable/disable
    [ ] Bracketed paste mode
    [ ] Kitty protocol negotiation
    [ ] Input buffering
    [ ] Resize handling
    [ ] Proper cleanup on stop
[ ] VirtualTerminal for testing
    [ ] xterm.js integration
    [ ] Test helper methods
[ ] Key parsing module
    [ ] Legacy sequences
    [ ] Kitty CSI u format
    [ ] Modifier handling
    [ ] Event type detection
[ ] StdinBuffer
    [ ] Sequence completeness
    [ ] Bracketed paste
    [ ] Timeout flush
[ ] Synchronized output wrapper
[ ] Error handling and cleanup
[ ] Tests
    [ ] Key parsing tests
    [ ] Stdin buffer tests
    [ ] Integration tests
```

---

## 17. References

- [Kitty Keyboard Protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
- [XTerm Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html)
- [ANSI Escape Codes](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [iTerm2 Image Protocol](https://iterm2.com/documentation-images.html)
- [Kitty Graphics Protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [Synchronized Output](https://gist.github.com/fnky/458719343aabd01cfb17a3a4f7296797#synchronized-output)
