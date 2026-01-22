# Component System Architecture

## Overview

The Component System provides an abstraction layer for building terminal UIs through composable, renderable elements. Components follow a declarative pattern where rendering is pure (width in, lines out) and state changes trigger re-renders via invalidation.

```
+------------------+     +------------------+     +------------------+
|    Component     |     |    Container     |     |       TUI        |
+------------------+     +------------------+     +------------------+
| render(width)    |     | children[]       |     | overlayStack[]   |
| invalidate()     |     | addChild()       |     | focusedComponent |
| handleInput()?   |     | removeChild()    |     | setFocus()       |
| wantsKeyRelease? |     | clear()          |     | showOverlay()    |
+------------------+     +------------------+     +------------------+
         ^                        ^                        ^
         |                        |                        |
         +--------inherits--------+-------inherits---------+
```

## Component Interface

### Core Interface Definition

```
interface Component {
    // REQUIRED: Pure render function
    // Input: viewport width in terminal columns
    // Output: array of rendered lines (strings)
    render(width: number) -> string[]

    // REQUIRED: Clear any cached rendering state
    // Called on theme changes or forced re-render
    invalidate() -> void

    // OPTIONAL: Handle keyboard input when focused
    // Data contains raw terminal input bytes
    handleInput(data: string) -> void

    // OPTIONAL: If true, receive key release events (Kitty protocol)
    // Default: false (release events filtered out)
    wantsKeyRelease: boolean
}
```

### Focusable Interface Extension

Components implementing focus support must expose the cursor position for IME (Input Method Editor) integration:

```
interface Focusable {
    // Set by TUI when focus changes
    // Component should emit CURSOR_MARKER when true
    focused: boolean
}

// Type guard for focus detection
function isFocusable(component: Component | null) -> boolean {
    return component !== null AND "focused" in component
}
```

### Cursor Position Marker

Components use an APC (Application Program Command) escape sequence as a zero-width cursor marker:

```
CURSOR_MARKER = "\x1b_pi:c\x07"

// Terminal ignores this sequence but TUI detects and removes it,
// positioning the hardware cursor at that location for IME support
```

## Container Implementation

Containers manage child components in a vertical stack layout.

### Container Class Structure

```
class Container implements Component {
    children: Component[] = []

    // Child management
    addChild(component: Component) -> void {
        children.push(component)
    }

    removeChild(component: Component) -> void {
        index = children.indexOf(component)
        if index != -1:
            children.splice(index, 1)
    }

    clear() -> void {
        children = []
    }

    // Propagate invalidation to all children
    invalidate() -> void {
        for child in children:
            child.invalidate()
    }

    // Render children vertically concatenated
    render(width: number) -> string[] {
        lines = []
        for child in children:
            lines.push(...child.render(width))
        return lines
    }
}
```

### Render Flow Diagram

```
Container.render(width=80)
    |
    +---> Child1.render(80) --> ["Line 1", "Line 2"]
    |
    +---> Child2.render(80) --> ["Line 3"]
    |
    +---> Child3.render(80) --> ["Line 4", "Line 5", "Line 6"]
    |
    v
    Result: ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5", "Line 6"]
```

## Focus Management

### Focus State Machine

```
                    +-------------+
                    |   UNFOCUSED |
                    +------+------+
                           |
                setFocus(component)
                           |
                           v
              +------------+------------+
              |                         |
    isFocusable(prev)?        isFocusable(new)?
              |                         |
              v                         v
      prev.focused = false     new.focused = true
              |                         |
              +------------+------------+
                           |
                           v
                    +------+------+
                    |   FOCUSED   |
                    +------+------+
                           |
                    handleInput(data)
                           |
                           v
                  +--------+--------+
                  | INPUT ROUTING   |
                  +-----------------+
                  | 1. Check wantsKeyRelease    |
                  | 2. Filter release events     |
                  | 3. Forward to handleInput() |
                  +-----------------------------+
```

### Focus Management in TUI

```
class TUI extends Container {
    focusedComponent: Component | null = null

    setFocus(component: Component | null) -> void {
        // Clear focused flag on old component
        if isFocusable(focusedComponent):
            focusedComponent.focused = false

        focusedComponent = component

        // Set focused flag on new component
        if isFocusable(component):
            component.focused = true
    }

    handleInput(data: string) -> void {
        // Filter key release events unless component opts in
        if isKeyRelease(data) AND NOT focusedComponent.wantsKeyRelease:
            return

        if focusedComponent?.handleInput:
            focusedComponent.handleInput(data)
            requestRender()
    }
}
```

### Overlay Focus Stack

Overlays maintain focus history for restoration:

```
overlayStack: Array<{
    component: Component       // The overlay component
    options?: OverlayOptions   // Positioning configuration
    preFocus: Component | null // Component that had focus before overlay
    hidden: boolean            // Temporary visibility toggle
}>

// Focus flow:
// 1. showOverlay() pushes entry, saves preFocus, focuses overlay
// 2. hideOverlay() pops entry, restores preFocus
// 3. setHidden(true) moves focus to topmost visible or preFocus
// 4. setHidden(false) restores focus to overlay (if visible)
```

## Invalidation and Caching

### Invalidation Propagation

```
                     invalidate()
                          |
              +-----------+-----------+
              |                       |
          Container               Component
              |                       |
              v                       v
    for child in children:     clear cached state:
        child.invalidate()       cachedText = undefined
                                 cachedWidth = undefined
                                 cachedLines = undefined
```

### Component Caching Pattern

Most components implement a memoization pattern:

```
class CachedComponent implements Component {
    // Cache state
    cachedText: string | undefined
    cachedWidth: number | undefined
    cachedLines: string[] | undefined

    render(width: number) -> string[] {
        // Check cache validity
        if cachedLines AND cachedText == text AND cachedWidth == width:
            return cachedLines

        // Compute new result
        lines = computeRender(width)

        // Update cache
        cachedText = text
        cachedWidth = width
        cachedLines = lines

        return lines
    }

    invalidate() -> void {
        cachedText = undefined
        cachedWidth = undefined
        cachedLines = undefined
    }
}
```

### When Invalidation Triggers

```
+-------------------+------------------------------------------+
| Trigger           | Effect                                   |
+-------------------+------------------------------------------+
| Theme change      | TUI.invalidate() -> all components       |
| Resize            | requestRender(force=true) clears cache   |
| Content change    | Component clears own cache               |
| Background fn     | Box detects via sampling bgFn output     |
+-------------------+------------------------------------------+
```

## Built-in Components

### Text Component

Displays multi-line text with word wrapping and optional background.

```
class Text implements Component {
    text: string
    paddingX: number = 1      // Left/right padding in columns
    paddingY: number = 1      // Top/bottom padding in lines
    customBgFn?: (text: string) -> string

    // Cache
    cachedText?: string
    cachedWidth?: number
    cachedLines?: string[]
}
```

#### Word Wrap Algorithm

```
function wrapTextWithAnsi(text: string, width: number) -> string[] {
    if not text:
        return [""]

    // Split on literal newlines, preserving ANSI state across breaks
    inputLines = text.split("\n")
    result = []
    tracker = AnsiCodeTracker()

    for inputLine in inputLines:
        // Prepend active codes from previous lines
        prefix = result.length > 0 ? tracker.getActiveCodes() : ""
        result.push(...wrapSingleLine(prefix + inputLine, width))

        // Track ANSI state for next line
        updateTrackerFromText(inputLine, tracker)

    return result.length > 0 ? result : [""]
}

function wrapSingleLine(line: string, width: number) -> string[] {
    if visibleWidth(line) <= width:
        return [line]

    wrapped = []
    tracker = AnsiCodeTracker()
    tokens = splitIntoTokensWithAnsi(line)

    currentLine = ""
    currentVisibleLength = 0

    for token in tokens:
        tokenWidth = visibleWidth(token)
        isWhitespace = token.trim() == ""

        // Token too long - break by character
        if tokenWidth > width AND not isWhitespace:
            if currentLine:
                wrapped.push(currentLine + tracker.getLineEndReset())
                currentLine = ""
                currentVisibleLength = 0

            broken = breakLongWord(token, width, tracker)
            wrapped.push(...broken[:-1])
            currentLine = broken[-1]
            currentVisibleLength = visibleWidth(currentLine)
            continue

        // Would exceed width - wrap
        if currentVisibleLength + tokenWidth > width AND currentVisibleLength > 0:
            wrapped.push(currentLine.trimEnd() + tracker.getLineEndReset())

            if isWhitespace:
                currentLine = tracker.getActiveCodes()
                currentVisibleLength = 0
            else:
                currentLine = tracker.getActiveCodes() + token
                currentVisibleLength = tokenWidth
        else:
            currentLine += token
            currentVisibleLength += tokenWidth

        updateTrackerFromText(token, tracker)

    if currentLine:
        wrapped.push(currentLine)

    return wrapped.map(line -> line.trimEnd()) if wrapped else [""]
}
```

#### ANSI Code Tracking

```
class AnsiCodeTracker {
    // Style attributes
    bold, dim, italic, underline: boolean = false
    blink, inverse, hidden, strikethrough: boolean = false
    fgColor, bgColor: string | null = null

    process(ansiCode: string) -> void {
        // Parse SGR parameters
        // Handle 256-color (38;5;N) and RGB (38;2;R;G;B)
        // Update attribute state
    }

    getActiveCodes() -> string {
        // Return combined SGR sequence for all active attributes
        // e.g., "\x1b[1;3;31m" for bold+italic+red
    }

    getLineEndReset() -> string {
        // Reset only problematic attributes (underline)
        // Preserves background across line breaks
        if underline:
            return "\x1b[24m"
        return ""
    }
}
```

### Box Component

Container with padding and optional background color.

```
class Box implements Component {
    children: Component[] = []
    paddingX: number = 1
    paddingY: number = 1
    bgFn?: (text: string) -> string

    // Cache with background detection
    cachedWidth?: number
    cachedChildLines?: string    // Join of child output for comparison
    cachedBgSample?: string      // bgFn("test") output for change detection
    cachedLines?: string[]
}
```

#### Box Render Algorithm

```
render(width: number) -> string[] {
    if children.length == 0:
        return []

    contentWidth = max(1, width - paddingX * 2)
    leftPad = " ".repeat(paddingX)

    // Render all children
    childLines = []
    for child in children:
        lines = child.render(contentWidth)
        for line in lines:
            childLines.push(leftPad + line)

    if childLines.length == 0:
        return []

    // Detect background changes via sampling
    bgSample = bgFn ? bgFn("test") : undefined

    // Check cache
    childLinesKey = childLines.join("\n")
    if cachedLines AND cachedWidth == width AND
       cachedChildLines == childLinesKey AND cachedBgSample == bgSample:
        return cachedLines

    // Apply background and padding
    result = []

    // Top padding
    for i in 0..paddingY:
        result.push(applyBg("", width))

    // Content
    for line in childLines:
        result.push(applyBg(line, width))

    // Bottom padding
    for i in 0..paddingY:
        result.push(applyBg("", width))

    // Update cache
    cachedWidth = width
    cachedChildLines = childLinesKey
    cachedBgSample = bgSample
    cachedLines = result

    return result
}

applyBg(line: string, width: number) -> string {
    visLen = visibleWidth(line)
    padNeeded = max(0, width - visLen)
    padded = line + " ".repeat(padNeeded)

    if bgFn:
        return applyBackgroundToLine(padded, width, bgFn)
    return padded
}
```

### SelectList Component

Scrollable selection list with keyboard navigation.

```
class SelectList implements Component {
    items: SelectItem[] = []
    filteredItems: SelectItem[] = []
    selectedIndex: number = 0
    maxVisible: number = 5
    theme: SelectListTheme

    // Callbacks
    onSelect?: (item: SelectItem) -> void
    onCancel?: () -> void
    onSelectionChange?: (item: SelectItem) -> void
}

interface SelectItem {
    value: string
    label: string
    description?: string
}

interface SelectListTheme {
    selectedPrefix: (text: string) -> string
    selectedText: (text: string) -> string
    description: (text: string) -> string
    scrollInfo: (text: string) -> string
    noMatch: (text: string) -> string
}
```

#### SelectList Scrolling Algorithm

```
render(width: number) -> string[] {
    lines = []

    if filteredItems.length == 0:
        return [theme.noMatch("  No matching commands")]

    // Calculate visible window (center selected item)
    startIndex = max(0, min(
        selectedIndex - floor(maxVisible / 2),
        filteredItems.length - maxVisible
    ))
    endIndex = min(startIndex + maxVisible, filteredItems.length)

    // Render visible items
    for i in startIndex..endIndex:
        item = filteredItems[i]
        isSelected = (i == selectedIndex)

        if isSelected:
            line = formatSelectedItem(item, width)
        else:
            line = formatUnselectedItem(item, width)

        lines.push(line)

    // Scroll indicator
    if startIndex > 0 OR endIndex < filteredItems.length:
        scrollText = "  ({selectedIndex + 1}/{filteredItems.length})"
        lines.push(theme.scrollInfo(truncateToWidth(scrollText, width - 2)))

    return lines
}
```

#### Selection Input Handling

```
handleInput(keyData: string) -> void {
    kb = getEditorKeybindings()

    // Up arrow - wrap at top
    if kb.matches(keyData, "selectUp"):
        selectedIndex = selectedIndex == 0
            ? filteredItems.length - 1
            : selectedIndex - 1
        notifySelectionChange()

    // Down arrow - wrap at bottom
    else if kb.matches(keyData, "selectDown"):
        selectedIndex = selectedIndex == filteredItems.length - 1
            ? 0
            : selectedIndex + 1
        notifySelectionChange()

    // Enter - confirm
    else if kb.matches(keyData, "selectConfirm"):
        selectedItem = filteredItems[selectedIndex]
        if selectedItem AND onSelect:
            onSelect(selectedItem)

    // Escape or Ctrl+C - cancel
    else if kb.matches(keyData, "selectCancel"):
        if onCancel:
            onCancel()
}
```

### Loader Component

Animated spinner with message.

```
class Loader extends Text {
    frames = ["*", "*", "*", "*", "*", "*", "*", "*", "*", "*"]
    currentFrame: number = 0
    intervalId: Timer | null = null
    ui: TUI | null = null
    spinnerColorFn: (str: string) -> string
    messageColorFn: (str: string) -> string
    message: string = "Loading..."

    // Frame sequences (Braille spinner pattern):
    // ["*", "*", "*", "*", "*", "*", "*", "*", "*", "*"]
    //    0    1    2    3    4    5    6    7    8    9
}
```

#### Loader Animation Loop

```
start() -> void {
    updateDisplay()
    intervalId = setInterval(() -> {
        currentFrame = (currentFrame + 1) % frames.length
        updateDisplay()
    }, 80)  // 80ms frame rate = 12.5 FPS
}

stop() -> void {
    if intervalId:
        clearInterval(intervalId)
        intervalId = null
}

updateDisplay() -> void {
    frame = frames[currentFrame]
    setText("{spinnerColorFn(frame)} {messageColorFn(message)}")
    if ui:
        ui.requestRender()
}

render(width: number) -> string[] {
    // Add empty line before spinner for visual separation
    return ["", ...super.render(width)]
}
```

### CancellableLoader Component

Extends Loader with abort capability:

```
class CancellableLoader extends Loader {
    abortController = new AbortController()
    onAbort?: () -> void

    get signal() -> AbortSignal {
        return abortController.signal
    }

    get aborted() -> boolean {
        return abortController.signal.aborted
    }

    handleInput(data: string) -> void {
        kb = getEditorKeybindings()
        if kb.matches(data, "selectCancel"):  // Escape or Ctrl+C
            abortController.abort()
            onAbort?()
    }

    dispose() -> void {
        stop()
    }
}
```

### Spacer Component

Renders empty lines for vertical spacing:

```
class Spacer implements Component {
    lines: number = 1

    setLines(lines: number) -> void {
        this.lines = lines
    }

    invalidate() -> void {
        // No cached state
    }

    render(_width: number) -> string[] {
        result = []
        for i in 0..lines:
            result.push("")
        return result
    }
}
```

### TruncatedText Component

Single-line text with truncation:

```
class TruncatedText implements Component {
    text: string
    paddingX: number = 0
    paddingY: number = 0

    render(width: number) -> string[] {
        result = []
        emptyLine = " ".repeat(width)

        // Vertical padding above
        for i in 0..paddingY:
            result.push(emptyLine)

        // Calculate available width
        availableWidth = max(1, width - paddingX * 2)

        // Take first line only
        singleLineText = text
        newlineIndex = text.indexOf("\n")
        if newlineIndex != -1:
            singleLineText = text.substring(0, newlineIndex)

        // Truncate with ANSI awareness
        displayText = truncateToWidth(singleLineText, availableWidth)

        // Add padding
        leftPadding = " ".repeat(paddingX)
        rightPadding = " ".repeat(paddingX)
        lineWithPadding = leftPadding + displayText + rightPadding

        // Pad to full width
        lineVisibleWidth = visibleWidth(lineWithPadding)
        paddingNeeded = max(0, width - lineVisibleWidth)
        finalLine = lineWithPadding + " ".repeat(paddingNeeded)

        result.push(finalLine)

        // Vertical padding below
        for i in 0..paddingY:
            result.push(emptyLine)

        return result
    }
}
```

### Input Component

Single-line text input with horizontal scrolling:

```
class Input implements Component, Focusable {
    value: string = ""
    cursor: number = 0          // Position in value string
    focused: boolean = false

    // Callbacks
    onSubmit?: (value: string) -> void
    onEscape?: () -> void

    // Paste handling
    pasteBuffer: string = ""
    isInPaste: boolean = false
    pendingShiftEnter: boolean = false
}
```

#### Input Horizontal Scrolling

```
render(width: number) -> string[] {
    prompt = "> "
    availableWidth = width - prompt.length

    if availableWidth <= 0:
        return [prompt]

    visibleText = ""
    cursorDisplay = cursor

    if value.length < availableWidth:
        // Everything fits
        visibleText = value
    else:
        // Horizontal scrolling needed
        scrollWidth = cursor == value.length
            ? availableWidth - 1  // Reserve space for cursor at end
            : availableWidth
        halfWidth = floor(scrollWidth / 2)

        if cursor < halfWidth:
            // Cursor near start
            visibleText = value.slice(0, scrollWidth)
            cursorDisplay = cursor
        else if cursor > value.length - halfWidth:
            // Cursor near end
            visibleText = value.slice(value.length - scrollWidth)
            cursorDisplay = scrollWidth - (value.length - cursor)
        else:
            // Cursor in middle
            start = cursor - halfWidth
            visibleText = value.slice(start, start + scrollWidth)
            cursorDisplay = halfWidth

    // Build line with cursor visualization
    beforeCursor = visibleText.slice(0, cursorDisplay)
    atCursor = visibleText[cursorDisplay] OR " "
    afterCursor = visibleText.slice(cursorDisplay + 1)

    // Hardware cursor marker for IME
    marker = focused ? CURSOR_MARKER : ""

    // Reverse video cursor
    cursorChar = "\x1b[7m{atCursor}\x1b[27m"
    textWithCursor = beforeCursor + marker + cursorChar + afterCursor

    // Pad to width
    padding = " ".repeat(max(0, availableWidth - visibleWidth(textWithCursor)))

    return [prompt + textWithCursor + padding]
}
```

### Editor Component

Multi-line text editor with word wrap, undo, kill ring, and autocomplete:

```
class Editor implements Component, Focusable {
    state: EditorState = {
        lines: [""],
        cursorLine: 0,
        cursorCol: 0
    }

    focused: boolean = false
    tui: TUI
    theme: EditorTheme
    paddingX: number = 0

    // Scrolling
    scrollOffset: number = 0
    lastWidth: number = 80

    // Kill ring (Emacs-style)
    killRing: string[] = []
    lastAction: "kill" | "yank" | "type-word" | null = null

    // Undo
    undoStack: EditorState[] = []

    // History (up/down navigation)
    history: string[] = []
    historyIndex: number = -1

    // Autocomplete
    autocompleteProvider?: AutocompleteProvider
    autocompleteList?: SelectList
    isAutocompleting: boolean = false

    // Callbacks
    onSubmit?: (text: string) -> void
    onChange?: (text: string) -> void
    disableSubmit: boolean = false
}
```

#### Editor Word Wrap Layout

```
function wordWrapLine(line: string, maxWidth: number) -> TextChunk[] {
    if not line OR maxWidth <= 0:
        return [{ text: "", startIndex: 0, endIndex: 0 }]

    lineWidth = visibleWidth(line)
    if lineWidth <= maxWidth:
        return [{ text: line, startIndex: 0, endIndex: line.length }]

    chunks = []

    // Tokenize into words and whitespace
    tokens = []
    currentToken = ""
    tokenStart = 0
    inWhitespace = false
    charIndex = 0

    for seg in segmenter.segment(line):
        grapheme = seg.segment
        graphemeIsWhitespace = isWhitespaceChar(grapheme)

        if currentToken == "":
            inWhitespace = graphemeIsWhitespace
            tokenStart = charIndex
        else if graphemeIsWhitespace != inWhitespace:
            tokens.push({
                text: currentToken,
                startIndex: tokenStart,
                endIndex: charIndex,
                isWhitespace: inWhitespace
            })
            currentToken = ""
            tokenStart = charIndex
            inWhitespace = graphemeIsWhitespace

        currentToken += grapheme
        charIndex += grapheme.length

    if currentToken:
        tokens.push({ text: currentToken, startIndex: tokenStart,
                      endIndex: charIndex, isWhitespace: inWhitespace })

    // Build chunks with word wrapping
    currentChunk = ""
    currentWidth = 0
    chunkStartIndex = 0
    atLineStart = true

    for token in tokens:
        tokenWidth = visibleWidth(token.text)

        // Skip leading whitespace
        if atLineStart AND token.isWhitespace:
            chunkStartIndex = token.endIndex
            continue
        atLineStart = false

        // Long token - break by character
        if tokenWidth > maxWidth:
            // ... (similar to Text component)

        // Would exceed width
        if currentWidth + tokenWidth > maxWidth:
            trimmedChunk = currentChunk.trimEnd()
            if trimmedChunk OR chunks.length == 0:
                chunks.push({
                    text: trimmedChunk,
                    startIndex: chunkStartIndex,
                    endIndex: chunkStartIndex + currentChunk.length
                })

            atLineStart = true
            if token.isWhitespace:
                currentChunk = ""
                currentWidth = 0
                chunkStartIndex = token.endIndex
            else:
                currentChunk = token.text
                currentWidth = tokenWidth
                chunkStartIndex = token.startIndex
                atLineStart = false
        else:
            currentChunk += token.text
            currentWidth += tokenWidth

    if currentChunk:
        chunks.push({
            text: currentChunk,
            startIndex: chunkStartIndex,
            endIndex: line.length
        })

    return chunks.length > 0 ? chunks : [{ text: "", startIndex: 0, endIndex: 0 }]
}
```

### Image Component

Terminal image rendering with fallback:

```
class Image implements Component {
    base64Data: string
    mimeType: string
    dimensions: ImageDimensions
    theme: ImageTheme
    options: ImageOptions

    // Cache
    cachedLines?: string[]
    cachedWidth?: number
}

interface ImageDimensions {
    widthPx: number
    heightPx: number
}

interface ImageOptions {
    maxWidthCells?: number
    maxHeightCells?: number
    filename?: string
}
```

#### Image Render Algorithm

```
render(width: number) -> string[] {
    if cachedLines AND cachedWidth == width:
        return cachedLines

    maxWidth = min(width - 2, options.maxWidthCells OR 60)
    caps = getCapabilities()

    if caps.images:
        result = renderImage(base64Data, dimensions, { maxWidthCells: maxWidth })

        if result:
            // Create placeholder lines for height
            lines = []
            for i in 0..(result.rows - 1):
                lines.push("")

            // Move cursor up and output image on last line
            moveUp = result.rows > 1 ? "\x1b[{result.rows - 1}A" : ""
            lines.push(moveUp + result.sequence)
        else:
            lines = [theme.fallbackColor(imageFallback(...))]
    else:
        lines = [theme.fallbackColor(imageFallback(...))]

    cachedLines = lines
    cachedWidth = width
    return lines
}
```

## Component Lifecycle

### Mount Phase

```
1. Component created with initial state
2. Parent adds via addChild()
3. No explicit mount callback (render on next frame)
```

### Update Phase

```
1. State changes (setText, setValue, etc.)
2. Component clears its cache
3. TUI.requestRender() queued (debounced)
4. Next tick: doRender() calls component.render(width)
```

### Unmount Phase

```
1. Parent calls removeChild()
2. Child clears from parent's children array
3. If focused, focus moves to parent or null
4. For animated components (Loader), stop() must be called
```

### Lifecycle Diagram

```
     +------------+
     |  Create    |
     +-----+------+
           |
           v
     +-----+------+      state change      +-------------+
     |  Mounted   +----------------------->+  Invalidate |
     +-----+------+                        +------+------+
           |                                      |
           |  <-------- requestRender() ----------+
           |
           v
     +-----+------+
     |  Render    |
     +-----+------+
           |
           | removeChild()
           v
     +-----+------+
     |  Unmount   |
     +------------+
```

## Custom Component Creation

### Minimal Component Template

```
class CustomComponent implements Component {
    // State
    private value: string = ""

    // Cache
    private cachedValue?: string
    private cachedWidth?: number
    private cachedLines?: string[]

    setValue(value: string) -> void {
        this.value = value
        this.invalidate()
    }

    invalidate() -> void {
        cachedValue = undefined
        cachedWidth = undefined
        cachedLines = undefined
    }

    render(width: number) -> string[] {
        // Check cache
        if cachedLines AND cachedValue == value AND cachedWidth == width:
            return cachedLines

        // Compute render
        lines = computeLines(value, width)

        // Ensure lines don't exceed width
        lines = lines.map(line -> {
            if visibleWidth(line) > width:
                return truncateToWidth(line, width)
            return line
        })

        // Update cache
        cachedValue = value
        cachedWidth = width
        cachedLines = lines

        return lines
    }
}
```

### Interactive Component Template

```
class InteractiveComponent implements Component, Focusable {
    focused: boolean = false

    handleInput(data: string) -> void {
        kb = getEditorKeybindings()

        if kb.matches(data, "selectUp"):
            // Handle up
        else if kb.matches(data, "selectDown"):
            // Handle down
        else if kb.matches(data, "selectConfirm"):
            // Handle enter
        else if kb.matches(data, "selectCancel"):
            // Handle escape
    }

    render(width: number) -> string[] {
        lines = []

        // Add cursor marker if focused
        if focused:
            cursorLine = lines[cursorPosition]
            lines[cursorPosition] = insertCursorMarker(cursorLine, cursorCol)

        return lines
    }
}
```

### Width Safety Checklist

```
1. Always respect the width parameter
2. Use visibleWidth() to measure strings with ANSI codes
3. Use truncateToWidth() for safe truncation
4. Test with narrow widths (< 20 columns)
5. Handle edge cases: width=0, empty content
6. Wide characters (CJK, emoji) count as 2 columns
```

## Composition Patterns

### Nested Containers

```
root = Container()
    header = Box(paddingX=1, paddingY=0)
        title = TruncatedText("Application Title")
    header.addChild(title)

    content = Container()
        item1 = Text("Content line 1")
        item2 = Text("Content line 2")
    content.addChild(item1)
    content.addChild(item2)

    footer = Text("Status: Ready")

root.addChild(header)
root.addChild(content)
root.addChild(footer)
```

### Focus Delegation

```
class FocusContainer implements Component {
    children: Component[] = []
    focusedIndex: number = 0

    handleInput(data: string) -> void {
        // Tab cycles focus
        if kb.matches(data, "tab"):
            focusedIndex = (focusedIndex + 1) % children.length
            // Update focus state on children
            return

        // Delegate to focused child
        focusedChild = children[focusedIndex]
        if focusedChild?.handleInput:
            focusedChild.handleInput(data)
    }
}
```

### Conditional Rendering

```
class ConditionalComponent implements Component {
    condition: boolean = true
    trueComponent: Component
    falseComponent: Component

    render(width: number) -> string[] {
        if condition:
            return trueComponent.render(width)
        else:
            return falseComponent.render(width)
    }

    invalidate() -> void {
        trueComponent.invalidate()
        falseComponent.invalidate()
    }
}
```

### Dynamic Children

```
class DynamicList implements Component {
    items: DataItem[] = []

    render(width: number) -> string[] {
        lines = []
        for item in items:
            // Create ephemeral component per render
            // (or cache and reuse with keys)
            itemComponent = createItemComponent(item)
            lines.push(...itemComponent.render(width))
        return lines
    }
}
```

## Utility Functions

### Visible Width Calculation

```
function visibleWidth(str: string) -> number {
    // Fast path: pure ASCII
    if isPureAscii(str):
        return str.length

    // Check cache
    cached = widthCache.get(str)
    if cached != undefined:
        return cached

    // Normalize: tabs -> 3 spaces, strip ANSI
    clean = str
    if str.includes("\t"):
        clean = clean.replace(/\t/g, "   ")
    if clean.includes("\x1b"):
        // Strip SGR, cursor codes
        clean = clean.replace(/\x1b\[[0-9;]*[mGKHJ]/g, "")
        // Strip OSC 8 hyperlinks
        clean = clean.replace(/\x1b\]8;;[^\x07]*\x07/g, "")
        // Strip APC sequences
        clean = clean.replace(/\x1b_[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")

    // Sum grapheme widths
    width = 0
    for seg in segmenter.segment(clean):
        width += graphemeWidth(seg.segment)

    widthCache.set(str, width)
    return width
}
```

### Truncation Function

```
function truncateToWidth(text: string, maxWidth: number,
                         ellipsis: string = "...",
                         pad: boolean = false) -> string {
    textWidth = visibleWidth(text)

    if textWidth <= maxWidth:
        return pad ? text + " ".repeat(maxWidth - textWidth) : text

    ellipsisWidth = visibleWidth(ellipsis)
    targetWidth = maxWidth - ellipsisWidth

    if targetWidth <= 0:
        return ellipsis.substring(0, maxWidth)

    // Build truncated string grapheme by grapheme
    result = ""
    currentWidth = 0

    for seg in parseSegments(text):
        if seg.type == "ansi":
            result += seg.value
            continue

        grapheme = seg.value
        graphemeWidth = visibleWidth(grapheme)

        if currentWidth + graphemeWidth > targetWidth:
            break

        result += grapheme
        currentWidth += graphemeWidth

    // Reset before ellipsis to prevent style bleeding
    truncated = "{result}\x1b[0m{ellipsis}"

    if pad:
        return truncated + " ".repeat(max(0, maxWidth - visibleWidth(truncated)))
    return truncated
}
```

### Keybinding System

```
// Available actions
type EditorAction =
    | "cursorUp" | "cursorDown" | "cursorLeft" | "cursorRight"
    | "cursorWordLeft" | "cursorWordRight"
    | "cursorLineStart" | "cursorLineEnd"
    | "pageUp" | "pageDown"
    | "deleteCharBackward" | "deleteCharForward"
    | "deleteWordBackward" | "deleteWordForward"
    | "deleteToLineStart" | "deleteToLineEnd"
    | "newLine" | "submit" | "tab"
    | "selectUp" | "selectDown" | "selectConfirm" | "selectCancel"
    | "copy" | "yank" | "yankPop" | "undo" | "expandTools"

// Default bindings
DEFAULT_EDITOR_KEYBINDINGS = {
    cursorUp: "up",
    cursorDown: "down",
    cursorLeft: "left",
    cursorRight: "right",
    cursorWordLeft: ["alt+left", "ctrl+left"],
    cursorWordRight: ["alt+right", "ctrl+right"],
    cursorLineStart: ["home", "ctrl+a"],
    cursorLineEnd: ["end", "ctrl+e"],
    deleteCharBackward: "backspace",
    deleteCharForward: "delete",
    deleteWordBackward: ["ctrl+w", "alt+backspace"],
    deleteWordForward: ["alt+d", "alt+delete"],
    deleteToLineStart: "ctrl+u",
    deleteToLineEnd: "ctrl+k",
    submit: "enter",
    newLine: "shift+enter",
    selectCancel: ["escape", "ctrl+c"],
    yank: "ctrl+y",
    yankPop: "alt+y",
    undo: "ctrl+-"
}

// Usage
kb = getEditorKeybindings()
if kb.matches(data, "selectUp"):
    // Handle up arrow
```

## Error Handling

### Width Overflow Detection

The TUI crashes if any rendered line exceeds terminal width:

```
if visibleWidth(line) > width:
    // Write crash log
    crashData = [
        "Crash at {timestamp}",
        "Terminal width: {width}",
        "Line visible width: {visibleWidth(line)}",
        "",
        "=== All rendered lines ==="
        ...
    ]
    writeFile(crashLogPath, crashData)

    // Clean up and throw
    tui.stop()
    throw Error("Rendered line exceeds terminal width")
```

### Component Best Practices

```
1. Never return lines wider than input width
2. Handle empty/null inputs gracefully
3. Invalidate cache on all state changes
4. Test with extreme widths (1, 10, 1000)
5. Use provided utility functions for width calculation
6. Reset ANSI codes at line boundaries
```
