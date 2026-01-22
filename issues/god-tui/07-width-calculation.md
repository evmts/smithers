# Width Calculation Engineering Specification

## Overview

Terminal width calculation determines how many monospace columns a string occupies. This is critical for:
- Text layout and alignment
- Word wrapping
- Cursor positioning
- UI component rendering
- Text truncation with ellipsis

The fundamental challenge: Unicode strings have no 1:1 mapping between bytes, code points, and visual width.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  String: "Hello 世界 👨‍👩‍👧"                                                    │
│  ───────────────────────────────────────────────────────                    │
│  Bytes:       23 (UTF-8)                                                    │
│  Code Points: 14 (U+0048...U+1F467)                                         │
│  Graphemes:   10 (H,e,l,l,o, ,世,界, ,👨‍👩‍👧)                                    │
│  Columns:     13 (5 + 1 + 4 + 1 + 2)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Core Algorithm: visibleWidth()

### 1.1 Algorithm Flow

```
INPUT: str (Unicode string, may contain ANSI escapes)
OUTPUT: width (integer column count)

┌────────────────────────────────────────────────────────────┐
│ 1. EMPTY CHECK                                              │
│    if len(str) == 0 → return 0                             │
├────────────────────────────────────────────────────────────┤
│ 2. ASCII FAST PATH                                          │
│    for each byte in str:                                    │
│      if byte < 0x20 OR byte > 0x7E → break, not pure ASCII │
│    if pure ASCII → return len(str)                         │
├────────────────────────────────────────────────────────────┤
│ 3. CACHE LOOKUP                                             │
│    if str in cache → return cache[str]                     │
├────────────────────────────────────────────────────────────┤
│ 4. PREPROCESSING                                            │
│    a. Tab expansion: "\t" → "   " (3 spaces)               │
│    b. Strip ANSI escape sequences                          │
│    c. Strip OSC 8 hyperlinks                               │
│    d. Strip APC sequences                                  │
├────────────────────────────────────────────────────────────┤
│ 5. GRAPHEME SEGMENTATION                                    │
│    for each grapheme in Segmenter.segment(clean):          │
│      width += graphemeWidth(grapheme)                      │
├────────────────────────────────────────────────────────────┤
│ 6. CACHE UPDATE (LRU eviction if full)                     │
│    cache[str] = width                                      │
│    return width                                            │
└────────────────────────────────────────────────────────────┘
```

### 1.2 ASCII Fast Path Optimization

Most terminal content is ASCII. Detect and short-circuit:

```
FUNCTION isPureAsciiPrintable(str):
  for i = 0 to len(str) - 1:
    code = charCodeAt(str, i)
    if code < 0x20 OR code > 0x7E:
      return false
  return true

OPTIMIZATION RATIONALE:
┌──────────────────────────────────────────────────────────┐
│ Range 0x20-0x7E = printable ASCII (space through tilde) │
│ Each character = exactly 1 column                        │
│ No grapheme segmentation needed                          │
│ No Unicode property lookups                              │
│ O(n) simple byte scan vs O(n * k) Unicode processing    │
└──────────────────────────────────────────────────────────┘
```

**ASCII Printable Range Reference:**
```
0x20 (32)  = SPACE
0x21 (33)  = !
...
0x7E (126) = ~

EXCLUDED:
0x00-0x1F = Control characters (C0)
0x7F      = DEL
0x80+     = Non-ASCII (UTF-8 continuation, extended chars)
```

---

## 2. Grapheme Segmentation

### 2.1 What is a Grapheme Cluster?

A grapheme cluster is the minimal unit of text that users perceive as a single character.

```
EXAMPLES OF MULTI-CODEPOINT GRAPHEMES:
┌────────────────────────────────────────────────────────────┐
│ Grapheme │ Codepoints                    │ Description     │
├──────────┼───────────────────────────────┼─────────────────┤
│ é        │ U+0065 + U+0301               │ e + combining ´ │
│ 한       │ U+1112 + U+1161 + U+11AB      │ Hangul jamo     │
│ 👨‍👩‍👧     │ U+1F468 + U+200D + U+1F469 + │ ZWJ family      │
│          │ U+200D + U+1F467              │                 │
│ 🏳️‍🌈     │ U+1F3F3 + U+FE0F + U+200D +  │ Rainbow flag    │
│          │ U+1F308                       │                 │
│ 👋🏽      │ U+1F44B + U+1F3FD             │ Wave + skin     │
└────────────────────────────────────────────────────────────┘
```

### 2.2 Segmentation API

Use the built-in `Intl.Segmenter` API (ECMA-402):

```
// Create shared instance (singleton pattern)
segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

// Usage
for segment in segmenter.segment(text):
  grapheme = segment.segment
  // process grapheme
```

**Why Intl.Segmenter:**
1. Implements UAX #29 (Unicode Text Segmentation)
2. Handles all grapheme cluster types
3. Updated with Unicode version of host environment
4. Zero-dependency, native performance

### 2.3 Grapheme Cluster Boundaries (UAX #29)

The segmenter handles these boundary rules:

```
GRAPHEME CLUSTER BREAK RULES (simplified):
┌──────────────────────────────────────────────────────────────────────┐
│ GB3:  CR × LF                    (CRLF is single cluster)            │
│ GB6:  L × (L|V|LV|LVT)          (Hangul syllable blocks)            │
│ GB7:  (LV|V) × (V|T)            (Hangul syllable blocks)            │
│ GB8:  (LVT|T) × T               (Hangul syllable blocks)            │
│ GB9:  × (Extend|ZWJ)            (Combining marks, ZWJ)              │
│ GB9a: × SpacingMark             (Spacing combining marks)           │
│ GB9b: Prepend ×                 (Prepend characters)                │
│ GB11: \p{Extended_Pictographic} Extend* ZWJ × \p{Extended_Pictographic} │
│ GB12: sot (RI RI)* RI × RI      (Regional indicator pairs = flags)  │
│ GB999: Any ÷ Any                (Otherwise, break)                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Single Grapheme Width Calculation

### 3.1 Algorithm: graphemeWidth()

```
FUNCTION graphemeWidth(segment):
  INPUT:  segment (single grapheme cluster string)
  OUTPUT: width (0, 1, or 2)

  ┌─────────────────────────────────────────────────────────┐
  │ STEP 1: Zero-Width Check                                │
  │   if matches zeroWidthRegex → return 0                  │
  │                                                         │
  │ STEP 2: Emoji Check (with pre-filter)                   │
  │   if couldBeEmoji(segment) AND matches RGI_Emoji:       │
  │     return 2                                            │
  │                                                         │
  │ STEP 3: Get Base Character                              │
  │   base = strip leading non-printing chars               │
  │   cp = first codepoint of base                          │
  │   if cp undefined → return 0                            │
  │                                                         │
  │ STEP 4: East Asian Width Lookup                         │
  │   width = eastAsianWidth(cp)                            │
  │                                                         │
  │ STEP 5: Trailing Halfwidth/Fullwidth Forms              │
  │   for each char in segment[1:]:                         │
  │     c = codepoint of char                               │
  │     if 0xFF00 ≤ c ≤ 0xFFEF:                             │
  │       width += eastAsianWidth(c)                        │
  │                                                         │
  │ return width                                            │
  └─────────────────────────────────────────────────────────┘
```

### 3.2 Zero-Width Character Detection

```
REGEX (Unicode property escapes):
/^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Mark}|\p{Surrogate})+$/v

BREAKDOWN:
┌────────────────────────────────────────────────────────────────────┐
│ Property                     │ Description                         │
├──────────────────────────────┼─────────────────────────────────────┤
│ Default_Ignorable_Code_Point │ Chars that should be ignored for   │
│                              │ rendering: soft hyphens, format    │
│                              │ controls, variation selectors      │
├──────────────────────────────┼─────────────────────────────────────┤
│ Control                      │ C0/C1 control characters (0x00-1F, │
│                              │ 0x7F, 0x80-9F)                      │
├──────────────────────────────┼─────────────────────────────────────┤
│ Mark                         │ Combining diacritical marks         │
│                              │ (accents, umlauts, etc.)            │
├──────────────────────────────┼─────────────────────────────────────┤
│ Surrogate                    │ UTF-16 surrogates (should not      │
│                              │ appear in well-formed strings)      │
└────────────────────────────────────────────────────────────────────┘
```

### 3.3 Leading Non-Printing Character Stripping

```
REGEX:
/^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]+/v

PURPOSE:
- Remove invisible prefix to find base visible character
- \p{Format} includes: ZWJ, ZWNJ, directional controls, etc.
- Needed because combining marks may precede base in malformed input
```

---

## 4. Emoji Width Detection

### 4.1 RGI Emoji (Recommended for General Interchange)

RGI emoji are the canonical set of emoji sequences that should be displayed as emoji:

```
REGEX:
/^\p{RGI_Emoji}$/v

RGI_EMOJI INCLUDES:
┌────────────────────────────────────────────────────────────────────┐
│ Type                  │ Example        │ Codepoints                │
├───────────────────────┼────────────────┼───────────────────────────┤
│ Basic emoji           │ 😀             │ U+1F600                   │
│ Emoji + VS16          │ ☺️             │ U+263A U+FE0F             │
│ Skin tone modifier    │ 👋🏽            │ U+1F44B U+1F3FD           │
│ ZWJ sequence          │ 👨‍💻            │ U+1F468 U+200D U+1F4BB    │
│ Flag sequence         │ 🇺🇸            │ U+1F1FA U+1F1F8           │
│ Keycap sequence       │ 1️⃣            │ U+0031 U+FE0F U+20E3      │
│ Tag sequence          │ 🏴󠁧󠁢󠁥󠁮󠁧󠁿            │ U+1F3F4 + tag codepoints  │
└────────────────────────────────────────────────────────────────────┘
```

### 4.2 Emoji Pre-Filter Optimization

The RGI_Emoji regex is expensive. Use a fast heuristic first:

```
FUNCTION couldBeEmoji(segment):
  cp = firstCodepoint(segment)

  // Check Unicode blocks that contain emoji
  if 0x1F000 ≤ cp ≤ 0x1FBFF:  // Emoji and Pictograph blocks
    return true
  if 0x2300 ≤ cp ≤ 0x23FF:   // Miscellaneous Technical
    return true
  if 0x2600 ≤ cp ≤ 0x27BF:   // Misc Symbols, Dingbats
    return true
  if 0x2B50 ≤ cp ≤ 0x2B55:   // Specific stars/circles
    return true
  if contains(segment, "\uFE0F"):  // Variation Selector 16 (emoji presentation)
    return true
  if len(segment) > 2:       // Multi-codepoint = likely ZWJ, skin tone, etc.
    return true

  return false

RATIONALE:
┌──────────────────────────────────────────────────────────────────┐
│ Most text is NOT emoji                                           │
│ couldBeEmoji() is O(1) - simple range checks                     │
│ RGI_Emoji regex is O(n) with large constant factor               │
│ Pre-filter rejects 99%+ of non-emoji graphemes cheaply           │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 Emoji Presentation Selector

```
VS15 (U+FE0E): Text presentation selector  → narrow (1 column)
VS16 (U+FE0F): Emoji presentation selector → wide (2 columns)

EXAMPLE:
☺ (U+263A)           → text style, 1 column (terminal-dependent)
☺️ (U+263A U+FE0F)   → emoji style, 2 columns
```

### 4.4 Why All RGI Emoji = Width 2

Terminals universally render emoji in 2-column cells:

```
┌───────────────────────────────────────────────────────────────────┐
│ Terminal grid is monospace → cell width = 1 em                   │
│ Emoji are square glyphs → need 2 cells for proper aspect ratio   │
│ This is consistent across: iTerm2, Terminal.app, Kitty, Alacritty│
│                                                                   │
│ Even complex ZWJ sequences like 👨‍👩‍👧‍👦 = 2 columns (not 8!)         │
│ The ZWJ sequence forms ONE grapheme cluster                       │
└───────────────────────────────────────────────────────────────────┘
```

---

## 5. East Asian Width Categories

### 5.1 UAX #11 Categories

From [Unicode Standard Annex #11](http://www.unicode.org/reports/tr11/):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Category │ Name       │ Width │ Description                                  │
├──────────┼────────────┼───────┼──────────────────────────────────────────────┤
│ F        │ Fullwidth  │ 2     │ Compatibility chars with <wide> decomposition│
│          │            │       │ e.g., Ａ (U+FF21) = fullwidth A              │
├──────────┼────────────┼───────┼──────────────────────────────────────────────┤
│ W        │ Wide       │ 2     │ Characters that are always wide              │
│          │            │       │ e.g., 中 (U+4E2D), 가 (U+AC00)               │
├──────────┼────────────┼───────┼──────────────────────────────────────────────┤
│ H        │ Halfwidth  │ 1     │ Compatibility halfwidth forms                │
│          │            │       │ e.g., ｶ (U+FF76) = halfwidth katakana       │
├──────────┼────────────┼───────┼──────────────────────────────────────────────┤
│ Na       │ Narrow     │ 1     │ Narrow in East Asian context                 │
│          │            │       │ e.g., Latin letters, Arabic numerals         │
├──────────┼────────────┼───────┼──────────────────────────────────────────────┤
│ N        │ Neutral    │ 1     │ Not East Asian, no East Asian width          │
│          │            │       │ e.g., Greek, Cyrillic, Hebrew                │
├──────────┼────────────┼───────┼──────────────────────────────────────────────┤
│ A        │ Ambiguous  │ 1*    │ Width depends on context                     │
│          │            │       │ e.g., Greek letters, some symbols            │
│          │            │       │ *Default narrow, wide in East Asian context  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 East Asian Width Lookup

```
FUNCTION eastAsianWidth(codepoint):
  // Returns 1 or 2 based on UAX #11 property

  category = lookupEastAsianWidthCategory(codepoint)

  switch category:
    case 'F', 'W':
      return 2
    case 'H', 'Na', 'N':
      return 1
    case 'A':
      return 1  // Default: treat ambiguous as narrow
      // Optional: return ambiguousAsWide ? 2 : 1

LOOKUP TABLE STRUCTURE (conceptual):
┌────────────────────────────────────────────────────────────────────┐
│ The Unicode data file EastAsianWidth.txt defines ranges:          │
│                                                                    │
│ 0000..001F    ; N  # Cc    [32] <control-0000>..<control-001F>    │
│ 0020          ; Na # Zs         SPACE                              │
│ 3400..4DBF    ; W  # Lo  [6592] CJK UNIFIED IDEOGRAPH-3400..      │
│ FF00..FF60    ; F  # Various    FULLWIDTH forms                   │
│ FF61..FFDC    ; H  # Various    HALFWIDTH forms                   │
│ ...                                                                │
│                                                                    │
│ Implementation uses binary search on ranges or precomputed lookup │
└────────────────────────────────────────────────────────────────────┘
```

### 5.3 Wide Character Ranges (Common)

```
CJK UNIFIED IDEOGRAPHS:
  U+4E00 - U+9FFF   (20,992 chars) - CJK Unified Ideographs
  U+3400 - U+4DBF   (6,592 chars)  - CJK Extension A
  U+20000 - U+2A6DF (42,720 chars) - CJK Extension B
  U+2A700 - U+2B739 (4,154 chars)  - CJK Extensions C-F

HANGUL:
  U+AC00 - U+D7AF   (11,184 chars) - Hangul Syllables
  U+1100 - U+11FF   (256 chars)    - Hangul Jamo

JAPANESE:
  U+3040 - U+309F   (96 chars)     - Hiragana
  U+30A0 - U+30FF   (96 chars)     - Katakana

FULLWIDTH FORMS:
  U+FF00 - U+FF60   (97 chars)     - Fullwidth ASCII, punctuation
  U+FFE0 - U+FFE6   (7 chars)      - Fullwidth symbols
```

### 5.4 Halfwidth/Fullwidth Forms Block

```
BLOCK: U+FF00 - U+FFEF

┌────────────────────────────────────────────────────────────────────┐
│ Range        │ Width │ Content                                     │
├──────────────┼───────┼─────────────────────────────────────────────┤
│ FF00 - FF5E  │ 2     │ Fullwidth ASCII (！ through ～)              │
│ FF5F - FF60  │ 2     │ Fullwidth brackets                          │
│ FF61 - FF64  │ 1     │ Halfwidth CJK punctuation                   │
│ FF65 - FF9F  │ 1     │ Halfwidth Katakana                          │
│ FFA0 - FFDC  │ 1     │ Halfwidth Hangul                            │
│ FFE0 - FFE6  │ 2     │ Fullwidth symbols (￠, ￡, ￥, etc.)          │
│ FFE8 - FFEE  │ 1     │ Halfwidth symbols                           │
└────────────────────────────────────────────────────────────────────┘

TRAILING HALFWIDTH/FULLWIDTH CHECK:
In graphemeWidth(), after getting base width, check if trailing
codepoints are in this block and add their widths.
```

---

## 6. ANSI Escape Sequence Handling

### 6.1 ANSI Escape Stripping Regex

```
SGR (Select Graphic Rendition) and cursor codes:
/\x1b\[[0-9;]*[mGKHJ]/g

BREAKDOWN:
\x1b     - ESC character (0x1B)
\[       - CSI introducer
[0-9;]*  - Parameters (numbers, semicolons)
[mGKHJ]  - Terminator:
           m = SGR (colors, styles)
           G = Cursor horizontal absolute
           K = Erase in line
           H = Cursor position
           J = Erase in display
```

### 6.2 OSC 8 Hyperlink Stripping

```
OSC 8 HYPERLINK FORMAT:
\x1b]8;;URL\x07  (open link)
\x1b]8;;\x07     (close link)

REGEX:
/\x1b\]8;;[^\x07]*\x07/g

BREAKDOWN:
\x1b\]   - OSC introducer (ESC ])
8;;      - Hyperlink command
[^\x07]* - URL (any chars except BEL)
\x07     - BEL terminator
```

### 6.3 APC Sequence Stripping

```
APC (Application Program Command) FORMAT:
\x1b_...\x07       (BEL terminated)
\x1b_...\x1b\\     (ST terminated)

REGEX:
/\x1b_[^\x07\x1b]*(?:\x07|\x1b\\)/g

USE CASES:
- Cursor markers
- Application-specific commands
- Terminal multiplexer integration
```

### 6.4 Tab Expansion

```
TAB HANDLING:
\t → "   " (3 spaces)

RATIONALE:
┌────────────────────────────────────────────────────────────────────┐
│ Tabs have variable width depending on cursor column                │
│ Standard tab stops are every 8 columns                             │
│ For width calculation, fixed expansion is simpler                  │
│ 3 spaces is a reasonable middle-ground approximation               │
│ More accurate: track column and expand to next tab stop            │
└────────────────────────────────────────────────────────────────────┘

ALTERNATIVE (column-aware):
FUNCTION expandTabs(str, tabWidth=8):
  result = ""
  column = 0
  for char in str:
    if char == '\t':
      spaces = tabWidth - (column % tabWidth)
      result += " " * spaces
      column += spaces
    else:
      result += char
      column += 1
  return result
```

---

## 7. ANSI Escape Code Extraction

### 7.1 extractAnsiCode() Algorithm

```
FUNCTION extractAnsiCode(str, pos):
  INPUT:  str (string), pos (index)
  OUTPUT: { code: string, length: int } | null

  if pos >= len(str) OR str[pos] != '\x1b':
    return null

  next = str[pos + 1]

  // CSI sequence: ESC [ ... <terminator>
  if next == '[':
    j = pos + 2
    while j < len(str) AND str[j] not in [m, G, K, H, J]:
      j++
    if j < len(str):
      return { code: str[pos:j+1], length: j+1-pos }
    return null

  // OSC sequence: ESC ] ... BEL or ESC ] ... ST
  if next == ']':
    j = pos + 2
    while j < len(str):
      if str[j] == '\x07':           // BEL terminator
        return { code: str[pos:j+1], length: j+1-pos }
      if str[j] == '\x1b' AND str[j+1] == '\\':  // ST terminator
        return { code: str[pos:j+2], length: j+2-pos }
      j++
    return null

  // APC sequence: ESC _ ... BEL or ESC _ ... ST
  if next == '_':
    j = pos + 2
    while j < len(str):
      if str[j] == '\x07':
        return { code: str[pos:j+1], length: j+1-pos }
      if str[j] == '\x1b' AND str[j+1] == '\\':
        return { code: str[pos:j+2], length: j+2-pos }
      j++
    return null

  return null
```

### 7.2 ANSI Sequence Types Reference

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Type │ Introducer │ Terminator   │ Example                  │ Purpose      │
├──────┼────────────┼──────────────┼──────────────────────────┼──────────────┤
│ CSI  │ ESC [      │ m,G,K,H,J,etc│ \x1b[31m                 │ SGR, cursor  │
│ OSC  │ ESC ]      │ BEL or ST    │ \x1b]8;;url\x07          │ Hyperlinks   │
│ APC  │ ESC _      │ BEL or ST    │ \x1b_marker\x07          │ App commands │
│ DCS  │ ESC P      │ ST           │ (not commonly used)      │ Device ctrl  │
│ PM   │ ESC ^      │ ST           │ (not commonly used)      │ Privacy msg  │
└────────────────────────────────────────────────────────────────────────────┘

ST (String Terminator) = ESC \ = \x1b\x5c
BEL = \x07
```

---

## 8. ANSI Style Tracking Across Slices

### 8.1 AnsiCodeTracker State Machine

When slicing text (for word wrap, truncation), ANSI styles must be preserved:

```
CLASS AnsiCodeTracker:
  STATE:
    bold: boolean = false
    dim: boolean = false
    italic: boolean = false
    underline: boolean = false
    blink: boolean = false
    inverse: boolean = false
    hidden: boolean = false
    strikethrough: boolean = false
    fgColor: string | null = null   // "31" or "38;5;240" or "38;2;R;G;B"
    bgColor: string | null = null   // "41" or "48;5;240" or "48;2;R;G;B"

  METHODS:
    process(ansiCode): updates state based on SGR codes
    reset(): clears all state
    getActiveCodes(): returns "\x1b[1;31m" etc. to restore current state
    hasActiveCodes(): returns true if any styling is active
    getLineEndReset(): returns reset for problematic attrs (underline)
```

### 8.2 SGR Code Processing

```
SGR CODES LOOKUP TABLE:
┌──────┬─────────────────────────────────────────────────────────────────────┐
│ Code │ Effect                                                              │
├──────┼─────────────────────────────────────────────────────────────────────┤
│ 0    │ Reset all attributes                                                │
│ 1    │ Bold/bright                                                         │
│ 2    │ Dim/faint                                                           │
│ 3    │ Italic                                                              │
│ 4    │ Underline                                                           │
│ 5    │ Blink                                                               │
│ 7    │ Inverse/reverse                                                     │
│ 8    │ Hidden                                                              │
│ 9    │ Strikethrough                                                       │
├──────┼─────────────────────────────────────────────────────────────────────┤
│ 21   │ Bold off (some terminals)                                           │
│ 22   │ Normal intensity (bold and dim off)                                 │
│ 23   │ Italic off                                                          │
│ 24   │ Underline off                                                       │
│ 25   │ Blink off                                                           │
│ 27   │ Inverse off                                                         │
│ 28   │ Hidden off                                                          │
│ 29   │ Strikethrough off                                                   │
├──────┼─────────────────────────────────────────────────────────────────────┤
│ 30-37│ Standard foreground colors                                          │
│ 38   │ Extended foreground (38;5;N or 38;2;R;G;B)                          │
│ 39   │ Default foreground                                                  │
│ 40-47│ Standard background colors                                          │
│ 48   │ Extended background (48;5;N or 48;2;R;G;B)                          │
│ 49   │ Default background                                                  │
│ 90-97│ Bright foreground colors                                            │
│100-107│ Bright background colors                                           │
└──────┴─────────────────────────────────────────────────────────────────────┘
```

### 8.3 Extended Color Parsing

```
256-COLOR MODE (38;5;N or 48;5;N):
  N = 0-7:     Standard colors
  N = 8-15:    Bright colors
  N = 16-231:  6×6×6 color cube
  N = 232-255: Grayscale (24 shades)

TRUE COLOR MODE (38;2;R;G;B or 48;2;R;G;B):
  R, G, B = 0-255 each

PARSING ALGORITHM:
  parts = params.split(';')
  if parts[i] == 38 or 48:
    if parts[i+1] == '5' and parts[i+2] exists:
      // 256-color: consume 3 params
      colorCode = join(parts[i:i+3], ';')
      i += 3
    else if parts[i+1] == '2' and parts[i+4] exists:
      // True color: consume 5 params
      colorCode = join(parts[i:i+5], ';')
      i += 5
```

### 8.4 Line-End Reset Strategy

```
PROBLEM:
Underline bleeds into padding when word wrapping:
  "Hello\x1b[4mWorld\x1b[0m"  wrapped at column 10 with padding
  becomes:
  "Hello\x1b[4mWorl    " ← underline extends through padding!

SOLUTION:
At line breaks, reset only underline (not full reset):
  getLineEndReset() → "\x1b[24m" if underline active, else ""

WHY NOT FULL RESET:
- Background colors should extend through padding (intentional)
- Bold, italic don't visually bleed
- Only underline causes visual artifacts
```

---

## 9. Column-Based Text Slicing

### 9.1 sliceByColumn() Algorithm

```
FUNCTION sliceByColumn(line, startCol, length, strict=false):
  INPUT:
    line:     source string (may contain ANSI codes)
    startCol: starting column (0-indexed)
    length:   number of columns to extract
    strict:   if true, exclude wide chars that would extend past range

  OUTPUT: extracted substring with ANSI codes preserved

  ┌────────────────────────────────────────────────────────────────────┐
  │ if length <= 0 → return ""                                        │
  │ endCol = startCol + length                                        │
  │ result = ""                                                       │
  │ currentCol = 0                                                    │
  │ pendingAnsi = ""                                                  │
  │                                                                    │
  │ while i < len(line):                                              │
  │   // Check for ANSI code at current position                      │
  │   ansi = extractAnsiCode(line, i)                                 │
  │   if ansi:                                                        │
  │     if currentCol >= startCol AND currentCol < endCol:            │
  │       result += ansi.code  // Include ANSI in output              │
  │     else if currentCol < startCol:                                │
  │       pendingAnsi += ansi.code  // Save for later                 │
  │     i += ansi.length                                              │
  │     continue                                                      │
  │                                                                    │
  │   // Find next ANSI code or end of string                         │
  │   textEnd = findNextAnsiOrEnd(line, i)                            │
  │                                                                    │
  │   // Process graphemes in this text portion                       │
  │   for grapheme in segment(line[i:textEnd]):                       │
  │     w = graphemeWidth(grapheme)                                   │
  │     inRange = currentCol >= startCol AND currentCol < endCol      │
  │     fits = NOT strict OR currentCol + w <= endCol                 │
  │                                                                    │
  │     if inRange AND fits:                                          │
  │       if pendingAnsi:                                             │
  │         result += pendingAnsi                                     │
  │         pendingAnsi = ""                                          │
  │       result += grapheme                                          │
  │                                                                    │
  │     currentCol += w                                               │
  │     if currentCol >= endCol: break                                │
  │                                                                    │
  │   i = textEnd                                                     │
  │   if currentCol >= endCol: break                                  │
  │                                                                    │
  │ return result                                                     │
  └────────────────────────────────────────────────────────────────────┘
```

### 9.2 Wide Character Boundary Handling

```
STRICT MODE EXAMPLE:
  line = "A中B"  (columns: A=0, 中=1-2, B=3)
  sliceByColumn(line, 0, 2, strict=false) → "A中"  (width=3, exceeds)
  sliceByColumn(line, 0, 2, strict=true)  → "A"    (width=1, fits)

DIAGRAM:
  Column:  0   1   2   3
           ┌───┬───────┬───┐
           │ A │   中  │ B │
           └───┴───────┴───┘
                 ↑       ↑
            width=2  width=1

  Request: startCol=0, length=2 (columns 0-1)
  Non-strict: "中" starts at col 1, include it (even though extends to col 2)
  Strict: "中" would extend to col 2, exclude it
```

### 9.3 extractSegments() for Overlay Compositing

```
FUNCTION extractSegments(line, beforeEnd, afterStart, afterLen, strictAfter):
  PURPOSE: Extract "before" and "after" segments in single pass
           Used when overlaying content: [before][overlay][after]

  OUTPUT: {
    before:      string,    // Content from col 0 to beforeEnd
    beforeWidth: int,       // Actual width of before
    after:       string,    // Content from afterStart for afterLen columns
    afterWidth:  int        // Actual width of after
  }

  KEY FEATURE: "after" inherits styling from content before the overlay

  EXAMPLE:
    line = "\x1b[31mRed text here\x1b[0m"
    extractSegments(line, 4, 10, 5)
    → before = "\x1b[31mRed "
    → after = "\x1b[31m here" (inherits red color!)
```

---

## 10. Word Wrap Algorithm

### 10.1 wrapTextWithAnsi() Overview

```
FUNCTION wrapTextWithAnsi(text, width):
  INPUT:  text (may contain ANSI, newlines), width (max columns)
  OUTPUT: array of wrapped lines

  ┌────────────────────────────────────────────────────────────────────┐
  │ 1. Split on literal newlines                                      │
  │ 2. Process each line independently                                │
  │ 3. Track ANSI state across lines (styles carry over)              │
  │ 4. For each line, call wrapSingleLine()                          │
  │ 5. Prepend active ANSI codes to continuation lines                │
  └────────────────────────────────────────────────────────────────────┘
```

### 10.2 wrapSingleLine() Algorithm

```
FUNCTION wrapSingleLine(line, width):
  if visibleWidth(line) <= width:
    return [line]

  wrapped = []
  tracker = new AnsiCodeTracker()
  tokens = splitIntoTokensWithAnsi(line)

  currentLine = ""
  currentWidth = 0

  for token in tokens:
    tokenWidth = visibleWidth(token)
    isWhitespace = token.trim() == ""

    // Token too long - break by grapheme
    if tokenWidth > width AND NOT isWhitespace:
      if currentLine:
        wrapped.append(currentLine + tracker.getLineEndReset())
        currentLine = ""
        currentWidth = 0

      broken = breakLongWord(token, width, tracker)
      wrapped.extend(broken[:-1])
      currentLine = broken[-1]
      currentWidth = visibleWidth(currentLine)
      continue

    // Would exceed width - wrap
    if currentWidth + tokenWidth > width AND currentWidth > 0:
      wrapped.append(currentLine.trimEnd() + tracker.getLineEndReset())
      if isWhitespace:
        currentLine = tracker.getActiveCodes()
        currentWidth = 0
      else:
        currentLine = tracker.getActiveCodes() + token
        currentWidth = tokenWidth
    else:
      currentLine += token
      currentWidth += tokenWidth

    updateTrackerFromText(token, tracker)

  if currentLine:
    wrapped.append(currentLine)

  return wrapped.map(line => line.trimEnd())
```

### 10.3 Token Splitting with ANSI Preservation

```
FUNCTION splitIntoTokensWithAnsi(text):
  PURPOSE: Split into words/whitespace while keeping ANSI attached

  tokens = []
  current = ""
  pendingAnsi = ""
  inWhitespace = false

  for i in text:
    // Extract any ANSI code
    ansi = extractAnsiCode(text, i)
    if ansi:
      pendingAnsi += ansi.code
      continue

    char = text[i]
    charIsSpace = char == ' '

    // Token boundary: whitespace <-> non-whitespace
    if charIsSpace != inWhitespace AND current:
      tokens.append(current)
      current = ""

    // Attach pending ANSI to this char
    if pendingAnsi:
      current += pendingAnsi
      pendingAnsi = ""

    inWhitespace = charIsSpace
    current += char

  // Handle trailing ANSI codes
  if pendingAnsi:
    current += pendingAnsi

  if current:
    tokens.append(current)

  return tokens

EXAMPLE:
  Input:  "\x1b[31mHello \x1b[32mWorld\x1b[0m"
  Output: ["\x1b[31mHello", " ", "\x1b[32mWorld\x1b[0m"]
```

### 10.4 Breaking Long Words

```
FUNCTION breakLongWord(word, width, tracker):
  lines = []
  currentLine = tracker.getActiveCodes()
  currentWidth = 0

  // Separate ANSI from graphemes
  segments = []
  for i in word:
    ansi = extractAnsiCode(word, i)
    if ansi:
      segments.append({ type: "ansi", value: ansi.code })
    else:
      for grapheme in segment(word[i:nextAnsiOrEnd]):
        segments.append({ type: "grapheme", value: grapheme })

  // Process segments
  for seg in segments:
    if seg.type == "ansi":
      currentLine += seg.value
      tracker.process(seg.value)
      continue

    grapheme = seg.value
    gWidth = visibleWidth(grapheme)

    if currentWidth + gWidth > width:
      lines.append(currentLine + tracker.getLineEndReset())
      currentLine = tracker.getActiveCodes()
      currentWidth = 0

    currentLine += grapheme
    currentWidth += gWidth

  if currentLine:
    lines.append(currentLine)

  return lines or [""]
```

---

## 11. Truncation with Ellipsis

### 11.1 truncateToWidth() Algorithm

```
FUNCTION truncateToWidth(text, maxWidth, ellipsis="...", pad=false):
  textWidth = visibleWidth(text)

  if textWidth <= maxWidth:
    if pad:
      return text + " " * (maxWidth - textWidth)
    return text

  ellipsisWidth = visibleWidth(ellipsis)
  targetWidth = maxWidth - ellipsisWidth

  if targetWidth <= 0:
    return ellipsis[0:maxWidth]

  // Separate ANSI from graphemes (same as breakLongWord)
  segments = extractSegmentsFromText(text)

  // Build truncated result
  result = ""
  currentWidth = 0

  for seg in segments:
    if seg.type == "ansi":
      result += seg.value
      continue

    gWidth = visibleWidth(seg.value)
    if currentWidth + gWidth > targetWidth:
      break

    result += seg.value
    currentWidth += gWidth

  // Add reset before ellipsis to prevent style leaking
  truncated = result + "\x1b[0m" + ellipsis

  if pad:
    return truncated + " " * (maxWidth - visibleWidth(truncated))
  return truncated
```

---

## 12. Caching Strategies

### 12.1 Width Cache Design

```
CACHE PARAMETERS:
  WIDTH_CACHE_SIZE = 512  // Max entries

STRUCTURE:
  widthCache = Map<string, number>

EVICTION: FIFO (First-In-First-Out)
  When cache is full, delete oldest entry:
    firstKey = cache.keys().next().value
    cache.delete(firstKey)

WHY FIFO OVER LRU:
  - Simpler implementation
  - Good enough for terminal text (temporal locality)
  - Avoids overhead of tracking access times
```

### 12.2 When to Cache

```
CACHE DECISION TREE:
┌────────────────────────────────────────────────────────────────────┐
│ Is string empty?                                                   │
│   YES → return 0, don't cache                                     │
│                                                                    │
│ Is string pure ASCII printable?                                    │
│   YES → return len(str), don't cache (O(1) to compute)            │
│                                                                    │
│ Is string in cache?                                                │
│   YES → return cached value                                        │
│                                                                    │
│ Compute width (expensive)                                          │
│ Add to cache (with eviction if full)                              │
│ Return width                                                       │
└────────────────────────────────────────────────────────────────────┘
```

### 12.3 Segmenter Instance Pooling

```
SINGLETON PATTERN:
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

  function getSegmenter():
    return segmenter

RATIONALE:
  - Intl.Segmenter instantiation is expensive
  - Same segmenter works for all locales with "grapheme" granularity
  - Thread-safe in JavaScript (single-threaded)
```

### 12.4 AnsiCodeTracker Pooling

```
POOLED INSTANCE:
  const pooledStyleTracker = new AnsiCodeTracker()

USAGE IN extractSegments():
  pooledStyleTracker.clear()  // Reset state
  // Use pooledStyleTracker instead of new AnsiCodeTracker()

BENEFIT:
  - Avoids allocation per function call
  - Clear() is O(1) vs constructor overhead
```

---

## 13. Unicode Normalization Considerations

### 13.1 NFC vs NFD

```
NORMALIZATION FORMS:
┌────────────────────────────────────────────────────────────────────┐
│ Form │ Name                  │ Example         │ Codepoints        │
├──────┼───────────────────────┼─────────────────┼───────────────────┤
│ NFC  │ Composed              │ é               │ U+00E9            │
│ NFD  │ Decomposed            │ é               │ U+0065 U+0301     │
│ NFKC │ Compatibility Composed│ ﬁ → fi          │ (ligature expand) │
│ NFKD │ Compatibility Decomp. │ ﬁ → fi          │ (ligature expand) │
└────────────────────────────────────────────────────────────────────┘
```

### 13.2 Impact on Width Calculation

```
GRAPHEME SEGMENTATION HANDLES NORMALIZATION:
  Both "é" (NFC) and "e\u0301" (NFD) segment to ONE grapheme
  → Width calculation is normalization-agnostic

POTENTIAL ISSUE:
  Cache key sensitivity:
    NFC "é" and NFD "e\u0301" are different strings
    → Different cache entries for same visual result

OPTIONAL OPTIMIZATION:
  Normalize before caching:
    cleanStr = str.normalize('NFC')
    if cache.has(cleanStr): return cache.get(cleanStr)

  Trade-off: Normalization cost vs cache hit rate
```

### 13.3 Canonical Equivalence

```
CANONICALLY EQUIVALENT STRINGS:
  "Ω" (U+03A9 Greek Capital Omega)
  "Ω" (U+2126 Ohm Sign)
  → NFKC normalizes both to U+03A9

FOR WIDTH CALCULATION:
  Both have same East Asian Width (Neutral/Narrow)
  No practical difference
```

---

## 14. Edge Cases and Special Characters

### 14.1 Zero-Width Joiner (ZWJ) Sequences

```
U+200D ZERO WIDTH JOINER

EXAMPLES:
  👨‍💻 = U+1F468 U+200D U+1F4BB (man + ZWJ + computer)
  👩‍👩‍👧 = U+1F469 U+200D U+1F469 U+200D U+1F467

WIDTH: 2 columns (single grapheme cluster)

DETECTION:
  segment.length > 2 triggers couldBeEmoji()
  RGI_Emoji regex confirms
```

### 14.2 Regional Indicator Sequences (Flags)

```
FLAG CONSTRUCTION:
  Two Regional Indicator letters form a flag
  🇺🇸 = U+1F1FA (RI U) + U+1F1F8 (RI S)
  🇬🇧 = U+1F1EC (RI G) + U+1F1E7 (RI B)

REGIONAL INDICATOR RANGE:
  U+1F1E6 (A) through U+1F1FF (Z)

WIDTH: 2 columns per flag (single grapheme cluster)

INVALID PAIRS:
  Odd number of RIs or non-existent country codes
  Still segment as graphemes, but may render as placeholder
```

### 14.3 Skin Tone Modifiers

```
MODIFIER RANGE:
  U+1F3FB (Light skin)
  U+1F3FC (Medium-light)
  U+1F3FD (Medium)
  U+1F3FE (Medium-dark)
  U+1F3FF (Dark skin)

EXAMPLE:
  👋🏽 = U+1F44B + U+1F3FD

WIDTH: 2 columns (modifies preceding emoji)
```

### 14.4 Variation Selectors

```
VS15 (U+FE0E): Text presentation (narrow)
VS16 (U+FE0F): Emoji presentation (wide)

EXAMPLE:
  ☺ (U+263A) alone → ambiguous, typically 1 column
  ☺︎ (U+263A U+FE0E) → text style, 1 column
  ☺️ (U+263A U+FE0F) → emoji style, 2 columns
```

### 14.5 Control Characters

```
HANDLING:
  Control chars (0x00-0x1F, 0x7F) → 0 width
  They're invisible or cause cursor movement
  zeroWidthRegex catches these via \p{Control}

SPECIAL CASES:
  \x1b (ESC) → triggers ANSI escape parsing
  \t (TAB) → expanded to spaces BEFORE grapheme processing
  \n (LF), \r (CR) → typically handled by caller (line splitting)
```

### 14.6 Private Use Area (PUA)

```
PUA RANGES:
  U+E000 - U+F8FF   (BMP Private Use)
  U+F0000 - U+FFFFD (Supplementary PUA-A)
  U+100000 - U+10FFFD (Supplementary PUA-B)

WIDTH:
  East Asian Width = Neutral (N) → 1 column
  BUT: font-dependent, may render as any width
  No reliable way to determine actual width
```

---

## 15. Performance Considerations

### 15.1 Complexity Analysis

```
visibleWidth(str):
  ASCII fast path:  O(n) where n = string length
  Unicode path:     O(n * g) where g = grapheme segmentation cost

graphemeWidth(segment):
  O(k) where k = codepoints in grapheme (typically 1-10)
  Regex tests: O(k) each

Overall: O(n) amortized with caching
```

### 15.2 Optimization Priorities

```
HIGH IMPACT:
1. ASCII fast path (most common case)
2. Width cache (avoid recomputation)
3. couldBeEmoji pre-filter (avoid expensive RGI regex)
4. Singleton Segmenter (avoid instantiation)

MEDIUM IMPACT:
5. Pooled AnsiCodeTracker
6. FIFO cache eviction (simpler than LRU)

LOW IMPACT:
7. Unicode normalization (rarely affects results)
8. Tab expansion method (fixed vs column-aware)
```

### 15.3 Memory Considerations

```
CACHE SIZE TRADE-OFF:
  SIZE = 512 entries

  Each entry: string key + number value
  Typical string: 20-100 chars = 40-200 bytes
  Total cache: ~50KB - 100KB

  Larger cache = more hits, more memory
  Smaller cache = fewer hits, less memory
  512 is reasonable for terminal applications
```

---

## 16. Testing Recommendations

### 16.1 Test Categories

```
1. BASIC FUNCTIONALITY:
   - Empty string → 0
   - ASCII printable → len(str)
   - Single wide char → 2
   - Mixed ASCII + wide → sum of widths

2. GRAPHEME CLUSTERS:
   - Combining marks (é = e + ́)
   - ZWJ sequences (👨‍💻)
   - Flag sequences (🇺🇸)
   - Skin tone modifiers (👋🏽)

3. ANSI ESCAPES:
   - SGR codes stripped
   - Hyperlinks stripped
   - Cursor codes stripped
   - Nested codes handled

4. EDGE CASES:
   - Zero-width characters
   - Control characters
   - Tab expansion
   - Very long strings
   - Surrogate pairs

5. WORD WRAP:
   - Fits on one line
   - Breaks at word boundary
   - Breaks long word
   - Preserves ANSI across breaks
   - Handles trailing whitespace

6. SLICING:
   - Column boundaries
   - Wide char at boundary (strict vs non-strict)
   - ANSI preservation
   - Empty slice
```

### 16.2 Test Vectors

```
BASIC:
  "" → 0
  "Hello" → 5
  "世界" → 4
  "Hello世界" → 9

GRAPHEMES:
  "é" (NFC) → 1
  "e\u0301" (NFD) → 1
  "👨‍💻" → 2
  "🇺🇸" → 2
  "👋🏽" → 2
  "👨‍👩‍👧‍👦" → 2

ANSI:
  "\x1b[31mRed\x1b[0m" → 3
  "\x1b]8;;url\x07Link\x1b]8;;\x07" → 4

ZERO-WIDTH:
  "\u200B" (ZWSP) → 0
  "\u200D" (ZWJ) → 0
  "\uFEFF" (BOM) → 0

TABS:
  "\t" → 3 (with 3-space expansion)
  "A\tB" → 5
```

---

## 17. Implementation Checklist

```
□ visibleWidth() function
  □ Empty string check
  □ ASCII fast path
  □ Cache lookup/update
  □ Tab expansion
  □ ANSI stripping
  □ Grapheme segmentation
  □ graphemeWidth() for each segment

□ graphemeWidth() function
  □ Zero-width check
  □ Emoji pre-filter
  □ RGI emoji regex
  □ Leading non-printing stripping
  □ East Asian Width lookup
  □ Trailing halfwidth/fullwidth handling

□ extractAnsiCode() function
  □ CSI sequences
  □ OSC sequences
  □ APC sequences

□ AnsiCodeTracker class
  □ All SGR attributes
  □ 256-color parsing
  □ True color parsing
  □ Reset handling
  □ getActiveCodes()
  □ getLineEndReset()

□ sliceByColumn() function
  □ ANSI preservation
  □ Grapheme-aware slicing
  □ Strict mode for wide chars

□ wrapTextWithAnsi() function
  □ Newline handling
  □ Token splitting
  □ Word boundary detection
  □ Long word breaking
  □ ANSI state preservation
  □ Trailing whitespace trimming

□ truncateToWidth() function
  □ Ellipsis handling
  □ ANSI reset before ellipsis
  □ Optional padding

□ Caching infrastructure
  □ LRU/FIFO eviction
  □ Size limits
  □ Singleton Segmenter
```

---

## References

- [UAX #11: East Asian Width](http://www.unicode.org/reports/tr11/) - Unicode Standard Annex
- [UAX #29: Unicode Text Segmentation](https://unicode.org/reports/tr29/) - Grapheme cluster rules
- [get-east-asian-width](https://github.com/sindresorhus/get-east-asian-width) - npm package for EAW lookup
- [Grapheme Clusters and Terminal Emulators](https://mitchellh.com/writing/grapheme-clusters-in-terminals) - Mitchell Hashimoto
- [Intl.Segmenter MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter) - ECMAScript API
- [ECMA-402 Intl.Segmenter](https://tc39.es/proposal-intl-segmenter/) - TC39 proposal
- [ECMA-262 RegExp Unicode Property Escapes](https://tc39.es/ecma262/#sec-runtime-semantics-unicodematchproperty-p) - \p{} syntax
