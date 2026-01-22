# ANSI Escape Sequences Reference

Complete reference for terminal escape sequences used in TUI implementations.

```
                    ANSI Escape Sequence Structure
    ┌───────────────────────────────────────────────────────────┐
    │  ESC [ <params> <intermediate> <final>                    │
    │   │   │    │          │           │                       │
    │  0x1b │  0-9;      0x20-0x2F   0x40-0x7E                  │
    │       │                                                   │
    │      CSI (Control Sequence Introducer)                    │
    └───────────────────────────────────────────────────────────┘
```

## Table of Contents

1. [Escape Sequence Types](#escape-sequence-types)
2. [CSI Sequences](#csi-sequences)
3. [SGR (Select Graphic Rendition)](#sgr-select-graphic-rendition)
4. [Color Codes](#color-codes)
5. [DEC Private Modes](#dec-private-modes)
6. [OSC Sequences](#osc-sequences)
7. [APC Sequences](#apc-sequences)
8. [Kitty Graphics Protocol](#kitty-graphics-protocol)
9. [iTerm2 Inline Images](#iterm2-inline-images)
10. [Keyboard Protocol](#keyboard-protocol)
11. [Style Composition](#style-composition)
12. [Terminal Capability Detection](#terminal-capability-detection)
13. [Implementation Patterns](#implementation-patterns)

---

## Escape Sequence Types

| Type | Introducer | Terminator | Purpose |
|------|------------|------------|---------|
| CSI  | `ESC [` (0x1b 0x5b) | 0x40-0x7E | Cursor, clear, SGR, DEC modes |
| OSC  | `ESC ]` (0x1b 0x5d) | BEL (0x07) or ST | Window title, hyperlinks |
| DCS  | `ESC P` (0x1b 0x50) | ST (ESC \\) | Device control strings |
| APC  | `ESC _` (0x1b 0x5f) | ST or BEL | Application program commands |
| SS3  | `ESC O` (0x1b 0x4f) | Single char | Function keys, keypad |

String Terminator (ST) = `ESC \` (0x1b 0x5c)

```typescript
const ESC = "\x1b";
const CSI = "\x1b[";
const OSC = "\x1b]";
const DCS = "\x1bP";
const APC = "\x1b_";
const ST  = "\x1b\\";
const BEL = "\x07";
```

---

## CSI Sequences

### Cursor Movement

| Sequence | Name | Description |
|----------|------|-------------|
| `ESC[nA` | CUU | Cursor Up n rows |
| `ESC[nB` | CUD | Cursor Down n rows |
| `ESC[nC` | CUF | Cursor Forward n cols |
| `ESC[nD` | CUB | Cursor Back n cols |
| `ESC[nE` | CNL | Cursor Next Line (n lines down, col 1) |
| `ESC[nF` | CPL | Cursor Previous Line (n lines up, col 1) |
| `ESC[nG` | CHA | Cursor Horizontal Absolute (column n, 1-indexed) |
| `ESC[n;mH` | CUP | Cursor Position (row n, col m, 1-indexed) |
| `ESC[H` | HOME | Cursor to (1,1) |
| `ESC[s` | SCP | Save Cursor Position |
| `ESC[u` | RCP | Restore Cursor Position |

```typescript
// Move cursor down 5 lines
process.stdout.write("\x1b[5B");

// Move cursor up 3 lines
process.stdout.write("\x1b[3A");

// Move to column 10 (1-indexed)
process.stdout.write("\x1b[10G");

// Move to row 5, column 20
process.stdout.write("\x1b[5;20H");

// Return to line start
process.stdout.write("\r");
```

### Clear Operations

| Sequence | Name | Description |
|----------|------|-------------|
| `ESC[J` | ED(0) | Clear from cursor to end of screen |
| `ESC[0J` | ED(0) | Same as above |
| `ESC[1J` | ED(1) | Clear from start of screen to cursor |
| `ESC[2J` | ED(2) | Clear entire screen |
| `ESC[3J` | ED(3) | Clear entire screen + scrollback buffer |
| `ESC[K` | EL(0) | Clear from cursor to end of line |
| `ESC[0K` | EL(0) | Same as above |
| `ESC[1K` | EL(1) | Clear from start of line to cursor |
| `ESC[2K` | EL(2) | Clear entire line |

```typescript
// Clear entire screen and move home
process.stdout.write("\x1b[2J\x1b[H");

// Clear current line
process.stdout.write("\x1b[2K");

// Clear from cursor to end of line
process.stdout.write("\x1b[K");

// Clear screen + scrollback (full reset)
process.stdout.write("\x1b[3J\x1b[2J\x1b[H");
```

### Scrolling

| Sequence | Name | Description |
|----------|------|-------------|
| `ESC[nS` | SU | Scroll Up n lines |
| `ESC[nT` | SD | Scroll Down n lines |

### Terminal Queries

| Sequence | Response | Description |
|----------|----------|-------------|
| `ESC[6n` | `ESC[row;colR` | Report cursor position |
| `ESC[16t` | `ESC[6;height;widtht` | Report cell size in pixels |
| `ESC[?u` | `ESC[?flagsu` | Query Kitty keyboard protocol |

```typescript
// Query terminal for cell size (for image rendering)
process.stdout.write("\x1b[16t");
// Response: "\x1b[6;18;9t" = height 18px, width 9px per cell
```

---

## SGR (Select Graphic Rendition)

### Basic Format

```
ESC [ <code> ; <code> ; ... m
```

Reset: `ESC[0m` or `ESC[m`

### Attribute Codes

| Code | Set | Reset | Description |
|------|-----|-------|-------------|
| 0 | - | - | Reset all attributes |
| 1 | Bold | 22 | Bold/bright |
| 2 | Dim | 22 | Dim/faint |
| 3 | Italic | 23 | Italic |
| 4 | Underline | 24 | Underline |
| 5 | Blink | 25 | Slow blink |
| 6 | Rapid | 25 | Rapid blink |
| 7 | Reverse | 27 | Reverse video (swap fg/bg) |
| 8 | Hidden | 28 | Hidden/invisible |
| 9 | Strikethrough | 29 | Crossed out |

```typescript
// Bold red text
process.stdout.write("\x1b[1;31mBold Red\x1b[0m");

// Underline + italic
process.stdout.write("\x1b[3;4mItalic Underlined\x1b[0m");

// Reverse video (cursor simulation)
process.stdout.write("\x1b[7m \x1b[27m"); // Block cursor
```

### Underline Styles (Extended)

| Code | Description |
|------|-------------|
| 4 | Single underline |
| 4:0 | Underline off |
| 4:1 | Single underline |
| 4:2 | Double underline |
| 4:3 | Curly underline |
| 4:4 | Dotted underline |
| 4:5 | Dashed underline |

---

## Color Codes

### Standard Colors (8 colors)

| FG | BG | Color |
|----|-----|-------|
| 30 | 40 | Black |
| 31 | 41 | Red |
| 32 | 42 | Green |
| 33 | 43 | Yellow |
| 34 | 44 | Blue |
| 35 | 45 | Magenta |
| 36 | 46 | Cyan |
| 37 | 47 | White |
| 39 | 49 | Default |

### Bright Colors (8 colors)

| FG | BG | Color |
|----|-----|-------|
| 90 | 100 | Bright Black (Gray) |
| 91 | 101 | Bright Red |
| 92 | 102 | Bright Green |
| 93 | 103 | Bright Yellow |
| 94 | 104 | Bright Blue |
| 95 | 105 | Bright Magenta |
| 96 | 106 | Bright Cyan |
| 97 | 107 | Bright White |

### 256-Color Mode

```
ESC [ 38 ; 5 ; <n> m    # Foreground (n = 0-255)
ESC [ 48 ; 5 ; <n> m    # Background (n = 0-255)
```

Color index ranges:
- 0-7: Standard colors
- 8-15: Bright colors
- 16-231: 6x6x6 RGB cube (r*36 + g*6 + b + 16)
- 232-255: 24 grayscale (dark to light)

```typescript
// 256-color foreground (index 196 = bright red)
process.stdout.write("\x1b[38;5;196mBright Red\x1b[0m");

// 256-color background (index 240 = gray)
process.stdout.write("\x1b[48;5;240mGray BG\x1b[0m");

// Convert RGB to 256-color index
function rgb256(r: number, g: number, b: number): number {
  // Normalize to 0-5 range
  const r6 = Math.round(r * 5 / 255);
  const g6 = Math.round(g * 5 / 255);
  const b6 = Math.round(b * 5 / 255);
  return 16 + r6 * 36 + g6 * 6 + b6;
}
```

### True Color (24-bit RGB)

```
ESC [ 38 ; 2 ; <r> ; <g> ; <b> m    # Foreground
ESC [ 48 ; 2 ; <r> ; <g> ; <b> m    # Background
```

```typescript
// True color foreground (pure red)
process.stdout.write("\x1b[38;2;255;0;0mTrue Red\x1b[0m");

// True color background
process.stdout.write("\x1b[48;2;30;30;30mDark BG\x1b[0m");

// Helper function
function trueColor(r: number, g: number, b: number, bg = false): string {
  const code = bg ? 48 : 38;
  return `\x1b[${code};2;${r};${g};${b}m`;
}
```

### Color Detection

```typescript
function detectColorSupport(): "truecolor" | "256" | "16" | "none" {
  const colorTerm = process.env.COLORTERM?.toLowerCase() || "";
  const term = process.env.TERM?.toLowerCase() || "";

  if (colorTerm === "truecolor" || colorTerm === "24bit") {
    return "truecolor";
  }

  if (term.includes("256color") || term.includes("256-color")) {
    return "256";
  }

  if (term.includes("color") || term.includes("xterm")) {
    return "16";
  }

  return process.stdout.isTTY ? "16" : "none";
}
```

---

## DEC Private Modes

DEC private modes use `?` after CSI:

```
ESC [ ? <mode> h    # Enable (high)
ESC [ ? <mode> l    # Disable (low)
```

### Commonly Used Modes

| Mode | Enable | Disable | Description |
|------|--------|---------|-------------|
| 25 | `ESC[?25h` | `ESC[?25l` | Cursor visibility |
| 1049 | `ESC[?1049h` | `ESC[?1049l` | Alternate screen buffer |
| 2004 | `ESC[?2004h` | `ESC[?2004l` | Bracketed paste mode |
| 2026 | `ESC[?2026h` | `ESC[?2026l` | Synchronized output |

### Cursor Visibility

```typescript
// Hide cursor (for rendering without flicker)
process.stdout.write("\x1b[?25l");

// Show cursor
process.stdout.write("\x1b[?25h");
```

### Bracketed Paste Mode

When enabled, pasted text is wrapped with markers:
- Start: `ESC[200~`
- End: `ESC[201~`

```typescript
// Enable bracketed paste
process.stdout.write("\x1b[?2004h");

// Disable bracketed paste
process.stdout.write("\x1b[?2004l");

// Parsing pasted content
function extractPaste(data: string): string | null {
  const PASTE_START = "\x1b[200~";
  const PASTE_END = "\x1b[201~";

  if (data.includes(PASTE_START)) {
    const start = data.indexOf(PASTE_START) + PASTE_START.length;
    const end = data.indexOf(PASTE_END);
    if (end > start) {
      return data.slice(start, end);
    }
  }
  return null;
}
```

### Synchronized Output (DEC Mode 2026)

Prevents screen tearing during rapid updates:

```typescript
// Begin synchronized output
process.stdout.write("\x1b[?2026h");

// ... render all content ...

// End synchronized output (terminal flushes)
process.stdout.write("\x1b[?2026l");

// Full render cycle
function render(lines: string[]): void {
  let buffer = "\x1b[?2026h"; // Begin sync
  buffer += "\x1b[H";         // Home cursor

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) buffer += "\r\n";
    buffer += "\x1b[2K" + lines[i];  // Clear line, write content
  }

  buffer += "\x1b[?2026l"; // End sync
  process.stdout.write(buffer);
}
```

### Alternate Screen Buffer

Full-screen applications use alternate buffer to preserve shell history:

```typescript
// Enter alternate screen
process.stdout.write("\x1b[?1049h");

// ... run TUI application ...

// Exit alternate screen (restores original content)
process.stdout.write("\x1b[?1049l");
```

---

## OSC Sequences

Operating System Commands: `ESC ] <code> ; <data> BEL`

### Window Title (OSC 0)

```typescript
// Set window title
process.stdout.write(`\x1b]0;My Application\x07`);

// Set with ST terminator (more compatible)
process.stdout.write(`\x1b]0;My Application\x1b\\`);
```

### Hyperlinks (OSC 8)

```
ESC ] 8 ; <params> ; <url> BEL <text> ESC ] 8 ; ; BEL
```

```typescript
// Create hyperlink
function hyperlink(text: string, url: string, id?: string): string {
  const params = id ? `id=${id}` : "";
  return `\x1b]8;${params};${url}\x07${text}\x1b]8;;\x07`;
}

// Usage
const link = hyperlink("Click here", "https://example.com");
process.stdout.write(link);

// With ID (allows terminal to identify same link across lines)
const linkWithId = hyperlink("Documentation", "https://docs.example.com", "doc-link");
```

### Clipboard Operations (OSC 52)

```typescript
// Copy to clipboard
function copyToClipboard(text: string): void {
  const base64 = Buffer.from(text).toString("base64");
  process.stdout.write(`\x1b]52;c;${base64}\x07`);
}

// Query clipboard (terminal sends response)
process.stdout.write("\x1b]52;c;?\x07");
```

### Notification (OSC 9 / OSC 99)

```typescript
// Desktop notification (iTerm2/Kitty)
function notify(message: string): void {
  process.stdout.write(`\x1b]9;${message}\x07`);
}

// Kitty notification with ID
function kittyNotify(id: string, message: string): void {
  process.stdout.write(`\x1b]99;i=${id};${message}\x07`);
}
```

---

## APC Sequences

Application Program Commands: `ESC _ <data> ST`

### Custom Markers

APC sequences are invisible zero-width and can be used for custom markers:

```typescript
// Cursor position marker (used by TUI for IME positioning)
const CURSOR_MARKER = "\x1b_pi:c\x07";

// Component emits marker at cursor position
function renderWithCursor(text: string, cursorPos: number): string {
  return text.slice(0, cursorPos) + CURSOR_MARKER + text.slice(cursorPos);
}

// TUI finds and strips marker, positions hardware cursor
function extractCursorMarker(line: string): { col: number; cleaned: string } | null {
  const idx = line.indexOf(CURSOR_MARKER);
  if (idx === -1) return null;

  const before = line.slice(0, idx);
  const after = line.slice(idx + CURSOR_MARKER.length);

  return {
    col: visibleWidth(before),
    cleaned: before + after
  };
}
```

### Stripping APC Sequences

```typescript
// Strip APC sequences from string
function stripApc(str: string): string {
  // Matches ESC _ ... BEL or ESC _ ... ST
  return str.replace(/\x1b_[^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}
```

---

## Kitty Graphics Protocol

### Basic Structure

```
ESC _ G <key>=<value>,<key>=<value>;[payload] ESC \
     │                                │
    APC                              ST
```

### Transmission Keys

| Key | Description | Values |
|-----|-------------|--------|
| a | Action | T=transmit, t=transmit+display, d=delete |
| f | Format | 24=RGB, 32=RGBA, 100=PNG |
| t | Transmission | d=direct, f=file, t=temp file |
| s | Width | Source image width in pixels |
| v | Height | Source image height in pixels |
| c | Columns | Display width in cells |
| r | Rows | Display height in cells |
| i | Image ID | Unique ID for image |
| m | More | 1=more chunks, 0=last chunk |
| q | Quiet | 0=responses, 1=errors only, 2=silent |

### Display an Image

```typescript
function encodeKitty(
  base64Data: string,
  options: { columns?: number; rows?: number; imageId?: number } = {}
): string {
  const CHUNK_SIZE = 4096;
  const params: string[] = ["a=T", "f=100", "q=2"];

  if (options.columns) params.push(`c=${options.columns}`);
  if (options.rows) params.push(`r=${options.rows}`);
  if (options.imageId) params.push(`i=${options.imageId}`);

  // Single chunk
  if (base64Data.length <= CHUNK_SIZE) {
    return `\x1b_G${params.join(",")};${base64Data}\x1b\\`;
  }

  // Multi-chunk
  const chunks: string[] = [];
  let offset = 0;
  let isFirst = true;

  while (offset < base64Data.length) {
    const chunk = base64Data.slice(offset, offset + CHUNK_SIZE);
    const isLast = offset + CHUNK_SIZE >= base64Data.length;

    if (isFirst) {
      chunks.push(`\x1b_G${params.join(",")},m=1;${chunk}\x1b\\`);
      isFirst = false;
    } else if (isLast) {
      chunks.push(`\x1b_Gm=0;${chunk}\x1b\\`);
    } else {
      chunks.push(`\x1b_Gm=1;${chunk}\x1b\\`);
    }

    offset += CHUNK_SIZE;
  }

  return chunks.join("");
}
```

### Image Detection

```typescript
function containsKittyImage(line: string): boolean {
  return line.includes("\x1b_G");
}
```

---

## iTerm2 Inline Images

### Protocol Format

```
ESC ] 1337 ; File=<params>:<base64data> BEL
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| name=<base64> | Filename (base64 encoded) |
| size=<n> | File size in bytes |
| width=<n> | Display width (cells, pixels, or %) |
| height=<n> | Display height |
| preserveAspectRatio=0/1 | Scale mode |
| inline=0/1 | Display inline or download |

### Implementation

```typescript
function encodeITerm2(
  base64Data: string,
  options: {
    width?: number | string;
    height?: number | string;
    name?: string;
    preserveAspectRatio?: boolean;
    inline?: boolean;
  } = {}
): string {
  const params: string[] = [`inline=${options.inline !== false ? 1 : 0}`];

  if (options.width !== undefined) {
    params.push(`width=${options.width}`);
  }
  if (options.height !== undefined) {
    params.push(`height=${options.height}`);
  }
  if (options.name) {
    const nameBase64 = Buffer.from(options.name).toString("base64");
    params.push(`name=${nameBase64}`);
  }
  if (options.preserveAspectRatio === false) {
    params.push("preserveAspectRatio=0");
  }

  return `\x1b]1337;File=${params.join(";")}:${base64Data}\x07`;
}
```

### Image Detection

```typescript
function containsITerm2Image(line: string): boolean {
  return line.includes("\x1b]1337;File=");
}
```

---

## Keyboard Protocol

### Kitty Keyboard Protocol

Extends terminal keyboard handling with unambiguous key reporting.

#### Protocol Query and Enable

```typescript
// Query current flags
process.stdout.write("\x1b[?u");
// Response: ESC [ ? <flags> u

// Push new flags (enable protocol)
// Flag 1 = disambiguate escape codes
// Flag 2 = report event types (press/repeat/release)
// Flag 4 = report alternate keys (shifted, base layout)
process.stdout.write("\x1b[>7u");  // Flags 1+2+4 = 7

// Pop flags (disable protocol)
process.stdout.write("\x1b[<u");
```

#### Key Event Format

```
ESC [ <codepoint> ; <modifier> u                    # Basic
ESC [ <codepoint> ; <modifier> : <event> u          # With event type
ESC [ <codepoint> : <shifted> ; <modifier> u        # With shifted key
ESC [ <codepoint> : <shifted> : <base> ; <modifier> u  # Full
```

Modifier bits (1-indexed in protocol, 0-indexed internally):
- Bit 0 (1): Shift
- Bit 1 (2): Alt
- Bit 2 (4): Ctrl
- Bit 6 (64): Caps Lock
- Bit 7 (128): Num Lock

Event types:
- 1 = press
- 2 = repeat
- 3 = release

```typescript
interface ParsedKittySequence {
  codepoint: number;
  shiftedKey?: number;
  baseLayoutKey?: number;
  modifier: number;
  eventType: "press" | "repeat" | "release";
}

function parseKittySequence(data: string): ParsedKittySequence | null {
  // CSI u format
  const match = data.match(
    /^\x1b\[(\d+)(?::(\d*))?(?::(\d+))?(?:;(\d+))?(?::(\d+))?u$/
  );
  if (!match) return null;

  const codepoint = parseInt(match[1], 10);
  const shiftedKey = match[2]?.length ? parseInt(match[2], 10) : undefined;
  const baseLayoutKey = match[3] ? parseInt(match[3], 10) : undefined;
  const modValue = match[4] ? parseInt(match[4], 10) : 1;
  const eventNum = match[5] ? parseInt(match[5], 10) : 1;

  const eventType = eventNum === 3 ? "release"
                  : eventNum === 2 ? "repeat"
                  : "press";

  return {
    codepoint,
    shiftedKey,
    baseLayoutKey,
    modifier: modValue - 1,  // Convert to 0-indexed
    eventType
  };
}
```

### Legacy Key Sequences

| Key | Sequences |
|-----|-----------|
| Up | `ESC[A`, `ESCOA` |
| Down | `ESC[B`, `ESCOB` |
| Right | `ESC[C`, `ESCOC` |
| Left | `ESC[D`, `ESCOD` |
| Home | `ESC[H`, `ESCOH`, `ESC[1~`, `ESC[7~` |
| End | `ESC[F`, `ESCOF`, `ESC[4~`, `ESC[8~` |
| Insert | `ESC[2~` |
| Delete | `ESC[3~` |
| PageUp | `ESC[5~` |
| PageDown | `ESC[6~` |
| F1-F4 | `ESCOP`-`ESCOS`, `ESC[11~`-`ESC[14~` |
| F5-F12 | `ESC[15~`-`ESC[24~` (with gaps) |

#### Modified Arrow Keys

```
ESC [ 1 ; <mod> A/B/C/D
```

Modifier values (1-indexed):
- 2 = Shift
- 3 = Alt
- 4 = Shift+Alt
- 5 = Ctrl
- 6 = Shift+Ctrl
- 7 = Alt+Ctrl
- 8 = Shift+Alt+Ctrl

```typescript
// Parse modified arrow key
const arrowMatch = data.match(/^\x1b\[1;(\d+)([ABCD])$/);
if (arrowMatch) {
  const mod = parseInt(arrowMatch[1], 10) - 1;
  const direction = { A: "up", B: "down", C: "right", D: "left" }[arrowMatch[2]];
}
```

---

## Style Composition

### AnsiCodeTracker

Track active SGR codes across line breaks:

```typescript
class AnsiCodeTracker {
  private bold = false;
  private dim = false;
  private italic = false;
  private underline = false;
  private blink = false;
  private inverse = false;
  private hidden = false;
  private strikethrough = false;
  private fgColor: string | null = null;  // "31" or "38;5;196" or "38;2;255;0;0"
  private bgColor: string | null = null;

  process(ansiCode: string): void {
    if (!ansiCode.endsWith("m")) return;

    const match = ansiCode.match(/\x1b\[([\d;]*)m/);
    if (!match) return;

    const params = match[1];
    if (params === "" || params === "0") {
      this.reset();
      return;
    }

    const parts = params.split(";");
    let i = 0;

    while (i < parts.length) {
      const code = parseInt(parts[i], 10);

      // Handle 256/RGB colors
      if (code === 38 || code === 48) {
        if (parts[i + 1] === "5" && parts[i + 2]) {
          // 256 color: 38;5;N
          const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]}`;
          if (code === 38) this.fgColor = colorCode;
          else this.bgColor = colorCode;
          i += 3;
          continue;
        } else if (parts[i + 1] === "2" && parts[i + 4]) {
          // RGB: 38;2;R;G;B
          const colorCode = `${parts[i]};${parts[i + 1]};${parts[i + 2]};${parts[i + 3]};${parts[i + 4]}`;
          if (code === 38) this.fgColor = colorCode;
          else this.bgColor = colorCode;
          i += 5;
          continue;
        }
      }

      // Standard codes
      switch (code) {
        case 0: this.reset(); break;
        case 1: this.bold = true; break;
        case 2: this.dim = true; break;
        case 3: this.italic = true; break;
        case 4: this.underline = true; break;
        case 5: this.blink = true; break;
        case 7: this.inverse = true; break;
        case 8: this.hidden = true; break;
        case 9: this.strikethrough = true; break;
        case 22: this.bold = false; this.dim = false; break;
        case 23: this.italic = false; break;
        case 24: this.underline = false; break;
        case 25: this.blink = false; break;
        case 27: this.inverse = false; break;
        case 28: this.hidden = false; break;
        case 29: this.strikethrough = false; break;
        case 39: this.fgColor = null; break;
        case 49: this.bgColor = null; break;
        default:
          if (code >= 30 && code <= 37 || code >= 90 && code <= 97) {
            this.fgColor = String(code);
          } else if (code >= 40 && code <= 47 || code >= 100 && code <= 107) {
            this.bgColor = String(code);
          }
      }
      i++;
    }
  }

  private reset(): void {
    this.bold = this.dim = this.italic = this.underline = false;
    this.blink = this.inverse = this.hidden = this.strikethrough = false;
    this.fgColor = this.bgColor = null;
  }

  getActiveCodes(): string {
    const codes: string[] = [];
    if (this.bold) codes.push("1");
    if (this.dim) codes.push("2");
    if (this.italic) codes.push("3");
    if (this.underline) codes.push("4");
    if (this.blink) codes.push("5");
    if (this.inverse) codes.push("7");
    if (this.hidden) codes.push("8");
    if (this.strikethrough) codes.push("9");
    if (this.fgColor) codes.push(this.fgColor);
    if (this.bgColor) codes.push(this.bgColor);

    return codes.length > 0 ? `\x1b[${codes.join(";")}m` : "";
  }
}
```

### Style Stacking

Preserve styles across line breaks during text wrapping:

```typescript
function wrapWithStyles(text: string, width: number): string[] {
  const tracker = new AnsiCodeTracker();
  const lines: string[] = [];
  let currentLine = "";
  let currentWidth = 0;

  let i = 0;
  while (i < text.length) {
    // Check for ANSI code
    if (text[i] === "\x1b") {
      const match = text.slice(i).match(/^\x1b\[[\d;]*m/);
      if (match) {
        tracker.process(match[0]);
        currentLine += match[0];
        i += match[0].length;
        continue;
      }
    }

    // Regular character
    const char = text[i];
    const charWidth = getCharWidth(char);

    if (currentWidth + charWidth > width) {
      // Wrap line
      lines.push(currentLine + "\x1b[0m");  // Reset at end
      currentLine = tracker.getActiveCodes();  // Restore at start
      currentWidth = 0;
    }

    currentLine += char;
    currentWidth += charWidth;
    i++;
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}
```

### Reset Strategies

```typescript
// Full reset - use at line boundaries
const FULL_RESET = "\x1b[0m";

// Segment reset with hyperlink cleanup
const SEGMENT_RESET = "\x1b[0m\x1b]8;;\x07";

// Underline-only reset (preserves background for padding)
function getLineEndReset(tracker: AnsiCodeTracker): string {
  if (tracker.hasUnderline()) {
    return "\x1b[24m";  // Only disable underline
  }
  return "";
}

// Apply reset at line end before padding
function padLine(line: string, width: number): string {
  const visWidth = visibleWidth(line);
  const padding = " ".repeat(Math.max(0, width - visWidth));

  // Reset underline to prevent bleeding into padding
  const reset = line.includes("\x1b[4m") ? "\x1b[24m" : "";
  return line + reset + padding + FULL_RESET;
}
```

---

## Terminal Capability Detection

### Environment Variables

| Variable | Indicates |
|----------|-----------|
| `TERM_PROGRAM` | Terminal application name |
| `TERM` | Terminal type |
| `COLORTERM` | Color capability (truecolor, 24bit) |
| `KITTY_WINDOW_ID` | Kitty terminal |
| `ITERM_SESSION_ID` | iTerm2 terminal |
| `WEZTERM_PANE` | WezTerm terminal |
| `GHOSTTY_RESOURCES_DIR` | Ghostty terminal |

### Capability Detection

```typescript
interface TerminalCapabilities {
  images: "kitty" | "iterm2" | null;
  trueColor: boolean;
  hyperlinks: boolean;
  kittyKeyboard: boolean;
  syncOutput: boolean;
}

function detectCapabilities(): TerminalCapabilities {
  const termProgram = process.env.TERM_PROGRAM?.toLowerCase() || "";
  const term = process.env.TERM?.toLowerCase() || "";
  const colorTerm = process.env.COLORTERM?.toLowerCase() || "";

  // Kitty
  if (process.env.KITTY_WINDOW_ID || termProgram === "kitty") {
    return {
      images: "kitty",
      trueColor: true,
      hyperlinks: true,
      kittyKeyboard: true,
      syncOutput: true
    };
  }

  // Ghostty
  if (termProgram === "ghostty" || process.env.GHOSTTY_RESOURCES_DIR) {
    return {
      images: "kitty",
      trueColor: true,
      hyperlinks: true,
      kittyKeyboard: true,
      syncOutput: true
    };
  }

  // WezTerm
  if (process.env.WEZTERM_PANE || termProgram === "wezterm") {
    return {
      images: "kitty",
      trueColor: true,
      hyperlinks: true,
      kittyKeyboard: true,
      syncOutput: true
    };
  }

  // iTerm2
  if (process.env.ITERM_SESSION_ID || termProgram === "iterm.app") {
    return {
      images: "iterm2",
      trueColor: true,
      hyperlinks: true,
      kittyKeyboard: false,
      syncOutput: true
    };
  }

  // VS Code terminal
  if (termProgram === "vscode") {
    return {
      images: null,
      trueColor: true,
      hyperlinks: true,
      kittyKeyboard: false,
      syncOutput: true
    };
  }

  // Generic detection
  const trueColor = colorTerm === "truecolor" || colorTerm === "24bit";
  return {
    images: null,
    trueColor,
    hyperlinks: true,
    kittyKeyboard: false,
    syncOutput: term.includes("xterm") || term.includes("256color")
  };
}
```

### Runtime Protocol Detection

```typescript
// Query Kitty keyboard protocol support
function queryKittyProtocol(
  onSupported: () => void,
  onTimeout: () => void,
  timeoutMs = 100
): void {
  let responded = false;
  const timeout = setTimeout(() => {
    if (!responded) onTimeout();
  }, timeoutMs);

  // Response pattern: ESC [ ? <flags> u
  const handler = (data: Buffer) => {
    const str = data.toString();
    if (/\x1b\[\?\d+u/.test(str)) {
      responded = true;
      clearTimeout(timeout);
      onSupported();
    }
  };

  process.stdin.on("data", handler);
  process.stdout.write("\x1b[?u");  // Query current flags
}
```

---

## Implementation Patterns

### Batched Rendering with Sync

```typescript
class TUI {
  private buffer: string[] = [];

  render(lines: string[]): void {
    let output = "\x1b[?2026h";  // Begin sync
    output += "\x1b[?25l";        // Hide cursor

    for (let i = 0; i < lines.length; i++) {
      if (i > 0) output += "\r\n";
      output += "\x1b[2K" + lines[i];
    }

    output += "\x1b[?2026l";      // End sync
    process.stdout.write(output);
  }
}
```

### Differential Rendering

```typescript
class DiffRenderer {
  private previousLines: string[] = [];
  private cursorRow = 0;

  render(newLines: string[]): void {
    let output = "\x1b[?2026h";  // Begin sync

    for (let i = 0; i < newLines.length; i++) {
      if (this.previousLines[i] === newLines[i]) continue;

      // Move to changed line
      const delta = i - this.cursorRow;
      if (delta > 0) output += `\x1b[${delta}B`;
      else if (delta < 0) output += `\x1b[${-delta}A`;

      output += "\r\x1b[2K" + newLines[i];
      this.cursorRow = i;
    }

    output += "\x1b[?2026l";  // End sync
    process.stdout.write(output);

    this.previousLines = [...newLines];
  }
}
```

### ANSI Stripping

```typescript
function stripAnsi(str: string): string {
  // Strip SGR codes
  str = str.replace(/\x1b\[[0-9;]*m/g, "");

  // Strip cursor codes
  str = str.replace(/\x1b\[[0-9;]*[GKHJ]/g, "");

  // Strip OSC hyperlinks
  str = str.replace(/\x1b\]8;;[^\x07]*\x07/g, "");

  // Strip APC sequences
  str = str.replace(/\x1b_[^\x07\x1b]*(?:\x07|\x1b\\)/g, "");

  return str;
}

function visibleWidth(str: string): number {
  const cleaned = stripAnsi(str);
  // Use string-width or similar for accurate width calculation
  return getStringWidth(cleaned);
}
```

### Sequence Parser

```typescript
function isCompleteSequence(data: string): "complete" | "incomplete" | "not-escape" {
  if (!data.startsWith("\x1b")) return "not-escape";
  if (data.length === 1) return "incomplete";

  const after = data[1];

  // CSI: ESC [
  if (after === "[") {
    // Check for final byte (0x40-0x7E)
    const last = data.charCodeAt(data.length - 1);
    return (last >= 0x40 && last <= 0x7e) ? "complete" : "incomplete";
  }

  // OSC: ESC ]
  if (after === "]") {
    return (data.endsWith("\x07") || data.endsWith("\x1b\\"))
      ? "complete" : "incomplete";
  }

  // APC: ESC _
  if (after === "_") {
    return (data.endsWith("\x07") || data.endsWith("\x1b\\"))
      ? "complete" : "incomplete";
  }

  // DCS: ESC P
  if (after === "P") {
    return data.endsWith("\x1b\\") ? "complete" : "incomplete";
  }

  // SS3: ESC O (single char follows)
  if (after === "O") {
    return data.length >= 3 ? "complete" : "incomplete";
  }

  // Meta: ESC + char
  return data.length >= 2 ? "complete" : "incomplete";
}
```

---

## Quick Reference Card

```
┌────────────────────────────────────────────────────────────────────┐
│                    ANSI ESCAPE SEQUENCE CHEATSHEET                  │
├────────────────────────────────────────────────────────────────────┤
│ CURSOR                                                              │
│   ESC[nA    Up n        ESC[nB    Down n      ESC[H     Home       │
│   ESC[nC    Right n     ESC[nD    Left n      ESC[n;mH  Goto(r,c)  │
│   ESC[nG    Column n    ESC[s     Save        ESC[u     Restore    │
├────────────────────────────────────────────────────────────────────┤
│ CLEAR                                                               │
│   ESC[J     Cursor->End    ESC[1J   Start->Cursor   ESC[2J  Screen │
│   ESC[K     Cursor->EOL    ESC[1K   SOL->Cursor     ESC[2K  Line   │
│   ESC[3J    Screen+Scrollback                                       │
├────────────────────────────────────────────────────────────────────┤
│ COLORS (FG/BG)                                                      │
│   30-37/40-47     Standard    90-97/100-107   Bright               │
│   38;5;N/48;5;N   256-color   38;2;R;G;B      True color           │
│   39/49           Default                                           │
├────────────────────────────────────────────────────────────────────┤
│ STYLE                                                               │
│   1 Bold    2 Dim     3 Italic    4 Underline    7 Reverse         │
│   9 Strike  22 !Bold  23 !Italic  24 !Underline  0 Reset All       │
├────────────────────────────────────────────────────────────────────┤
│ DEC PRIVATE MODES (ESC[?Nh enable / ESC[?Nl disable)               │
│   25   Cursor visible    2004   Bracketed paste                    │
│   1049 Alt screen        2026   Synchronized output                │
├────────────────────────────────────────────────────────────────────┤
│ OSC SEQUENCES (ESC]code;data BEL)                                  │
│   0;title     Window title                                          │
│   8;params;url  Hyperlink start    8;;  Hyperlink end              │
│   52;c;base64   Set clipboard                                       │
├────────────────────────────────────────────────────────────────────┤
│ IMAGE PROTOCOLS                                                     │
│   Kitty:   ESC_Ga=T,f=100;base64 ESC\                              │
│   iTerm2:  ESC]1337;File=inline=1:base64 BEL                       │
├────────────────────────────────────────────────────────────────────┤
│ KITTY KEYBOARD (ESC[codepoint;modifier u)                          │
│   Query: ESC[?u    Enable: ESC[>7u    Disable: ESC[<u              │
│   Mod bits: 1=Shift 2=Alt 4=Ctrl   Event: 1=press 2=repeat 3=rel   │
└────────────────────────────────────────────────────────────────────┘
```

---

## References

- [ECMA-48 Standard](https://www.ecma-international.org/publications-and-standards/standards/ecma-48/)
- [XTerm Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html)
- [Kitty Keyboard Protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
- [Kitty Graphics Protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [iTerm2 Proprietary Escape Codes](https://iterm2.com/documentation-escape-codes.html)
- [console_codes(4) man page](https://man7.org/linux/man-pages/man4/console_codes.4.html)

---

*Document generated from analysis of pi-mono/packages/tui implementation.*
