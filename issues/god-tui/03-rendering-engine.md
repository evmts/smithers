# Rendering Engine: Complete Engineering Specification

Language-agnostic spec for differential terminal rendering. Based on reverse-engineering pi-mono TUI.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Render Loop State Machine](#render-loop-state-machine)
3. [Differential Rendering Algorithm](#differential-rendering-algorithm)
4. [Line Comparison Strategy](#line-comparison-strategy)
5. [Viewport Management](#viewport-management)
6. [Cursor Position Extraction](#cursor-position-extraction)
7. [Line Reset Strategy](#line-reset-strategy)
8. [Synchronized Output](#synchronized-output)
9. [Performance Optimizations](#performance-optimizations)
10. [Flicker Prevention](#flicker-prevention)
11. [Image Handling](#image-handling)
12. [Debug/Logging Strategies](#debuglogging-strategies)
13. [Edge Cases](#edge-cases)
14. [Implementation Pseudocode](#implementation-pseudocode)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RENDER PIPELINE                                    │
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │   Component  │───▶│   Overlay    │───▶│   Cursor     │───▶│   Line    │ │
│  │   Render     │    │  Compositing │    │  Extraction  │    │   Reset   │ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘ │
│         │                                                            │       │
│         │         ┌─────────────────────────────────────────────────┘       │
│         │         │                                                          │
│         ▼         ▼                                                          │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────┐  │
│  │   Differential      │───▶│   Synchronized      │───▶│   Terminal      │  │
│  │   Comparison        │    │   Output Buffer     │    │   Write         │  │
│  └─────────────────────┘    └─────────────────────┘    └─────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Core Data Structures

```
RendererState {
  previousLines: string[]       // Last rendered content
  previousWidth: int            // Terminal width at last render
  cursorRow: int                // Logical cursor (end of content)
  hardwareCursorRow: int        // Actual terminal cursor position
  maxLinesRendered: int         // Track terminal working area
  renderRequested: bool         // Coalesce multiple requests
}
```

---

## Render Loop State Machine

```
                    ┌──────────────────┐
                    │  IDLE            │
                    │  (waiting for    │
                    │   render request)│
                    └────────┬─────────┘
                             │
                             │ requestRender()
                             ▼
                    ┌──────────────────┐
                    │  SCHEDULED       │
                    │  (nextTick       │
                    │   pending)       │
                    └────────┬─────────┘
                             │
                             │ nextTick fires
                             ▼
           ┌─────────────────┴─────────────────┐
           │            doRender()              │
           └─────────────────┬─────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ FIRST_RENDER  │   │ WIDTH_CHANGED │   │ INCREMENTAL   │
│ (no previous) │   │ (full clear)  │   │ (diff update) │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
                   ┌──────────────────┐
                   │  UPDATE STATE    │
                   │  - previousLines │
                   │  - cursorRow     │
                   │  - maxLines      │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │  POSITION CURSOR │
                   │  (for IME)       │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │  IDLE            │
                   └──────────────────┘
```

### Request Coalescing

Multiple render requests within same tick coalesce into single render:

```
requestRender(force = false):
  if force:
    // Hard reset - clear all state
    previousLines = []
    previousWidth = -1
    cursorRow = 0
    hardwareCursorRow = 0
    maxLinesRendered = 0

  if renderRequested:
    return  // Already scheduled

  renderRequested = true
  process.nextTick(() => {
    renderRequested = false
    doRender()
  })
```

**Rationale**: Components may trigger multiple state changes in single event handler. Deferring to nextTick batches updates into one render cycle.

---

## Differential Rendering Algorithm

### Phase 1: Content Generation

```
doRender():
  width = terminal.columns
  height = terminal.rows

  // 1. Render component tree
  newLines = container.render(width)

  // 2. Composite overlays (if any)
  if overlayStack.notEmpty:
    newLines = compositeOverlays(newLines, width, height)

  // 3. Extract cursor position (before line resets)
  cursorPos = extractCursorPosition(newLines)

  // 4. Apply line reset sequences
  newLines = applyLineResets(newLines)
```

### Phase 2: Render Path Selection

```
  // Path A: First render (no previous content)
  if previousLines.empty and not widthChanged:
    fullRender(newLines, clear=false)
    return

  // Path B: Width changed (must clear screen)
  if previousWidth != 0 and previousWidth != width:
    fullRender(newLines, clear=true)
    return

  // Path C: Incremental update
  incrementalRender(newLines, width, height)
```

### Phase 3: Change Detection

```
incrementalRender(newLines, width, height):
  firstChanged = -1
  lastChanged = -1
  maxLen = max(newLines.length, previousLines.length)

  for i in 0..maxLen:
    oldLine = previousLines[i] if i < previousLines.length else ""
    newLine = newLines[i] if i < newLines.length else ""

    if oldLine != newLine:
      if firstChanged == -1:
        firstChanged = i
      lastChanged = i

  // No changes - just update cursor
  if firstChanged == -1:
    positionHardwareCursor(cursorPos, newLines.length)
    return
```

### Phase 4: Viewport Bounds Check

```
  // Changes only in deleted lines (below new content)
  if firstChanged >= newLines.length:
    handleDeletedLines(newLines, cursorPos)
    return

  // Changes above viewport - must full render
  viewportTop = max(0, maxLinesRendered - height)
  if firstChanged < viewportTop:
    fullRender(newLines, clear=true)
    return
```

### Phase 5: Incremental Update

```
  buffer = "\x1b[?2026h"  // Begin sync

  // Move cursor to first changed line
  lineDiff = firstChanged - hardwareCursorRow
  if lineDiff > 0:
    buffer += "\x1b[" + lineDiff + "B"
  else if lineDiff < 0:
    buffer += "\x1b[" + (-lineDiff) + "A"

  buffer += "\r"  // Column 0

  // Render changed lines only
  renderEnd = min(lastChanged, newLines.length - 1)
  for i in firstChanged..renderEnd:
    if i > firstChanged:
      buffer += "\r\n"
    buffer += "\x1b[2K"  // Clear line
    buffer += validateAndWrite(newLines[i], width)

  finalCursorRow = renderEnd

  // Clear extra lines if content shrunk
  if previousLines.length > newLines.length:
    buffer += handleShrinkage(renderEnd, newLines.length, previousLines.length)

  buffer += "\x1b[?2026l"  // End sync
  terminal.write(buffer)
```

---

## Line Comparison Strategy

### String Equality (Current Approach)

Direct string comparison of entire lines including ANSI codes:

```
if oldLine != newLine:
  // Line changed
```

**Pros**:
- Simple, correct
- ANSI codes are content; styling changes must re-render
- No hash collision risk

**Cons**:
- Memory: stores full previous content
- Comparison: O(n) per line where n = line length

### Alternative: Hash-Based Comparison

```
HashEntry {
  hash: uint64
  content: string  // For collision verification
}

previousHashes: HashEntry[]

compareLines(old, new):
  oldHash = fastHash(old)
  newHash = fastHash(new)

  if oldHash != newHash:
    return CHANGED

  // Verify no collision
  if old != new:
    return CHANGED

  return UNCHANGED
```

**Pros**:
- Faster comparison for long lines
- Memory compression possible (store only hashes, re-render on any change)

**Cons**:
- Hash collision requires fallback
- Additional complexity
- Marginal gain for typical line lengths

### Recommendation

Keep string equality. Terminal lines are typically <200 chars. Hash overhead not justified until line lengths exceed ~1KB consistently.

---

## Viewport Management

### Terminal Working Area

Track max lines ever rendered to understand scrollback state:

```
┌─────────────────────────────┐
│  Scrollback (inaccessible) │  ← Cannot update
├─────────────────────────────┤
│  Line 0                    │  ← viewportTop = max(0, maxLines - height)
│  Line 1                    │
│  Line 2                    │
│  ...                       │
│  Line N                    │  ← Visible viewport (height lines)
└─────────────────────────────┘
```

### Viewport Calculation

```
// maxLinesRendered grows monotonically during session
// Resets only on full clear

maxLinesRendered = max(maxLinesRendered, newLines.length)

// Viewport top = first visible line
viewportTop = max(0, maxLinesRendered - terminal.rows)

// Changes above viewport require full clear
// (terminal cannot update scrollback)
if firstChanged < viewportTop:
  fullRender(clear=true)
```

### Content Overflow Handling

When content exceeds viewport:

```
if newLines.length > terminal.rows:
  // Content will scroll
  // Track that terminal now has scrollback
  maxLinesRendered = newLines.length
```

When content shrinks:

```
if newLines.length < previousLines.length:
  // Clear extra lines but don't reduce maxLinesRendered
  // (scrollback still exists)
  clearExtraLines(newLines.length, previousLines.length)
```

---

## Cursor Position Extraction

### Cursor Marker Protocol

Components emit zero-width marker at cursor position:

```
CURSOR_MARKER = "\x1b_pi:c\x07"  // APC sequence

// APC = Application Program Command
// Format: ESC _ {payload} BEL
// Terminals ignore unknown APC sequences
```

### Extraction Algorithm

```
extractCursorPosition(lines) -> {row, col} | null:
  for row in 0..lines.length:
    line = lines[row]
    markerIdx = line.indexOf(CURSOR_MARKER)

    if markerIdx != -1:
      // Calculate visual column
      beforeMarker = line.substring(0, markerIdx)
      col = visibleWidth(beforeMarker)

      // Strip marker from output
      lines[row] = line.substring(0, markerIdx) +
                   line.substring(markerIdx + CURSOR_MARKER.length)

      return {row, col}

  return null
```

### Hardware Cursor Positioning

```
positionHardwareCursor(cursorPos, totalLines):
  if cursorPos == null or totalLines <= 0:
    terminal.hideCursor()
    return

  // Clamp to valid range
  targetRow = clamp(cursorPos.row, 0, totalLines - 1)
  targetCol = max(0, cursorPos.col)

  // Calculate movement from current position
  rowDelta = targetRow - hardwareCursorRow

  buffer = ""
  if rowDelta > 0:
    buffer += "\x1b[" + rowDelta + "B"
  else if rowDelta < 0:
    buffer += "\x1b[" + (-rowDelta) + "A"

  // Absolute column positioning (1-indexed)
  buffer += "\x1b[" + (targetCol + 1) + "G"

  terminal.write(buffer)
  hardwareCursorRow = targetRow

  if showHardwareCursor:
    terminal.showCursor()
  else:
    terminal.hideCursor()
```

### IME Support

Hardware cursor position enables Input Method Editor (IME) candidate windows:

```
┌────────────────────────────────────────┐
│ > Type here: hello_                    │  ← Cursor at col 21
│                    ┌────────────┐      │
│                    │ 你好       │      │  ← IME popup at cursor
│                    │ 妳好       │      │
│                    │ 您好       │      │
│                    └────────────┘      │
└────────────────────────────────────────┘
```

---

## Line Reset Strategy

### Problem: Style Bleeding

Without resets, styles leak into padding and subsequent content:

```
Line with \x1b[4munderline\x1b[0m text
Next line also underlined (bug!)
```

### Solution: Per-Line Reset

```
SEGMENT_RESET = "\x1b[0m\x1b]8;;\x07"
//              SGR reset + hyperlink reset

applyLineResets(lines):
  return lines.map(line =>
    containsImage(line) ? line : line + SEGMENT_RESET
  )
```

### Why Both Resets?

```
\x1b[0m       // SGR: Reset bold, italic, colors, etc.
\x1b]8;;\x07  // OSC 8: Close any open hyperlink
```

Hyperlinks use OSC 8 which is NOT reset by SGR:

```
\x1b]8;;https://example.com\x07Click\x1b]8;;\x07
                                    ^^^^^^^^^^^^
                                    Must explicitly close
```

### Image Exception

Image protocols embed binary data in escape sequences:

```
containsImage(line):
  return line.includes("\x1b_G") or      // Kitty graphics
         line.includes("\x1b]1337;File=") // iTerm2 inline images
```

Images handle their own reset; appending SEGMENT_RESET corrupts them.

---

## Synchronized Output

### DEC Private Mode 2026

Prevents visual tearing during multi-line updates:

```
\x1b[?2026h  // Begin synchronized update
...buffer...
\x1b[?2026l  // End synchronized update
```

### Terminal Behavior

During sync mode:
1. Terminal buffers all output
2. Screen not updated
3. On end marker, entire buffer rendered atomically

### Compatibility

| Terminal | Support |
|----------|---------|
| Kitty | Yes |
| iTerm2 | Yes |
| WezTerm | Yes |
| Ghostty | Yes |
| macOS Terminal | No (ignored) |
| Windows Terminal | No (ignored) |

Unsupported terminals ignore the sequences - no fallback needed.

### Usage Pattern

```
renderFrame(lines):
  buffer = "\x1b[?2026h"

  for line in lines:
    buffer += line + "\r\n"

  buffer += "\x1b[?2026l"

  terminal.write(buffer)  // Single write
```

---

## Performance Optimizations

### 1. Request Coalescing

Batch multiple requestRender() calls:

```
Component A: requestRender()
Component B: requestRender()  ← Ignored (already scheduled)
Component C: requestRender()  ← Ignored
-- nextTick --
doRender()                    ← Single render with all changes
```

### 2. Minimal Update Range

Only render `firstChanged` to `lastChanged`, not full content:

```
Previous: [A, B, C, D, E]
New:      [A, B, X, D, E]

firstChanged = 2, lastChanged = 2
Render only line 2
```

### 3. Single Buffer Write

Accumulate all escape sequences into one string, single write():

```
// BAD: Multiple writes
terminal.write("\x1b[2K")
terminal.write(line1)
terminal.write("\r\n")
terminal.write("\x1b[2K")
terminal.write(line2)

// GOOD: Single write
buffer = "\x1b[2K" + line1 + "\r\n" + "\x1b[2K" + line2
terminal.write(buffer)
```

### 4. Width Caching

Cache visibleWidth() results for repeated strings:

```
WIDTH_CACHE_SIZE = 512
widthCache: LRU<string, int>

visibleWidth(str):
  cached = widthCache.get(str)
  if cached != null:
    return cached

  width = calculateWidth(str)
  widthCache.set(str, width)
  return width
```

### 5. ASCII Fast Path

Skip Unicode processing for pure ASCII:

```
visibleWidth(str):
  // Fast path: pure ASCII printable
  for char in str:
    code = char.codePointAt(0)
    if code < 0x20 or code > 0x7e:
      return slowPath(str)
  return str.length  // ASCII = 1 char = 1 column
```

---

## Flicker Prevention

### Root Causes

1. **Screen clear before content**: Brief blank screen
2. **Line-by-line rendering**: Progressive update visible
3. **Cursor jumping**: Cursor moves before positioned

### Solutions Applied

| Cause | Solution |
|-------|----------|
| Screen clear | Only clear when necessary (width change, scrollback) |
| Progressive render | Synchronized output (DEC 2026) |
| Cursor jumping | Hide cursor during render, position after |

### Render Flow (Flicker-Free)

```
1. Hide cursor (if not already)
2. Begin sync mode (\x1b[?2026h)
3. Build complete buffer
4. Single write()
5. End sync mode (\x1b[?2026l)
6. Position hardware cursor
7. Show cursor (if enabled)
```

---

## Image Handling

### Detection

```
containsImage(line):
  // Kitty graphics protocol
  if line.includes("\x1b_G"):
    return true

  // iTerm2 inline image protocol
  if line.includes("\x1b]1337;File="):
    return true

  return false
```

### Special Treatment

Image lines require:

1. **No reset suffix**: Binary data corruption
2. **No overlay compositing**: Cannot slice image sequences
3. **Skip width validation**: Images have special width semantics

```
compositeLineAt(baseLine, overlayLine, ...):
  if containsImage(baseLine):
    return baseLine  // Don't composite over images

validateLineWidth(line, width):
  if containsImage(line):
    return  // Skip validation for image lines
```

### Cell Size Query

Query terminal for pixel dimensions (needed for proper image sizing):

```
queryCellSize():
  terminal.write("\x1b[16t")  // CSI 16 t = request cell size

  // Response: \x1b[6;{height};{width}t
  onResponse(heightPx, widthPx):
    setCellDimensions({widthPx, heightPx})
    invalidateAllComponents()
    requestRender()
```

---

## Debug/Logging Strategies

### Crash Log on Width Overflow

```
if visibleWidth(line) > width:
  crashData = {
    timestamp: now(),
    terminalWidth: width,
    lineIndex: i,
    lineWidth: visibleWidth(line),
    allLines: lines.map((l, idx) =>
      "[" + idx + "] (w=" + visibleWidth(l) + ") " + l
    )
  }

  writeFile("~/.app/crash.log", crashData)
  terminal.stop()
  throw Error("Line exceeds terminal width")
```

### Debug Environment Variable

```
if env.TUI_DEBUG == "1":
  debugPath = "/tmp/tui/render-" + timestamp + ".log"
  debugData = {
    firstChanged,
    lastChanged,
    viewportTop,
    cursorRow,
    hardwareCursorRow,
    height,
    newLines: JSON.stringify(newLines),
    previousLines: JSON.stringify(previousLines),
    buffer: JSON.stringify(buffer)
  }
  writeFile(debugPath, debugData)
```

### Render State Inspection

Expose internal state for debugging:

```
getDebugState():
  return {
    previousLines: previousLines.length,
    maxLinesRendered,
    cursorRow,
    hardwareCursorRow,
    overlayCount: overlayStack.length,
    renderPending: renderRequested
  }
```

---

## Edge Cases

### 1. Empty Content

```
if newLines.length == 0:
  // Clamp cursor to 0 (not -1)
  cursorRow = 0
  hardwareCursorRow = 0
```

### 2. Content Shrinks Below Viewport

```
if previousLines.length > newLines.length:
  extraLines = previousLines.length - newLines.length

  // If clearing more lines than viewport height,
  // just do full clear (avoid excessive movement)
  if extraLines > height:
    fullRender(clear=true)
    return
```

### 3. Changes Above Scrollback

```
viewportTop = max(0, maxLinesRendered - height)

if firstChanged < viewportTop:
  // Cannot update scrolled-off content
  // Must clear scrollback and re-render
  fullRender(clear=true)
```

### 4. Terminal Resize During Render

Width change detected at render time:

```
if previousWidth != width:
  // Old layout invalid for new width
  // Force full re-render
  fullRender(clear=true)
```

### 5. Wide Characters at Line End

```
// Line ends with CJK (2-column) char at position width-1
// Would extend past terminal width

validateLineWidth(line, width):
  lineWidth = visibleWidth(line)
  if lineWidth > width:
    // Truncate strictly
    line = truncateToWidth(line, width)
```

### 6. Overlay Extends Past Content

```
// Overlay at row 50, but content only has 30 lines

while result.length < overlayRow + overlayHeight:
  result.push("")  // Extend with empty lines
```

---

## Implementation Pseudocode

### Complete doRender()

```
doRender():
  width = terminal.columns
  height = terminal.rows

  //=== Phase 1: Generate content ===
  newLines = container.render(width)

  if overlayStack.notEmpty:
    newLines = compositeOverlays(newLines, width, height)

  cursorPos = extractCursorPosition(newLines)
  newLines = applyLineResets(newLines)

  widthChanged = previousWidth != 0 and previousWidth != width

  //=== Phase 2: First render ===
  if previousLines.empty and not widthChanged:
    buffer = "\x1b[?2026h"
    for i in 0..newLines.length:
      if i > 0:
        buffer += "\r\n"
      buffer += newLines[i]
    buffer += "\x1b[?2026l"
    terminal.write(buffer)

    cursorRow = max(0, newLines.length - 1)
    hardwareCursorRow = cursorRow
    maxLinesRendered = newLines.length
    positionHardwareCursor(cursorPos, newLines.length)
    previousLines = newLines
    previousWidth = width
    return

  //=== Phase 3: Width changed ===
  if widthChanged:
    buffer = "\x1b[?2026h"
    buffer += "\x1b[3J\x1b[2J\x1b[H"  // Clear scrollback, screen, home
    for i in 0..newLines.length:
      if i > 0:
        buffer += "\r\n"
      buffer += newLines[i]
    buffer += "\x1b[?2026l"
    terminal.write(buffer)

    cursorRow = max(0, newLines.length - 1)
    hardwareCursorRow = cursorRow
    maxLinesRendered = newLines.length
    positionHardwareCursor(cursorPos, newLines.length)
    previousLines = newLines
    previousWidth = width
    return

  //=== Phase 4: Find changes ===
  firstChanged = -1
  lastChanged = -1
  maxLen = max(newLines.length, previousLines.length)

  for i in 0..maxLen:
    oldLine = i < previousLines.length ? previousLines[i] : ""
    newLine = i < newLines.length ? newLines[i] : ""
    if oldLine != newLine:
      if firstChanged == -1:
        firstChanged = i
      lastChanged = i

  //=== Phase 5: No changes ===
  if firstChanged == -1:
    positionHardwareCursor(cursorPos, newLines.length)
    return

  //=== Phase 6: All changes in deleted lines ===
  if firstChanged >= newLines.length:
    if previousLines.length > newLines.length:
      buffer = "\x1b[?2026h"
      targetRow = max(0, newLines.length - 1)
      lineDiff = targetRow - hardwareCursorRow
      if lineDiff > 0:
        buffer += "\x1b[" + lineDiff + "B"
      else if lineDiff < 0:
        buffer += "\x1b[" + (-lineDiff) + "A"
      buffer += "\r"

      extraLines = previousLines.length - newLines.length
      if extraLines > height:
        // Too many - full render
        // (recursion avoided by widthChanged branch)
        fullRender(clear=true)
        return

      if extraLines > 0:
        buffer += "\x1b[1B"
      for i in 0..extraLines:
        buffer += "\r\x1b[2K"
        if i < extraLines - 1:
          buffer += "\x1b[1B"
      if extraLines > 0:
        buffer += "\x1b[" + extraLines + "A"

      buffer += "\x1b[?2026l"
      terminal.write(buffer)
      cursorRow = targetRow
      hardwareCursorRow = targetRow

    positionHardwareCursor(cursorPos, newLines.length)
    previousLines = newLines
    previousWidth = width
    return

  //=== Phase 7: Check viewport bounds ===
  viewportTop = max(0, maxLinesRendered - height)
  if firstChanged < viewportTop:
    fullRender(clear=true)
    return

  //=== Phase 8: Incremental update ===
  buffer = "\x1b[?2026h"

  lineDiff = firstChanged - hardwareCursorRow
  if lineDiff > 0:
    buffer += "\x1b[" + lineDiff + "B"
  else if lineDiff < 0:
    buffer += "\x1b[" + (-lineDiff) + "A"
  buffer += "\r"

  renderEnd = min(lastChanged, newLines.length - 1)
  for i in firstChanged..renderEnd:
    if i > firstChanged:
      buffer += "\r\n"
    buffer += "\x1b[2K"

    line = newLines[i]
    isImage = containsImage(line)
    if not isImage and visibleWidth(line) > width:
      crashAndLog(line, i, width, newLines)

    buffer += line

  finalCursorRow = renderEnd

  //=== Phase 9: Clear extra lines ===
  if previousLines.length > newLines.length:
    if renderEnd < newLines.length - 1:
      moveDown = newLines.length - 1 - renderEnd
      buffer += "\x1b[" + moveDown + "B"
      finalCursorRow = newLines.length - 1

    extraLines = previousLines.length - newLines.length
    for i in newLines.length..previousLines.length:
      buffer += "\r\n\x1b[2K"
    buffer += "\x1b[" + extraLines + "A"

  buffer += "\x1b[?2026l"
  terminal.write(buffer)

  //=== Phase 10: Update state ===
  cursorRow = max(0, newLines.length - 1)
  hardwareCursorRow = finalCursorRow
  maxLinesRendered = max(maxLinesRendered, newLines.length)

  positionHardwareCursor(cursorPos, newLines.length)

  previousLines = newLines
  previousWidth = width
```

---

## Summary

| Aspect | Approach |
|--------|----------|
| Comparison | Direct string equality |
| Sync | DEC 2026 begin/end |
| Viewport | Track maxLinesRendered |
| Cursor | APC marker extraction |
| Resets | SGR + OSC 8 per line |
| Batching | nextTick coalescing |
| Images | Detect and skip processing |
| Debug | Crash logs + env flag |

### Key Invariants

1. `hardwareCursorRow` always matches actual terminal cursor
2. `maxLinesRendered` only grows (until full clear)
3. Line width never exceeds terminal width (crash on violation)
4. Cursor marker stripped before terminal write
5. Sync mode wraps all multi-line updates
