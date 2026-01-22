# Input Handling Specification

## Overview

Terminal input handling requires parsing raw byte streams into structured key events. Input arrives via stdin as sequences of bytes that encode keypresses, mouse events, paste content, and terminal responses. The complexity arises from:

1. **Partial arrival** - Escape sequences may span multiple stdin events
2. **Ambiguous sequences** - Single ESC byte could be Escape key or start of sequence
3. **Protocol variations** - Legacy terminals vs modern Kitty protocol
4. **Bracketed paste** - Multi-byte paste content wrapped in markers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INPUT HANDLING PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  stdin ─> StdinBuffer ─> Sequence Parser ─> Key Matcher ─> Event Dispatch   │
│              │                   │                │                          │
│              │                   │                └── matchesKey(data, id)   │
│              │                   │                    parseKey(data)         │
│              │                   │                                           │
│              │                   └── CSI/SS3/OSC/DCS/APC parsers            │
│              │                       Kitty CSI-u decoder                     │
│              │                       Legacy sequence lookup                  │
│              │                                                               │
│              └── Buffer accumulation                                         │
│                  Timeout-based flush                                         │
│                  Bracketed paste extraction                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Stdin Buffer State Machine

The `StdinBuffer` handles partial sequence arrival and bracketed paste detection.

### State Diagram

```
                              ┌──────────────────┐
                              │                  │
                              v                  │
┌─────────────────┐      ┌─────────────────┐     │
│                 │      │                 │     │
│     IDLE        │─────>│   BUFFERING     │─────┘
│                 │ ESC  │                 │ more data
└─────────────────┘      └─────────────────┘
        │                        │
        │ \x1b[200~              │ complete
        v                        v
┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │
│  PASTE_MODE     │      │  EMIT_SEQUENCE  │
│                 │      │                 │
└─────────────────┘      └─────────────────┘
        │                        │
        │ \x1b[201~              │
        v                        v
┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │
│   EMIT_PASTE    │─────>│      IDLE       │
│                 │      │                 │
└─────────────────┘      └─────────────────┘
```

### Buffer Class Interface

```
class StdinBuffer:
    buffer: string = ""
    timeout: Timer | null = null
    timeoutMs: number = 10
    pasteMode: boolean = false
    pasteBuffer: string = ""

    events:
        - "data" -> (sequence: string)   # Complete sequence
        - "paste" -> (content: string)   # Paste content
```

### Processing Algorithm

```
function process(data: string | Buffer):
    # Clear pending timeout
    if timeout != null:
        clearTimeout(timeout)
        timeout = null

    # Handle high-byte conversion for legacy terminals
    # Single byte > 127 converts to ESC + (byte - 128)
    if data is Buffer and length == 1 and data[0] > 127:
        str = ESC + chr(data[0] - 128)
    else:
        str = data.toString()

    # Empty input on empty buffer emits empty event
    if str.length == 0 and buffer.length == 0:
        emit("data", "")
        return

    buffer += str

    # === PASTE MODE HANDLING ===
    if pasteMode:
        pasteBuffer += buffer
        buffer = ""

        endIndex = pasteBuffer.indexOf(PASTE_END)  # \x1b[201~
        if endIndex != -1:
            content = pasteBuffer[0:endIndex]
            remaining = pasteBuffer[endIndex + 6:]

            pasteMode = false
            pasteBuffer = ""

            emit("paste", content)

            if remaining.length > 0:
                process(remaining)  # Recursive for post-paste data
        return

    # === PASTE START DETECTION ===
    startIndex = buffer.indexOf(PASTE_START)  # \x1b[200~
    if startIndex != -1:
        # Emit sequences before paste marker
        if startIndex > 0:
            beforePaste = buffer[0:startIndex]
            result = extractCompleteSequences(beforePaste)
            for seq in result.sequences:
                emit("data", seq)

        # Enter paste mode
        buffer = buffer[startIndex + 6:]
        pasteMode = true
        pasteBuffer = buffer
        buffer = ""

        # Check for immediate paste end
        endIndex = pasteBuffer.indexOf(PASTE_END)
        if endIndex != -1:
            content = pasteBuffer[0:endIndex]
            remaining = pasteBuffer[endIndex + 6:]

            pasteMode = false
            pasteBuffer = ""

            emit("paste", content)

            if remaining.length > 0:
                process(remaining)
        return

    # === NORMAL SEQUENCE EXTRACTION ===
    result = extractCompleteSequences(buffer)
    buffer = result.remainder

    for seq in result.sequences:
        emit("data", seq)

    # === TIMEOUT FLUSH ===
    if buffer.length > 0:
        timeout = setTimeout(timeoutMs, function():
            flushed = flush()
            for seq in flushed:
                emit("data", seq)
        )
```

---

## Escape Sequence Timeout Handling

### The Ambiguity Problem

A single ESC byte (0x1B) could be:
1. The Escape key pressed alone
2. Start of a multi-byte escape sequence

### Timeout Strategy

```
TIMEOUT_MS = 10  # Milliseconds to wait for sequence completion

Timeline:
    0ms    - ESC byte arrives
    0-10ms - Wait for additional bytes
    10ms   - No more bytes? Emit ESC as keypress
           - More bytes? Parse as sequence
```

### Flush Behavior

```
function flush():
    if timeout:
        clearTimeout(timeout)
        timeout = null

    if buffer.length == 0:
        return []

    # Return buffer as-is when timeout expires
    # The incomplete sequence becomes raw input
    sequences = [buffer]
    buffer = ""
    return sequences
```

---

## Escape Sequence Classification

### Sequence Type Detection

```
function isCompleteSequence(data: string) -> "complete" | "incomplete" | "not-escape":
    if not data.startsWith(ESC):
        return "not-escape"

    if data.length == 1:
        return "incomplete"  # Just ESC, need more

    afterEsc = data[1:]

    # CSI: ESC [
    if afterEsc.startsWith("["):
        if afterEsc.startsWith("[M"):
            # Old-style mouse: ESC[M + 3 bytes
            return data.length >= 6 ? "complete" : "incomplete"
        return isCompleteCsiSequence(data)

    # OSC: ESC ]
    if afterEsc.startsWith("]"):
        return isCompleteOscSequence(data)

    # DCS: ESC P
    if afterEsc.startsWith("P"):
        return isCompleteDcsSequence(data)

    # APC: ESC _
    if afterEsc.startsWith("_"):
        return isCompleteApcSequence(data)

    # SS3: ESC O
    if afterEsc.startsWith("O"):
        return afterEsc.length >= 2 ? "complete" : "incomplete"

    # Meta key: ESC + single char
    if afterEsc.length == 1:
        return "complete"

    return "complete"  # Unknown, treat as complete
```

### CSI Sequence Parsing

CSI sequences: `ESC [ <params> <final_byte>`

Final byte range: 0x40-0x7E (@ through ~)

```
function isCompleteCsiSequence(data: string) -> "complete" | "incomplete":
    if not data.startsWith(ESC + "["):
        return "complete"

    if data.length < 3:
        return "incomplete"

    payload = data[2:]
    lastChar = payload[payload.length - 1]
    lastCode = lastChar.charCodeAt(0)

    # Check for final byte
    if lastCode >= 0x40 and lastCode <= 0x7E:
        # Special handling for SGR mouse
        if payload.startsWith("<"):
            # Format: <B;X;Y[Mm]
            if matches(payload, /^<\d+;\d+;\d+[Mm]$/):
                return "complete"
            if lastChar == "M" or lastChar == "m":
                parts = payload[1:-1].split(";")
                if parts.length == 3 and all(isDigits):
                    return "complete"
            return "incomplete"

        return "complete"

    return "incomplete"
```

### OSC/DCS/APC Sequence Parsing

These sequences use String Terminator (ST = ESC \ or BEL)

```
function isCompleteOscSequence(data: string) -> "complete" | "incomplete":
    # OSC: ESC ] ... ST
    if data.endsWith(ESC + "\\") or data.endsWith(BEL):
        return "complete"
    return "incomplete"

function isCompleteDcsSequence(data: string) -> "complete" | "incomplete":
    # DCS: ESC P ... ESC \
    if data.endsWith(ESC + "\\"):
        return "complete"
    return "incomplete"

function isCompleteApcSequence(data: string) -> "complete" | "incomplete":
    # APC: ESC _ ... ESC \  (Kitty graphics)
    if data.endsWith(ESC + "\\"):
        return "complete"
    return "incomplete"
```

---

## Bracketed Paste Protocol

### Protocol Description

Terminals wrap clipboard paste content in markers:
- Start: `\x1b[200~`
- End: `\x1b[201~`

### Enable/Disable Sequences

```
# Enable bracketed paste
echo -e "\x1b[?2004h"

# Disable bracketed paste
echo -e "\x1b[?2004l"
```

### Paste Content Handling

```
Pasted text: "Hello\nWorld"

Terminal sends:
    \x1b[200~Hello\nWorld\x1b[201~

StdinBuffer detects:
    1. Start marker at position 0
    2. Enters paste mode
    3. Buffers "Hello\nWorld"
    4. Detects end marker
    5. Emits paste event with content
```

### Edge Cases

```
# Paste arrives in chunks
Event 1: "\x1b[200~Hel"
Event 2: "lo\nWo"
Event 3: "rld\x1b[201~"

Buffer accumulates until end marker found.

# Input after paste
Event 1: "\x1b[200~text\x1b[201~more input"

After paste emit, "more input" processed recursively.
```

---

## Kitty Keyboard Protocol

### Protocol Overview

Modern keyboard protocol with features:
- Disambiguated escape codes
- Report event types (press/repeat/release)
- Report alternate keys (shifted, base layout)
- Support for all key combinations

### Enabling Kitty Protocol

```
# Query current flags
echo -e "\x1b[?u"

# Response (if supported): \x1b[?<flags>u

# Enable with flags (push)
# Flag 1: Disambiguate escape codes
# Flag 2: Report event types
# Flag 4: Report alternate keys
echo -e "\x1b[>7u"  # flags 1+2+4 = 7

# Disable (pop)
echo -e "\x1b[<u"
```

### CSI-u Format

```
Primary format:
    \x1b[<codepoint>u
    \x1b[<codepoint>;<modifier>u
    \x1b[<codepoint>;<modifier>:<event>u

With alternate keys (flag 4):
    \x1b[<codepoint>:<shifted>;<modifier>u
    \x1b[<codepoint>:<shifted>:<base>;<modifier>u
    \x1b[<codepoint>::<base>;<modifier>u

Examples:
    \x1b[97u           # 'a' key, no modifiers
    \x1b[97;5u         # Ctrl+a (modifier 5 = 4+1 shifted)
    \x1b[97;5:3u       # Ctrl+a release (event 3)
    \x1b[97:65;2u      # 'a' with shift (shifted key 'A' = 65)
```

### Modifier Encoding

```
┌─────────────┬───────┬──────────────────────────────┐
│  Modifier   │ Value │  Notes                       │
├─────────────┼───────┼──────────────────────────────┤
│  None       │   1   │  1-indexed (actual mod = 0)  │
│  Shift      │   2   │  actual: 1                   │
│  Alt        │   3   │  actual: 2                   │
│  Shift+Alt  │   4   │  actual: 3                   │
│  Ctrl       │   5   │  actual: 4                   │
│  Ctrl+Shift │   6   │  actual: 5                   │
│  Ctrl+Alt   │   7   │  actual: 6                   │
│  All three  │   8   │  actual: 7                   │
└─────────────┴───────┴──────────────────────────────┘

Lock keys add to modifier value:
    Caps Lock:  +64
    Num Lock:   +128

Mask for comparison: modifier & ~(64 + 128)
```

### Event Types (Flag 2)

```
┌─────────┬───────┬─────────────────────────────┐
│  Event  │ Value │  Description                │
├─────────┼───────┼─────────────────────────────┤
│  Press  │   1   │  Key pressed (default)      │
│  Repeat │   2   │  Key held/repeating         │
│  Release│   3   │  Key released               │
└─────────┴───────┴─────────────────────────────┘

Detection patterns:
    Release: ":3u", ":3~", ":3A", ":3B", ":3C", ":3D", ":3H", ":3F"
    Repeat:  ":2u", ":2~", ":2A", ":2B", ":2C", ":2D", ":2H", ":2F"
```

### Arrow/Function Key Encoding

```
Arrows with modifiers:
    \x1b[1;<mod>A    # Up
    \x1b[1;<mod>B    # Down
    \x1b[1;<mod>C    # Right
    \x1b[1;<mod>D    # Left
    \x1b[1;<mod>H    # Home
    \x1b[1;<mod>F    # End

With event type:
    \x1b[1;<mod>:<event>A

Functional keys:
    \x1b[<keynum>~
    \x1b[<keynum>;<mod>~
    \x1b[<keynum>;<mod>:<event>~
```

---

## Legacy Escape Sequence Handling

### Common Key Sequences

```
┌─────────────────┬────────────────────────────────────────────┐
│  Key            │  Sequences                                  │
├─────────────────┼────────────────────────────────────────────┤
│  Up             │  \x1b[A, \x1bOA                             │
│  Down           │  \x1b[B, \x1bOB                             │
│  Right          │  \x1b[C, \x1bOC                             │
│  Left           │  \x1b[D, \x1bOD                             │
│  Home           │  \x1b[H, \x1bOH, \x1b[1~, \x1b[7~           │
│  End            │  \x1b[F, \x1bOF, \x1b[4~, \x1b[8~           │
│  Insert         │  \x1b[2~                                    │
│  Delete         │  \x1b[3~                                    │
│  Page Up        │  \x1b[5~, \x1b[[5~                          │
│  Page Down      │  \x1b[6~, \x1b[[6~                          │
│  Clear          │  \x1b[E, \x1bOE                             │
│  F1             │  \x1bOP, \x1b[11~, \x1b[[A                  │
│  F2             │  \x1bOQ, \x1b[12~, \x1b[[B                  │
│  F3             │  \x1bOR, \x1b[13~, \x1b[[C                  │
│  F4             │  \x1bOS, \x1b[14~, \x1b[[D                  │
│  F5             │  \x1b[15~, \x1b[[E                          │
│  F6             │  \x1b[17~                                   │
│  F7             │  \x1b[18~                                   │
│  F8             │  \x1b[19~                                   │
│  F9             │  \x1b[20~                                   │
│  F10            │  \x1b[21~                                   │
│  F11            │  \x1b[23~                                   │
│  F12            │  \x1b[24~                                   │
└─────────────────┴────────────────────────────────────────────┘
```

### Legacy Shift Sequences

```
┌─────────────────┬─────────────────┐
│  Key            │  Sequence       │
├─────────────────┼─────────────────┤
│  Shift+Up       │  \x1b[a         │
│  Shift+Down     │  \x1b[b         │
│  Shift+Right    │  \x1b[c         │
│  Shift+Left     │  \x1b[d         │
│  Shift+Clear    │  \x1b[e         │
│  Shift+Insert   │  \x1b[2$        │
│  Shift+Delete   │  \x1b[3$        │
│  Shift+PageUp   │  \x1b[5$        │
│  Shift+PageDown │  \x1b[6$        │
│  Shift+Home     │  \x1b[7$        │
│  Shift+End      │  \x1b[8$        │
└─────────────────┴─────────────────┘
```

### Legacy Ctrl Sequences

```
┌─────────────────┬─────────────────┐
│  Key            │  Sequence       │
├─────────────────┼─────────────────┤
│  Ctrl+Up        │  \x1bOa         │
│  Ctrl+Down      │  \x1bOb         │
│  Ctrl+Right     │  \x1bOc         │
│  Ctrl+Left      │  \x1bOd         │
│  Ctrl+Clear     │  \x1bOe         │
│  Ctrl+Insert    │  \x1b[2^        │
│  Ctrl+Delete    │  \x1b[3^        │
│  Ctrl+PageUp    │  \x1b[5^        │
│  Ctrl+PageDown  │  \x1b[6^        │
│  Ctrl+Home      │  \x1b[7^        │
│  Ctrl+End       │  \x1b[8^        │
└─────────────────┴─────────────────┘
```

### Alt Sequences (Legacy)

```
Alt+letter in legacy mode: ESC + letter
    Alt+a = \x1ba
    Alt+z = \x1bz

Special alt sequences:
    Alt+Left  = \x1bb or \x1b[1;3D
    Alt+Right = \x1bf or \x1b[1;3C
    Alt+Up    = \x1bp
    Alt+Down  = \x1bn
```

---

## Modifier Key Detection

### Control Character Mapping

Ctrl+letter produces control characters via bitwise AND:

```
function rawCtrlChar(key: string) -> string | null:
    char = key.toLowerCase()
    code = char.charCodeAt(0)

    # Letters a-z (97-122)
    if code >= 97 and code <= 122:
        return chr(code & 0x1F)  # Mask to lower 5 bits

    # Brackets and backslash
    if char in ['[', '\\', ']', '_']:
        return chr(code & 0x1F)

    # Hyphen maps to underscore (same physical key)
    if char == '-':
        return chr(31)  # Same as Ctrl+_

    return null
```

### Control Character Table

```
┌─────────┬──────────┬──────────────────┐
│  Key    │  Code    │  Ctrl Character  │
├─────────┼──────────┼──────────────────┤
│  Ctrl+@ │    0     │  NUL             │
│  Ctrl+a │    1     │  SOH             │
│  Ctrl+b │    2     │  STX             │
│  Ctrl+c │    3     │  ETX (interrupt) │
│  Ctrl+d │    4     │  EOT             │
│  Ctrl+e │    5     │  ENQ             │
│  Ctrl+f │    6     │  ACK             │
│  Ctrl+g │    7     │  BEL             │
│  Ctrl+h │    8     │  BS (backspace)  │
│  Ctrl+i │    9     │  TAB             │
│  Ctrl+j │   10     │  LF (newline)    │
│  Ctrl+k │   11     │  VT              │
│  Ctrl+l │   12     │  FF              │
│  Ctrl+m │   13     │  CR (enter)      │
│  Ctrl+n │   14     │  SO              │
│  Ctrl+o │   15     │  SI              │
│  Ctrl+p │   16     │  DLE             │
│  Ctrl+q │   17     │  DC1             │
│  Ctrl+r │   18     │  DC2             │
│  Ctrl+s │   19     │  DC3             │
│  Ctrl+t │   20     │  DC4             │
│  Ctrl+u │   21     │  NAK             │
│  Ctrl+v │   22     │  SYN             │
│  Ctrl+w │   23     │  ETB             │
│  Ctrl+x │   24     │  CAN             │
│  Ctrl+y │   25     │  EM              │
│  Ctrl+z │   26     │  SUB (suspend)   │
│  Ctrl+[ │   27     │  ESC             │
│  Ctrl+\ │   28     │  FS              │
│  Ctrl+] │   29     │  GS              │
│  Ctrl+^ │   30     │  RS              │
│  Ctrl+_ │   31     │  US              │
└─────────┴──────────┴──────────────────┘
```

### Shift Detection

In legacy mode:
- Shift+letter = uppercase letter
- Shift+Tab = `\x1b[Z`
- Other shift combos require Kitty protocol

### Alt Detection

Legacy:
- Alt+letter = ESC + letter (`\x1b` + char)
- Alt+Enter = `\x1b\r`
- Alt+Space = `\x1b ` (ESC + space)
- Alt+Backspace = `\x1b\x7f` or `\x1b\x08`

---

## Special Key Codepoints

### Named Codepoints

```
┌───────────────┬────────────┬───────────────────────┐
│  Key          │  Codepoint │  Notes                │
├───────────────┼────────────┼───────────────────────┤
│  Escape       │     27     │  0x1B                 │
│  Tab          │      9     │  0x09                 │
│  Enter        │     13     │  0x0D (CR)            │
│  Space        │     32     │  0x20                 │
│  Backspace    │    127     │  0x7F (DEL)           │
│  Numpad Enter │  57414     │  Kitty protocol       │
└───────────────┴────────────┴───────────────────────┘
```

### Virtual Codepoints (Negative)

For keys without Unicode codepoints, use negative values:

```
┌───────────────┬────────────┐
│  Key          │  Codepoint │
├───────────────┼────────────┤
│  Up           │    -1      │
│  Down         │    -2      │
│  Right        │    -3      │
│  Left         │    -4      │
│  Delete       │   -10      │
│  Insert       │   -11      │
│  Page Up      │   -12      │
│  Page Down    │   -13      │
│  Home         │   -14      │
│  End          │   -15      │
└───────────────┴────────────┘
```

---

## Key Matching Algorithm

### Key Identifier Format

```
KeyId = BaseKey | ModifiedKey

BaseKey = Letter | SymbolKey | SpecialKey

Letter = "a".."z"
SymbolKey = "`" | "-" | "=" | "[" | "]" | "\\" | ";" | "'" |
            "," | "." | "/" | "!" | "@" | "#" | "$" | "%" |
            "^" | "&" | "*" | "(" | ")" | "_" | "+" | "|" |
            "~" | "{" | "}" | ":" | "<" | ">" | "?"

SpecialKey = "escape" | "esc" | "enter" | "return" | "tab" |
             "space" | "backspace" | "delete" | "insert" |
             "clear" | "home" | "end" | "pageUp" | "pageDown" |
             "up" | "down" | "left" | "right" |
             "f1".."f12"

ModifiedKey = Modifier "+" BaseKey
            | Modifier "+" Modifier "+" BaseKey
            | Modifier "+" Modifier "+" Modifier "+" BaseKey

Modifier = "ctrl" | "shift" | "alt"
```

### matchesKey Algorithm

```
function matchesKey(data: string, keyId: string) -> boolean:
    parsed = parseKeyId(keyId)
    if parsed == null: return false

    key = parsed.key
    ctrl = parsed.ctrl
    shift = parsed.shift
    alt = parsed.alt

    modifier = 0
    if shift: modifier |= 1
    if alt: modifier |= 2
    if ctrl: modifier |= 4

    # Switch on key type
    switch key:
        case "escape", "esc":
            if modifier != 0: return false
            return data == "\x1b" or matchesKittySequence(data, 27, 0)

        case "space":
            if kittyProtocolActive:
                if modifier == 0:
                    return data == " " or matchesKittySequence(data, 32, 0)
                return matchesKittySequence(data, 32, modifier)
            else:
                if ctrl and not alt and not shift:
                    return data == "\x00"  # NUL
                if alt and not ctrl and not shift:
                    return data == "\x1b "
                if modifier == 0:
                    return data == " "

        case "tab":
            if shift and not ctrl and not alt:
                return data == "\x1b[Z" or matchesKittySequence(data, 9, 1)
            if modifier == 0:
                return data == "\t" or matchesKittySequence(data, 9, 0)
            return matchesKittySequence(data, 9, modifier)

        case "enter", "return":
            if modifier == 0:
                return data == "\r" or
                       (not kittyProtocolActive and data == "\n") or
                       data == "\x1bOM" or  # SS3 M (numpad)
                       matchesKittySequence(data, 13, 0) or
                       matchesKittySequence(data, 57414, 0)  # numpad enter
            # ... modifier handling

        case "backspace":
            if alt and not ctrl and not shift:
                return data == "\x1b\x7f" or data == "\x1b\x08" or
                       matchesKittySequence(data, 127, 2)
            if modifier == 0:
                return data == "\x7f" or data == "\x08" or
                       matchesKittySequence(data, 127, 0)

        # Arrow keys
        case "up", "down", "left", "right":
            codepoint = ARROW_CODEPOINTS[key]
            if modifier == 0:
                return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES[key]) or
                       matchesKittySequence(data, codepoint, 0)
            return matchesLegacyModifierSequence(data, key, modifier) or
                   matchesKittySequence(data, codepoint, modifier)

        # Function keys
        case "f1".."f12":
            if modifier != 0: return false
            return matchesLegacySequence(data, LEGACY_KEY_SEQUENCES[key])

    # Single character keys (letters, symbols)
    if key.length == 1:
        codepoint = key.charCodeAt(0)
        rawCtrl = rawCtrlChar(key)

        # Legacy Ctrl+Alt handling
        if ctrl and alt and not shift and not kittyProtocolActive and rawCtrl:
            return data == ESC + rawCtrl

        # Legacy Alt+letter
        if alt and not ctrl and not shift and not kittyProtocolActive:
            if key >= 'a' and key <= 'z':
                if data == ESC + key: return true

        # Ctrl+key (legacy control character)
        if ctrl and not shift and not alt:
            if rawCtrl and data == rawCtrl: return true
            return matchesKittySequence(data, codepoint, 4)

        # Shift+key (uppercase in legacy)
        if shift and not ctrl and not alt:
            if data == key.toUpperCase(): return true
            return matchesKittySequence(data, codepoint, 1)

        # Unmodified
        if modifier == 0:
            return data == key or matchesKittySequence(data, codepoint, 0)

        return matchesKittySequence(data, codepoint, modifier)

    return false
```

### parseKey Algorithm

Returns normalized key identifier from raw input.

```
function parseKey(data: string) -> string | undefined:
    # Try Kitty protocol first
    kitty = parseKittySequence(data)
    if kitty:
        codepoint = kitty.baseLayoutKey ?? kitty.codepoint
        modifier = kitty.modifier & ~LOCK_MASK

        mods = []
        if modifier & 1: mods.push("shift")
        if modifier & 4: mods.push("ctrl")
        if modifier & 2: mods.push("alt")

        keyName = codepointToName(codepoint)
        if keyName:
            return mods.length > 0 ? mods.join("+") + "+" + keyName : keyName

    # Legacy sequence lookup
    if data in LEGACY_SEQUENCE_KEY_IDS:
        return LEGACY_SEQUENCE_KEY_IDS[data]

    # Single character matching
    if data == "\x1b": return "escape"
    if data == "\t": return "tab"
    if data == "\r": return "enter"
    if data == " ": return "space"
    if data == "\x7f" or data == "\x08": return "backspace"
    if data == "\x1b[Z": return "shift+tab"
    if data == "\x00": return "ctrl+space"

    # Ctrl+letter detection (1-26)
    if data.length == 1:
        code = data.charCodeAt(0)
        if code >= 1 and code <= 26:
            return "ctrl+" + chr(code + 96)  # 1 -> 'a'

    # Alt+letter (ESC + letter)
    if not kittyProtocolActive and data.length == 2 and data[0] == "\x1b":
        code = data.charCodeAt(1)
        if code >= 97 and code <= 122:
            return "alt+" + chr(code)

    # Printable characters
    if data.length == 1:
        code = data.charCodeAt(0)
        if code >= 32 and code <= 126:
            return data

    return undefined
```

---

## Key Release Detection

### Kitty Protocol Key Release

With flag 2 (report event types), releases include `:3` before final byte:

```
function isKeyRelease(data: string) -> boolean:
    # Don't treat paste content as release
    if data.includes("\x1b[200~"):
        return false

    # Check for release event marker
    releasePatterns = [":3u", ":3~", ":3A", ":3B", ":3C", ":3D", ":3H", ":3F"]
    for pattern in releasePatterns:
        if data.includes(pattern):
            return true

    return false

function isKeyRepeat(data: string) -> boolean:
    if data.includes("\x1b[200~"):
        return false

    repeatPatterns = [":2u", ":2~", ":2A", ":2B", ":2C", ":2D", ":2H", ":2F"]
    for pattern in repeatPatterns:
        if data.includes(pattern):
            return true

    return false
```

### Legacy Mode

No key release information available in legacy terminals.

---

## Input Queue Management

### Queue Interface

```
class InputQueue:
    queue: string[] = []
    processing: boolean = false

    push(sequence: string):
        queue.push(sequence)
        if not processing:
            processNext()

    processNext():
        if queue.length == 0:
            processing = false
            return

        processing = true
        sequence = queue.shift()

        # Async handler
        handleInput(sequence).then(() => processNext())
```

### Event Ordering

```
Events must be processed in order:
    1. Stdin data arrives
    2. Buffer accumulates
    3. Complete sequences extracted
    4. Events emitted in order
    5. Handler processes sequentially
```

---

## Debouncing and Throttling

### Render Throttling

```
class RenderThrottler:
    lastRender: number = 0
    pending: boolean = false
    minInterval: number = 16  # ~60fps

    requestRender():
        now = Date.now()
        elapsed = now - lastRender

        if elapsed >= minInterval:
            render()
            lastRender = now
        else if not pending:
            pending = true
            setTimeout(minInterval - elapsed, () => {
                pending = false
                render()
                lastRender = Date.now()
            })
```

### Input Debouncing

For search/filter inputs:

```
class InputDebouncer:
    timer: Timer | null = null
    delay: number = 150

    debounce(callback: () => void):
        if timer:
            clearTimeout(timer)
        timer = setTimeout(delay, callback)
```

---

## Testing Input Handling

### Unit Test Strategies

```
# Test sequence parsing
test "CSI sequence complete detection":
    assert isCompleteSequence("\x1b[A") == "complete"
    assert isCompleteSequence("\x1b[") == "incomplete"
    assert isCompleteSequence("\x1b[1;5A") == "complete"

# Test key matching
test "Ctrl+C matching":
    assert matchesKey("\x03", "ctrl+c") == true
    assert matchesKey("c", "ctrl+c") == false

# Test Kitty sequences
test "Kitty CSI-u parsing":
    assert parseKittySequence("\x1b[97;5u") == {
        codepoint: 97,
        modifier: 4,
        eventType: "press"
    }

# Test paste handling
test "Bracketed paste":
    buffer = StdinBuffer()
    events = []
    buffer.on("paste", (content) => events.push(content))

    buffer.process("\x1b[200~Hello World\x1b[201~")

    assert events == ["Hello World"]
```

### Integration Test Patterns

```
# Simulate chunked input
test "Partial escape sequence":
    buffer = StdinBuffer()
    sequences = []
    buffer.on("data", (seq) => sequences.push(seq))

    # Simulate split arrival
    buffer.process("\x1b")
    # Wait < timeout
    buffer.process("[A")

    assert sequences == ["\x1b[A"]

# Test timeout behavior
test "Escape key timeout":
    buffer = StdinBuffer({ timeout: 10 })
    sequences = []
    buffer.on("data", (seq) => sequences.push(seq))

    buffer.process("\x1b")

    # Wait > timeout
    await sleep(15)

    assert sequences == ["\x1b"]
```

### Mock Terminal for Testing

```
class MockTerminal:
    inputCallback: (data: string) => void

    simulateInput(data: string):
        inputCallback(data)

    simulateKeypress(keyId: string):
        sequence = keyIdToSequence(keyId)
        inputCallback(sequence)

    simulatePaste(content: string):
        inputCallback("\x1b[200~" + content + "\x1b[201~")
```

---

## Implementation Checklist

### StdinBuffer

- [ ] Buffer accumulation
- [ ] Sequence completion detection
- [ ] Timeout-based flush
- [ ] Bracketed paste detection
- [ ] Paste event emission
- [ ] High-byte conversion

### Key Parser

- [ ] Kitty CSI-u parsing
- [ ] Legacy sequence lookup
- [ ] Modifier extraction
- [ ] Event type detection
- [ ] Non-Latin keyboard support (base layout key)

### Key Matcher

- [ ] All special keys
- [ ] Modifier combinations
- [ ] Protocol-aware matching
- [ ] Legacy fallbacks

### Terminal Integration

- [ ] Raw mode enable/disable
- [ ] Kitty protocol query
- [ ] Bracketed paste enable/disable
- [ ] Protocol state tracking

---

## References

- [Kitty Keyboard Protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
- [XTerm Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html)
- [ANSI Escape Codes](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [VT100 User Guide](https://vt100.net/docs/vt100-ug/)
