# Overlay System - Engineering Specification

A language-agnostic specification for terminal overlay rendering with focus management, compositing, and positioning algorithms.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Structures](#data-structures)
3. [OverlayOptions Specification](#overlayoptions-specification)
4. [Anchor Positioning Calculations](#anchor-positioning-calculations)
5. [Percentage-Based Sizing](#percentage-based-sizing)
6. [Margin System](#margin-system)
7. [Visibility Conditions](#visibility-conditions)
8. [Line Compositing Algorithm](#line-compositing-algorithm)
9. [Z-Ordering and Overlay Stack](#z-ordering-and-overlay-stack)
10. [Focus Management State Machine](#focus-management-state-machine)
11. [Overlay Handle API](#overlay-handle-api)
12. [Modal vs Non-Modal Overlays](#modal-vs-non-modal-overlays)
13. [Nested Overlays](#nested-overlays)
14. [Edge Cases and Safeguards](#edge-cases-and-safeguards)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TERMINAL VIEWPORT                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    BASE CONTENT (Container)                    │  │
│  │                                                                │  │
│  │    ┌──────────────────────────────────────────────┐           │  │
│  │    │           OVERLAY 1 (z-index: 0)             │           │  │
│  │    │                                              │           │  │
│  │    │   ┌────────────────────────────────┐        │           │  │
│  │    │   │     OVERLAY 2 (z-index: 1)     │        │           │  │
│  │    │   │        (on top)                │        │           │  │
│  │    │   └────────────────────────────────┘        │           │  │
│  │    │                                              │           │  │
│  │    └──────────────────────────────────────────────┘           │  │
│  │                                                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
              ┌─────────────────────────────────────┐
              │        COMPOSITING PIPELINE          │
              │                                      │
              │  1. Render base content              │
              │  2. For each overlay (bottom→top):   │
              │     a. Check visibility              │
              │     b. Calculate position            │
              │     c. Splice into lines             │
              │  3. Apply line resets                │
              │  4. Differential render              │
              └─────────────────────────────────────┘
```

### Core Principles

1. **Stack-based z-ordering** - Later overlays render on top
2. **Non-destructive compositing** - Base content preserved outside overlay bounds
3. **ANSI-preserving splicing** - Styles maintained across segment boundaries
4. **Focus follows visibility** - Hidden overlays cannot receive input
5. **Focus restoration** - Previous focus restored when overlay hides

---

## Data Structures

### Overlay Entry

```
OverlayEntry {
    component: Component       // The overlay component to render
    options: OverlayOptions?   // Positioning and sizing options
    preFocus: Component?       // Component that had focus before overlay shown
    hidden: bool               // Temporarily hidden via setHidden(true)
}
```

### Overlay Stack

```
overlayStack: OverlayEntry[]   // Array, index = z-order (0 = bottom)
```

### Resolved Layout

```
ResolvedLayout {
    width: int                 // Actual width in columns
    row: int                   // 0-indexed row position
    col: int                   // 0-indexed column position
    maxHeight: int?            // Max lines to render (null = unlimited)
}
```

---

## OverlayOptions Specification

```
OverlayOptions {
    // === SIZING ===

    width: SizeValue?
        // Width of overlay in columns
        // Can be: int (absolute) | "N%" (percentage of terminal width)
        // Default: min(80, availableWidth)

    minWidth: int?
        // Minimum width in columns
        // Applied after width calculation, before clamping to available space
        // Default: none

    maxHeight: SizeValue?
        // Maximum height in rows
        // Can be: int (absolute) | "N%" (percentage of terminal height)
        // Overlay content truncated if exceeds this
        // Default: none (no limit)

    // === POSITIONING - ANCHOR-BASED ===

    anchor: OverlayAnchor?
        // Anchor point for positioning
        // One of: 'center' | 'top-left' | 'top-right' | 'bottom-left' |
        //         'bottom-right' | 'top-center' | 'bottom-center' |
        //         'left-center' | 'right-center'
        // Default: 'center'

    offsetX: int?
        // Horizontal offset from anchor position
        // Positive = right, Negative = left
        // Applied after anchor calculation, before clamping
        // Default: 0

    offsetY: int?
        // Vertical offset from anchor position
        // Positive = down, Negative = up
        // Applied after anchor calculation, before clamping
        // Default: 0

    // === POSITIONING - ABSOLUTE/PERCENTAGE ===

    row: SizeValue?
        // Absolute row position, or percentage
        // int: Exact row number (0-indexed)
        // "N%": 0% = top, 100% = bottom (overlay stays within bounds)
        // When set, overrides anchor's vertical positioning
        // Default: use anchor

    col: SizeValue?
        // Absolute column position, or percentage
        // int: Exact column number (0-indexed)
        // "N%": 0% = left, 100% = right (overlay stays within bounds)
        // When set, overrides anchor's horizontal positioning
        // Default: use anchor

    // === MARGIN ===

    margin: OverlayMargin | int?
        // Margin from terminal edges
        // int: Apply to all 4 sides
        // OverlayMargin: { top?, right?, bottom?, left? }
        // Negative values clamped to 0
        // Default: 0 all sides

    // === VISIBILITY ===

    visible: fn(termWidth: int, termHeight: int) -> bool?
        // Callback to control overlay visibility
        // Called each render cycle with current terminal dimensions
        // Overlay only rendered when returns true
        // If not provided, overlay always visible (unless hidden via handle)
        // Default: none (always visible)
}
```

### SizeValue Type

```
SizeValue = int | "${number}%"   // e.g., 50 or "50%"
```

### OverlayMargin Type

```
OverlayMargin {
    top: int?      // Default: 0
    right: int?    // Default: 0
    bottom: int?   // Default: 0
    left: int?     // Default: 0
}
```

### OverlayAnchor Enum

```
OverlayAnchor =
    | 'center'         // Centered both horizontally and vertically
    | 'top-left'       // Top-left corner
    | 'top-right'      // Top-right corner
    | 'bottom-left'    // Bottom-left corner
    | 'bottom-right'   // Bottom-right corner
    | 'top-center'     // Centered horizontally, top edge
    | 'bottom-center'  // Centered horizontally, bottom edge
    | 'left-center'    // Left edge, centered vertically
    | 'right-center'   // Right edge, centered vertically
```

---

## Anchor Positioning Calculations

### Coordinate System

```
         col=0                           col=termWidth-1
           │                                    │
           ▼                                    ▼
row=0 ──► ┌────────────────────────────────────┐
          │                                    │
          │          TERMINAL VIEWPORT         │
          │                                    │
          │    marginTop                       │
          │    ┌─────────────────────────┐     │
          │    │                         │     │
          │    │     AVAILABLE SPACE     │     │
          │    │   (availWidth x availH) │     │
          │    │                         │     │
          │    └─────────────────────────┘     │
          │                        marginRight │
          │                                    │
row=termH-1 ► └────────────────────────────────┘
```

### Resolution Algorithm

```
FUNCTION resolveOverlayLayout(options, overlayHeight, termWidth, termHeight):
    // 1. Parse margins (clamp negatives to 0)
    margin = parseMargin(options.margin)
    marginTop = max(0, margin.top ?? 0)
    marginRight = max(0, margin.right ?? 0)
    marginBottom = max(0, margin.bottom ?? 0)
    marginLeft = max(0, margin.left ?? 0)

    // 2. Calculate available space
    availWidth = max(1, termWidth - marginLeft - marginRight)
    availHeight = max(1, termHeight - marginTop - marginBottom)

    // 3. Resolve width
    width = parseSizeValue(options.width, termWidth) ?? min(80, availWidth)
    IF options.minWidth:
        width = max(width, options.minWidth)
    width = clamp(width, 1, availWidth)

    // 4. Resolve maxHeight
    maxHeight = parseSizeValue(options.maxHeight, termHeight)
    IF maxHeight:
        maxHeight = clamp(maxHeight, 1, availHeight)

    // 5. Effective overlay height
    effectiveHeight = maxHeight ? min(overlayHeight, maxHeight) : overlayHeight

    // 6. Resolve row position
    IF options.row IS SET:
        IF options.row IS PERCENTAGE:
            maxRow = max(0, availHeight - effectiveHeight)
            percent = parsePercent(options.row)
            row = marginTop + floor(maxRow * percent)
        ELSE:
            row = options.row  // Absolute
    ELSE:
        anchor = options.anchor ?? 'center'
        row = resolveAnchorRow(anchor, effectiveHeight, availHeight, marginTop)

    // 7. Resolve col position
    IF options.col IS SET:
        IF options.col IS PERCENTAGE:
            maxCol = max(0, availWidth - width)
            percent = parsePercent(options.col)
            col = marginLeft + floor(maxCol * percent)
        ELSE:
            col = options.col  // Absolute
    ELSE:
        anchor = options.anchor ?? 'center'
        col = resolveAnchorCol(anchor, width, availWidth, marginLeft)

    // 8. Apply offsets
    row += options.offsetY ?? 0
    col += options.offsetX ?? 0

    // 9. Clamp to terminal bounds (respecting margins)
    row = clamp(row, marginTop, termHeight - marginBottom - effectiveHeight)
    col = clamp(col, marginLeft, termWidth - marginRight - width)

    RETURN { width, row, col, maxHeight }
```

### Anchor Row Calculation

```
FUNCTION resolveAnchorRow(anchor, height, availHeight, marginTop):
    SWITCH anchor:
        CASE 'top-left', 'top-center', 'top-right':
            RETURN marginTop

        CASE 'bottom-left', 'bottom-center', 'bottom-right':
            RETURN marginTop + availHeight - height

        CASE 'left-center', 'center', 'right-center':
            RETURN marginTop + floor((availHeight - height) / 2)
```

### Anchor Column Calculation

```
FUNCTION resolveAnchorCol(anchor, width, availWidth, marginLeft):
    SWITCH anchor:
        CASE 'top-left', 'left-center', 'bottom-left':
            RETURN marginLeft

        CASE 'top-right', 'right-center', 'bottom-right':
            RETURN marginLeft + availWidth - width

        CASE 'top-center', 'center', 'bottom-center':
            RETURN marginLeft + floor((availWidth - width) / 2)
```

### Anchor Position Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   top-left          top-center          top-right          │
│       ●─────────────────●─────────────────●                │
│       │                                   │                │
│       │                                   │                │
│       │              center               │                │
│ left- ●                 ●                 ● right-         │
│ center│                                   │ center         │
│       │                                   │                │
│       │                                   │                │
│       ●─────────────────●─────────────────●                │
│   bottom-left     bottom-center     bottom-right           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Percentage-Based Sizing

### Width Percentage

```
FUNCTION parseSizeValue(value, referenceSize):
    IF value IS undefined:
        RETURN undefined

    IF value IS number:
        RETURN value

    IF value MATCHES /^(\d+(?:\.\d+)?)%$/:
        percent = parseFloat(match[1])
        RETURN floor(referenceSize * percent / 100)

    RETURN undefined
```

### Examples

```
Terminal: 100 cols x 24 rows

width: "50%"      → 50 cols
width: "100%"     → 100 cols
maxHeight: "50%"  → 12 rows
row: "25%"        → row 5 (approx, after accounting for overlay height)
col: "50%"        → centered horizontally
```

### Percentage Position Behavior

For row/col percentages, the overlay stays within bounds:

```
row: "0%"   → Top edge
row: "50%"  → Vertically centered
row: "100%" → Bottom edge (overlay fully visible)

┌────────────────────┐
│ ← row: "0%"        │
│                    │
│ ← row: "50%"       │
│                    │
│ ← row: "100%"      │
└────────────────────┘
```

The formula ensures the overlay doesn't extend past terminal edges:

```
maxRow = availHeight - overlayHeight
actualRow = marginTop + floor(maxRow * (percent / 100))
```

---

## Margin System

### Margin Parsing

```
FUNCTION parseMargin(margin):
    IF margin IS number:
        RETURN { top: margin, right: margin, bottom: margin, left: margin }

    IF margin IS object:
        RETURN {
            top: margin.top ?? 0,
            right: margin.right ?? 0,
            bottom: margin.bottom ?? 0,
            left: margin.left ?? 0
        }

    RETURN { top: 0, right: 0, bottom: 0, left: 0 }
```

### Negative Margin Handling

Negative margins are clamped to zero:

```
margin: { top: -5, left: -10 }  →  { top: 0, left: 0 }
```

### Margin Effect on Available Space

```
┌────────────────────────────────────────────────┐
│              margin.top = 2                    │
│  ┌──────────────────────────────────────────┐  │
│  │                                          │  │
│  │        AVAILABLE SPACE                   │  │
│  │   (overlay can be positioned here)       │  │
│  │                                          │  │
│  │                                          │  │
│  └──────────────────────────────────────────┘  │
│ m                                           m  │
│ a                                           a  │
│ r                   margin.bottom = 3       r  │
│ g                                           g  │
│ i                                           i  │
│ n                                           n  │
│ .                                           .  │
│ l                                           r  │
│ e                                           i  │
│ f                                           g  │
│ t                                           h  │
│ =                                           t  │
│ 4                                           =  │
│                                             5  │
└────────────────────────────────────────────────┘
```

---

## Visibility Conditions

### Visibility Check

```
FUNCTION isOverlayVisible(entry):
    // Check hidden flag (set via handle.setHidden())
    IF entry.hidden:
        RETURN false

    // Check visibility callback
    IF entry.options?.visible:
        RETURN entry.options.visible(termWidth, termHeight)

    // Default: visible
    RETURN true
```

### Use Cases for Visibility Callback

1. **Responsive hiding** - Hide overlay on small terminals:

```
visible: (w, h) => w >= 80 && h >= 20
```

2. **Feature detection** - Show only when terminal supports feature:

```
visible: (w, h) => supportsImageProtocol
```

3. **Conditional display** - Based on application state:

```
visible: (w, h) => applicationState.showHelp
```

### Visibility and Focus

When overlay becomes invisible:
1. If it had focus, focus transfers to topmost visible overlay
2. If no visible overlays, focus returns to preFocus

---

## Line Compositing Algorithm

### Overview

The compositing algorithm splices overlay content into base content while preserving ANSI styling.

```
BASE LINE:   "AAAAAA[style1]BBBBBB[style2]CCCCCC"
OVERLAY:     "OVERLAY"
POSITION:    col=6, width=7

RESULT:      "AAAAAA[reset]OVERLAY[reset][style2]CCCCCC"
                    │              │         │
                    └──────────────┴─────────┴── Segment boundaries
```

### Compositing Pipeline

```
FUNCTION compositeOverlays(lines, termWidth, termHeight):
    IF overlayStack IS EMPTY:
        RETURN lines

    result = copy(lines)

    // Pre-render all visible overlays
    rendered = []
    minLinesNeeded = result.length

    FOR entry IN overlayStack:
        IF NOT isOverlayVisible(entry):
            CONTINUE

        // Get layout (width/maxHeight first, then position with actual height)
        layout1 = resolveOverlayLayout(entry.options, 0, termWidth, termHeight)
        overlayLines = entry.component.render(layout1.width)

        // Apply maxHeight
        IF layout1.maxHeight AND overlayLines.length > layout1.maxHeight:
            overlayLines = overlayLines.slice(0, layout1.maxHeight)

        // Get final position with actual height
        layout2 = resolveOverlayLayout(entry.options, overlayLines.length, termWidth, termHeight)

        rendered.push({
            overlayLines,
            row: layout2.row,
            col: layout2.col,
            width: layout2.width
        })

        minLinesNeeded = max(minLinesNeeded, layout2.row + overlayLines.length)

    // Extend result if content too short for overlay placement
    WHILE result.length < minLinesNeeded:
        result.push("")

    // Calculate viewport start (for scrolling scenarios)
    viewportStart = max(0, result.length - termHeight)

    // Composite each overlay (in stack order = z-order)
    FOR { overlayLines, row, col, width } IN rendered:
        FOR i = 0 TO overlayLines.length - 1:
            idx = viewportStart + row + i
            IF idx >= 0 AND idx < result.length:
                // Truncate overlay line to declared width
                truncated = sliceByColumn(overlayLines[i], 0, width, strict=true)
                result[idx] = compositeLineAt(result[idx], truncated, col, width, termWidth)

    // Final safety check: truncate any lines exceeding terminal width
    FOR idx IN modifiedLineIndices:
        IF visibleWidth(result[idx]) > termWidth:
            result[idx] = sliceByColumn(result[idx], 0, termWidth, strict=true)

    RETURN result
```

### Single Line Compositing

```
FUNCTION compositeLineAt(baseLine, overlayLine, startCol, overlayWidth, totalWidth):
    // Skip image lines (contain Kitty or iTerm2 image sequences)
    IF containsImage(baseLine):
        RETURN baseLine

    afterStart = startCol + overlayWidth

    // Single-pass extraction of before/after segments
    segments = extractSegments(baseLine, startCol, afterStart, totalWidth - afterStart, strict=true)

    // Extract overlay with width tracking
    overlay = sliceWithWidth(overlayLine, 0, overlayWidth, strict=true)

    // Calculate padding
    beforePad = max(0, startCol - segments.beforeWidth)
    overlayPad = max(0, overlayWidth - overlay.width)
    actualBeforeWidth = max(startCol, segments.beforeWidth)
    actualOverlayWidth = max(overlayWidth, overlay.width)
    afterTarget = max(0, totalWidth - actualBeforeWidth - actualOverlayWidth)
    afterPad = max(0, afterTarget - segments.afterWidth)

    // Compose with reset sequences
    RESET = "\x1b[0m\x1b]8;;\x07"  // SGR reset + hyperlink reset

    result = segments.before
           + " ".repeat(beforePad)
           + RESET
           + overlay.text
           + " ".repeat(overlayPad)
           + RESET
           + segments.after
           + " ".repeat(afterPad)

    // Safety truncation
    IF visibleWidth(result) > totalWidth:
        result = sliceByColumn(result, 0, totalWidth, strict=true)

    RETURN result
```

### Segment Extraction

```
FUNCTION extractSegments(line, beforeEnd, afterStart, afterLen, strictAfter):
    // Extracts "before" (col 0 to beforeEnd) and "after" (afterStart to afterStart+afterLen)
    // Preserves ANSI styling across segment boundaries

    before = ""
    beforeWidth = 0
    after = ""
    afterWidth = 0
    currentCol = 0
    styleTracker = new AnsiCodeTracker()

    FOR each character/ANSI-code in line:
        IF is ANSI code:
            styleTracker.process(code)
            IF currentCol < beforeEnd:
                pendingAnsiBefore += code
            ELSE IF in after range AND afterStarted:
                after += code
        ELSE:
            grapheme = next grapheme cluster
            width = graphemeWidth(grapheme)

            IF currentCol < beforeEnd:
                before += pendingAnsiBefore + grapheme
                beforeWidth += width
            ELSE IF currentCol >= afterStart AND currentCol < afterStart + afterLen:
                IF strictAfter AND currentCol + width > afterEnd:
                    SKIP (wide char would exceed boundary)
                IF NOT afterStarted:
                    after += styleTracker.getActiveCodes()  // Inherit styles
                    afterStarted = true
                after += grapheme
                afterWidth += width

            currentCol += width

    RETURN { before, beforeWidth, after, afterWidth }
```

### ANSI Style Tracking

```
AnsiCodeTracker {
    // Individual attributes
    bold: bool
    dim: bool
    italic: bool
    underline: bool
    blink: bool
    inverse: bool
    hidden: bool
    strikethrough: bool
    fgColor: string?    // e.g., "31" or "38;5;240" or "38;2;255;0;0"
    bgColor: string?

    FUNCTION process(ansiCode):
        // Parse SGR codes and update state
        // Handle 256-color (38;5;N) and RGB (38;2;R;G;B) formats
        // Handle reset (0) and individual attribute toggles

    FUNCTION getActiveCodes():
        // Return "\x1b[...m" with all active attributes
        // Returns "" if no active styles

    FUNCTION clear():
        // Reset all attributes to default
}
```

---

## Z-Ordering and Overlay Stack

### Stack Order

Overlays render in stack order (array index = z-order):

```
overlayStack[0]  →  Rendered first (bottom)
overlayStack[1]  →  Rendered second (covers [0])
overlayStack[N]  →  Rendered last (topmost, on top of all)
```

### Visual Example

```
Stack: [DialogA, TooltipB, DropdownC]

Rendering order:
1. Base content
2. DialogA (z=0)
3. TooltipB (z=1, partially covers DialogA if overlapping)
4. DropdownC (z=2, topmost)

Final display:
┌────────────────────────────────────┐
│ Base content                       │
│  ┌─────────────────────┐          │
│  │ DialogA             │          │
│  │   ┌────────────┐    │          │
│  │   │ TooltipB   │────│──┐       │
│  │   └────────────┘    │  │       │
│  │                     │  │       │
│  └─────────────────────┘  │       │
│      ┌───────────────────┴──┐     │
│      │ DropdownC (topmost)  │     │
│      └──────────────────────┘     │
└────────────────────────────────────┘
```

### Operations

```
showOverlay(component, options):
    entry = { component, options, preFocus: currentFocus, hidden: false }
    overlayStack.push(entry)     // Add to top
    focus(component)
    return handle

hideOverlay():
    entry = overlayStack.pop()   // Remove from top
    restoreFocus(entry.preFocus OR topmostVisible)
```

---

## Focus Management State Machine

### State Diagram

```
                     showOverlay(A)
    ┌───────────┐ ─────────────────► ┌─────────────┐
    │  BASE     │                    │  OVERLAY A  │
    │  FOCUSED  │ ◄───────────────── │   FOCUSED   │
    └───────────┘    hideOverlay()   └─────────────┘
         │                                  │
         │                                  │ showOverlay(B)
         │                                  ▼
         │                           ┌─────────────┐
         │                           │  OVERLAY B  │
         │                           │   FOCUSED   │
         │                           └─────────────┘
         │                                  │
         │                                  │ hideOverlay()
         │                                  ▼
         │                           ┌─────────────┐
         │◄──────────────────────────│  OVERLAY A  │
                 hideOverlay()       │   FOCUSED   │
                                     └─────────────┘
```

### Focus Transitions

```
FUNCTION showOverlay(component, options):
    entry = {
        component,
        options,
        preFocus: focusedComponent,   // Save current focus
        hidden: false
    }
    overlayStack.push(entry)

    IF isOverlayVisible(entry):
        setFocus(component)

    return createHandle(entry)

FUNCTION hideOverlay():
    entry = overlayStack.pop()
    IF NOT entry:
        RETURN

    // Find new focus target
    topVisible = getTopmostVisibleOverlay()
    IF topVisible:
        setFocus(topVisible.component)
    ELSE:
        setFocus(entry.preFocus)

FUNCTION setFocus(component):
    IF isFocusable(focusedComponent):
        focusedComponent.focused = false

    focusedComponent = component

    IF isFocusable(component):
        component.focused = true
```

### Visibility Change Focus Handling

When an overlay becomes invisible (via visibility callback or setHidden):

```
FUNCTION handleVisibilityChange(entry, nowVisible):
    IF NOT nowVisible AND focusedComponent == entry.component:
        // Lost visibility while focused
        topVisible = getTopmostVisibleOverlay()
        IF topVisible:
            setFocus(topVisible.component)
        ELSE:
            setFocus(entry.preFocus)

    IF nowVisible AND entry IS topmost visible:
        setFocus(entry.component)
```

---

## Overlay Handle API

### Handle Interface

```
OverlayHandle {
    hide(): void
        // Permanently remove overlay from stack
        // Restores focus to preFocus or topmost visible

    setHidden(hidden: bool): void
        // Temporarily hide (true) or show (false)
        // Focus management triggered on visibility change
        // Different from hide() - overlay stays in stack

    isHidden(): bool
        // Returns current hidden state
}
```

### Handle Implementation

```
FUNCTION createHandle(entry):
    RETURN {
        hide: () => {
            index = overlayStack.indexOf(entry)
            IF index == -1:
                RETURN  // Already removed

            overlayStack.splice(index, 1)

            IF focusedComponent == entry.component:
                topVisible = getTopmostVisibleOverlay()
                setFocus(topVisible?.component ?? entry.preFocus)

            requestRender()
        },

        setHidden: (hidden) => {
            IF entry.hidden == hidden:
                RETURN

            entry.hidden = hidden

            IF hidden AND focusedComponent == entry.component:
                topVisible = getTopmostVisibleOverlay()
                setFocus(topVisible?.component ?? entry.preFocus)
            ELSE IF NOT hidden AND isOverlayVisible(entry):
                setFocus(entry.component)

            requestRender()
        },

        isHidden: () => entry.hidden
    }
```

### Usage Example

```
// Show dialog
dialogHandle = tui.showOverlay(dialog, { anchor: 'center' })

// User clicks cancel
dialogHandle.hide()  // Removed, focus restored

// Alternative: toggle visibility
dialogHandle.setHidden(true)   // Hidden but in stack
dialogHandle.setHidden(false)  // Shown again, focus restored
```

---

## Modal vs Non-Modal Overlays

### Distinction

This overlay system is **modal by design** - the topmost visible overlay receives all input.

```
┌──────────────────────────────────────┐
│ Base content                         │
│                                      │
│   ┌───────────────────────────────┐  │
│   │ MODAL OVERLAY                 │  │
│   │                               │  │
│   │  All keyboard input goes here │  │
│   │  Base content cannot receive  │  │
│   │  input while overlay is open  │  │
│   │                               │  │
│   └───────────────────────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

### Input Routing

```
FUNCTION handleInput(data):
    // Focus validation on each input
    focusedOverlay = findOverlay(focusedComponent)

    IF focusedOverlay AND NOT isOverlayVisible(focusedOverlay):
        // Focus moved from hidden overlay
        topVisible = getTopmostVisibleOverlay()
        setFocus(topVisible?.component ?? focusedOverlay.preFocus)

    // Route to focused component
    IF focusedComponent?.handleInput:
        focusedComponent.handleInput(data)
```

### Implementing Non-Modal Behavior

For non-modal overlays (e.g., status bars, notifications), use the visibility system:

```
// Non-modal tooltip that doesn't steal focus
tooltipHandle = tui.showOverlay(tooltip, {
    anchor: 'bottom-right',
    visible: () => true
})

// Don't focus the tooltip - let base keep focus
// Tooltip renders but doesn't receive input
```

---

## Nested Overlays

### Handling

Nested overlays are naturally supported through the stack:

```
// Show dialog
dialogHandle = tui.showOverlay(dialog)

// From within dialog, show confirmation
confirmHandle = tui.showOverlay(confirm)  // On top of dialog

// Stack state: [dialog, confirm]
// confirm has focus, dialog still visible beneath
```

### Focus Restoration Chain

```
Base (focused)
    → showOverlay(A) → A focused, preFocus=Base
        → showOverlay(B) → B focused, preFocus=A
            → showOverlay(C) → C focused, preFocus=B
                → hideOverlay() → B focused
            → hideOverlay() → A focused
        → hideOverlay() → Base focused
```

### Overlapping Regions

When overlays overlap, later overlays obscure earlier ones:

```
Dialog A:               Dialog B (overlapping):      Composite:
┌──────────────┐       ┌──────────────┐             ┌──────────────┐
│  Content A   │       │  Content B   │             │  Cont┌──────────────┐
│              │   +   │              │          =  │      │  Content B   │
│              │       │              │             │      │              │
└──────────────┘       └──────────────┘             └──────│              │
                                                           └──────────────┘
```

---

## Edge Cases and Safeguards

### Width Overflow Protection

```
// Before compositing each overlay line:
IF visibleWidth(overlayLine) > declaredWidth:
    overlayLine = sliceByColumn(overlayLine, 0, declaredWidth, strict=true)

// After compositing:
IF visibleWidth(compositedLine) > termWidth:
    compositedLine = sliceByColumn(compositedLine, 0, termWidth, strict=true)
```

### Image Line Protection

```
// Skip lines containing image protocols
FUNCTION containsImage(line):
    RETURN line.contains("\x1b_G")           // Kitty graphics
        OR line.contains("\x1b]1337;File=")  // iTerm2 inline images
```

### Wide Character Boundary Handling

When slicing at column boundaries, wide characters (CJK, emoji) that would extend past the boundary are excluded:

```
Content: "HELLO中文WORLD" (中文 each take 2 columns)
Slice at column 7, width 4:
  Without strict: "中文W" (中 starts at col 5, overlaps boundary)
  With strict: "O中" (excludes 文 that would extend past col 11)
```

### Empty Content Handling

```
// If base content shorter than overlay position:
WHILE result.length < minLinesNeeded:
    result.push("")
```

### Terminal Resize

On terminal resize:
1. All overlay positions recalculated
2. Visibility callbacks re-evaluated
3. Full re-render triggered

---

## Implementation Checklist

```
□ Data Structures
  □ OverlayEntry with component, options, preFocus, hidden
  □ Overlay stack (array)
  □ ANSI style tracker

□ OverlayOptions
  □ All sizing options (width, minWidth, maxHeight)
  □ All positioning options (anchor, row, col, offsetX, offsetY)
  □ Margin parsing (object and number)
  □ Visibility callback

□ Positioning
  □ Anchor calculations (9 positions)
  □ Percentage parsing
  □ Offset application
  □ Boundary clamping

□ Compositing
  □ Segment extraction with style tracking
  □ Line splicing with ANSI preservation
  □ Width overflow protection
  □ Image line protection

□ Focus Management
  □ Focus on show
  □ Focus restoration on hide
  □ Visibility change handling
  □ Input routing

□ Handle API
  □ hide() - permanent removal
  □ setHidden() - temporary toggle
  □ isHidden() - state query

□ Edge Cases
  □ Wide character boundaries
  □ Empty base content
  □ Terminal resize
  □ Multiple overlapping overlays
```

---

## References

- Source: `/reference/pi-mono/packages/tui/src/tui.ts`
- Utils: `/reference/pi-mono/packages/tui/src/utils.ts`
- Tests: `/reference/pi-mono/packages/tui/test/overlay-*.test.ts`
