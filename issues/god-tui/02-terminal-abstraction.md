# Terminal Abstraction Layer - Engineering Specification

**Status:** Updated for libvaxis
**Version:** 2.0
**Implementation:** `libvaxis` (reference/libvaxis)

---

## 1. Overview

The Terminal Abstraction Layer is provided by **libvaxis**, a production Zig TUI library. It handles raw mode, signal handlers, protocol negotiation, and cross-platform differences.

```
+------------------------------------------------------------------+
|                         APPLICATION                               |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                     Vaxis (Main API)                              |
|  init() | deinit() | render() | window() | resize() | caps        |
+------------------------------------------------------------------+
                              |
          +-------------------+-------------------+
          |                                       |
          v                                       v
+----------------------+              +----------------------+
|  PosixTty            |              |  WindowsTty          |
|  (Unix terminals)    |              |  (Windows Console)   |
+----------------------+              +----------------------+
          |                                       |
          v                                       v
+----------------------+              +----------------------+
|  /dev/tty            |              |  Console API         |
|  termios             |              |  Win32               |
+----------------------+              +----------------------+
```

## 1.1 libvaxis Integration

```zig
const std = @import("std");
const vaxis = @import("vaxis");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // Initialize TTY and Vaxis
    var tty = try vaxis.Tty.init();
    defer tty.deinit();

    var vx = try vaxis.init(allocator, &tty, .{});
    defer vx.deinit(&tty);

    // Enter alt screen, enable features
    try vx.enterAltScreen(&tty);
    defer vx.exitAltScreen(&tty);

    // Query terminal capabilities
    try vx.queryTerminal(&tty, 1_000_000_000); // 1s timeout

    // Main loop...
}
```

---

## 2. libvaxis API Surface

### 2.1 Vaxis Main Structure

```zig
pub const Vaxis = struct {
    // Initialization
    pub fn init(allocator: Allocator, tty: *Tty, opts: Options) !Vaxis;
    pub fn deinit(self: *Vaxis, tty: *Tty) void;

    // Screen state
    screen: Screen,              // Current frame buffer
    screen_last: InternalScreen, // Previous frame (for diffing)
    caps: Capabilities,          // Detected terminal capabilities

    // Rendering
    pub fn window(self: *Vaxis) Window;  // Get root window
    pub fn render(self: *Vaxis, tty: *Tty) !void;  // Diff-render to tty
    pub fn resize(self: *Vaxis, allocator: Allocator, tty: *Tty, ws: Winsize) !void;
    pub fn queueRefresh(self: *Vaxis) void;  // Force full redraw

    // Screen modes
    pub fn enterAltScreen(self: *Vaxis, tty: *Tty) !void;
    pub fn exitAltScreen(self: *Vaxis, tty: *Tty) !void;

    // Capabilities
    pub fn queryTerminal(self: *Vaxis, tty: *Tty, timeout_ns: u64) !void;

    // Mouse/input
    pub fn setMouseMode(self: *Vaxis, tty: *Tty, enable: bool) !void;
    pub fn setBracketedPaste(self: *Vaxis, tty: *Tty, enable: bool) !void;

    // System
    pub fn setTitle(self: *Vaxis, tty: *Tty, title: []const u8) !void;
    pub fn notify(self: *Vaxis, tty: *Tty, title: ?[]const u8, body: []const u8) !void;

    // Graphics
    pub fn loadImage(self: *Vaxis, allocator: Allocator, tty: *Tty, src: ImageSource) !Image;
    pub fn transmitImage(self: *Vaxis, tty: *Tty, image: Image, fmt: Format) !void;
    pub fn freeImage(self: *Vaxis, tty: *Tty, id: u32) void;

    // Clipboard
    pub fn copyToSystemClipboard(self: *Vaxis, tty: *Tty, text: []const u8) !void;
    pub fn requestSystemClipboard(self: *Vaxis, tty: *Tty) !void;
};
```

### 2.2 Capabilities (auto-detected)

```zig
pub const Capabilities = struct {
    kitty_keyboard: bool,    // CSI-u keyboard protocol
    kitty_graphics: bool,    // Kitty image protocol
    rgb: bool,               // True color support
    sgr_pixels: bool,        // Pixel-based mouse coords
    unicode: enum { none, unicode, wcwidth },  // Width method
    color_scheme: ?ColorScheme,  // Light/dark preference
};
```
```

---

## 3. Raw Mode Implementation (via libvaxis Tty)

### 3.1 PosixTty Implementation

libvaxis `PosixTty` handles raw mode automatically:

```zig
// From reference/libvaxis/src/tty.zig
pub const PosixTty = struct {
    fd: std.posix.fd_t,
    original_termios: std.posix.termios,  // Saved for restore
    buffered_writer: BufferedWriter,

    pub fn init() !PosixTty {
        // 1. Open /dev/tty
        const fd = try std.posix.open("/dev/tty", .{ .ACCMODE = .RDWR }, 0);

        // 2. Save original termios
        var original = try std.posix.tcgetattr(fd);

        // 3. Configure raw mode
        var raw = original;
        // Disable echo, canonical mode, signals, etc.
        raw.lflag.ECHO = false;
        raw.lflag.ICANON = false;
        raw.lflag.ISIG = false;
        raw.lflag.IEXTEN = false;
        // Input flags
        raw.iflag.IXON = false;
        raw.iflag.ICRNL = false;
        raw.iflag.BRKINT = false;
        raw.iflag.INPCK = false;
        raw.iflag.ISTRIP = false;
        // Output flags
        raw.oflag.OPOST = false;

        try std.posix.tcsetattr(fd, .FLUSH, raw);

        // 4. Register SIGWINCH handler
        // (handled in Loop)

        return .{ .fd = fd, .original_termios = original, ... };
    }

    pub fn deinit(self: *PosixTty) void {
        // Restore original termios
        std.posix.tcsetattr(self.fd, .FLUSH, self.original_termios);
        std.posix.close(self.fd);
    }
};
```

### 3.2 Capability Queries on Init

libvaxis sends these queries in `queryTerminal()`:

```zig
// From Vaxis.zig queryTerminal()
tty.write(ctlseqs.primary_device_attrs);   // DA1 - terminal identification
tty.write(ctlseqs.csi_u_query);            // Kitty keyboard support?
tty.write(ctlseqs.kitty_graphics_query);   // Kitty graphics?
tty.write(ctlseqs.decrqm_sgr_pixels);      // Pixel mouse coords?
tty.write(ctlseqs.decrqm_unicode);         // Unicode width mode?
tty.write(ctlseqs.color_scheme_request);   // Light/dark preference?
```

### 3.3 Raw Mode Comparison

```
+-----------------+     +-----------------+
|  Cooked Mode    |     |   Raw Mode      |
+-----------------+     +-----------------+
| Line buffered   |     | Char-by-char    |
| Echo enabled    |     | No echo         |
| ^C = SIGINT     |     | ^C = key event  |
| ^Z = SIGTSTP    |     | ^Z = key event  |
| Signals handled |     | App handles all |
+-----------------+     +-----------------+
```

libvaxis handles all raw mode setup/teardown automatically.

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

## 6. Kitty Keyboard Protocol (via libvaxis)

### 6.1 Overview

libvaxis handles Kitty keyboard protocol automatically:
- Auto-detection via capability query
- Full modifier support
- Key press/repeat/release events
- Base layout key for non-Latin keyboards

### 6.2 Protocol in libvaxis

```zig
// libvaxis enables Kitty protocol with flags 31 (all features)
// From ctlseqs.zig:
pub const csi_u_push = csi ++ ">31u";  // Enable
pub const csi_u_pop = csi ++ "<1u";    // Disable
pub const csi_u_query = csi ++ "?u";   // Query support

// Capability detected in queryTerminal():
if (vx.caps.kitty_keyboard) {
    // Full key information available
}
```

### 6.3 Key Structure in libvaxis

```zig
pub const Key = struct {
    codepoint: u21,              // Unicode codepoint
    text: ?[]const u8,           // Reported text (if available)
    mods: Mods,                  // Modifier state
    base_layout_codepoint: ?u21, // US layout key (non-Latin)

    pub const Mods = struct {
        shift: bool = false,
        alt: bool = false,
        ctrl: bool = false,
        super: bool = false,
        hyper: bool = false,
        meta: bool = false,
        caps_lock: bool = false,
        num_lock: bool = false,
    };

    /// Check if key matches codepoint and modifiers
    pub fn matches(self: Key, cp: anytype, mods: Mods) bool;

    /// Check if this is a printable key (no ctrl, has text)
    pub fn isText(self: Key) bool;
};
```

### 6.4 Event Handling

```zig
// libvaxis Event union includes key events
pub const Event = union(enum) {
    key_press: Key,
    key_release: Key,  // Only with Kitty protocol
    // ...
};

// Usage in event loop:
switch (event) {
    .key_press => |key| {
        if (key.matches('c', .{ .ctrl = true })) {
            // Ctrl+C
        } else if (key.matches(.arrow_up, .{})) {
            // Up arrow
        } else if (key.isText()) {
            // Insert key.text.?
        }
    },
    .key_release => |key| {
        // Handle release if needed
    },
}
```

### 6.5 Special Key Codepoints (libvaxis)

```zig
// Common special keys (from Key.zig)
pub const escape = 0x1B;
pub const enter = '\r';
pub const tab = '\t';
pub const backspace = 0x7F;
pub const arrow_up = 0x111F;
pub const arrow_down = 0x1120;
pub const arrow_left = 0x1121;
pub const arrow_right = 0x1122;
pub const home = 0x1123;
pub const end = 0x1124;
pub const page_up = 0x1125;
pub const page_down = 0x1126;
pub const insert = 0x1127;
pub const delete = 0x1128;
pub const f1 = 0x1131;  // through f12
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
