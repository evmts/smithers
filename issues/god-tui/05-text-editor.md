# Text Editor Component - Engineering Specification

## Overview

Multi-line text editor with word wrap, kill ring, undo/redo, command history, and autocomplete. Handles Unicode grapheme clusters, terminal escape sequences, and bracketed paste mode.

---

## 1. State Model

### 1.1 Core Editor State

```
EditorState {
    lines: string[]      // Logical lines (newline-separated)
    cursorLine: number   // Index into lines array
    cursorCol: number    // Byte offset within line (not grapheme count)
}
```

**Invariants:**
- `lines.length >= 1` (empty editor has `[""]`)
- `0 <= cursorLine < lines.length`
- `0 <= cursorCol <= lines[cursorLine].length`

### 1.2 Auxiliary State

```
┌──────────────────────────────────────────────────────────────┐
│ UNDO/HISTORY                                                 │
├──────────────────────────────────────────────────────────────┤
│ undoStack: EditorState[]   // Snapshots for undo             │
│ historyIndex: number       // -1 = not browsing              │
│ history: string[]          // Past submissions (newest first)│
│ lastAction: "kill"|"yank"|"type-word"|null                   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ KILL RING                                                    │
├──────────────────────────────────────────────────────────────┤
│ killRing: string[]         // Ring buffer (newest at end)    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ PASTE TRACKING                                               │
├──────────────────────────────────────────────────────────────┤
│ pastes: Map<number, string>  // Large paste storage          │
│ pasteCounter: number         // Auto-incrementing ID         │
│ isInPaste: boolean           // In bracketed paste mode      │
│ pasteBuffer: string          // Accumulating paste data      │
│ pendingShiftEnter: boolean   // Backslash escape state       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ AUTOCOMPLETE                                                 │
├──────────────────────────────────────────────────────────────┤
│ isAutocompleting: boolean                                    │
│ autocompleteList: SelectList | null                          │
│ autocompletePrefix: string                                   │
│ autocompleteProvider: AutocompleteProvider | null            │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ RENDERING                                                    │
├──────────────────────────────────────────────────────────────┤
│ lastWidth: number          // Cached content width           │
│ scrollOffset: number       // First visible visual line      │
│ focused: boolean           // Has keyboard focus             │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Word Wrap Algorithm

### 2.1 TextChunk Structure

```
TextChunk {
    text: string         // Display text (may have trailing whitespace trimmed)
    startIndex: number   // Byte offset in original line
    endIndex: number     // Byte offset of end in original line
}
```

### 2.2 Word Wrap Algorithm

```
FUNCTION wordWrapLine(line: string, maxWidth: number) -> TextChunk[]
    IF line is empty OR maxWidth <= 0:
        RETURN [{ text: "", startIndex: 0, endIndex: 0 }]

    IF visibleWidth(line) <= maxWidth:
        RETURN [{ text: line, startIndex: 0, endIndex: line.length }]

    // Phase 1: Tokenize into words and whitespace runs
    tokens = []
    currentToken = ""
    tokenStart = 0
    inWhitespace = false
    charIndex = 0

    FOR EACH grapheme IN segment(line):
        graphemeIsWhitespace = isWhitespaceChar(grapheme)

        IF currentToken is empty:
            inWhitespace = graphemeIsWhitespace
            tokenStart = charIndex
        ELSE IF graphemeIsWhitespace != inWhitespace:
            // Token type changed - save current
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

    // Push final token
    IF currentToken:
        tokens.push({...})

    // Phase 2: Build chunks using word boundaries
    chunks = []
    currentChunk = ""
    currentWidth = 0
    chunkStartIndex = 0
    atLineStart = true

    FOR EACH token IN tokens:
        tokenWidth = visibleWidth(token.text)

        // Skip leading whitespace at line start
        IF atLineStart AND token.isWhitespace:
            chunkStartIndex = token.endIndex
            CONTINUE
        atLineStart = false

        // Handle oversized tokens (break by grapheme)
        IF tokenWidth > maxWidth:
            // Push accumulated chunk first
            IF currentChunk:
                chunks.push(currentChunk, chunkStartIndex, token.startIndex)
                currentChunk = ""
                currentWidth = 0
                chunkStartIndex = token.startIndex

            // Break token by grapheme
            FOR EACH grapheme IN segment(token.text):
                graphemeWidth = visibleWidth(grapheme)
                IF currentWidth + graphemeWidth > maxWidth AND currentChunk:
                    chunks.push(...)
                    // Reset for new chunk
                ELSE:
                    currentChunk += grapheme
                    currentWidth += graphemeWidth
            CONTINUE

        // Check if adding token exceeds width
        IF currentWidth + tokenWidth > maxWidth:
            // Push current chunk (trim trailing whitespace)
            chunks.push(currentChunk.trimEnd(), ...)

            // Start new line
            atLineStart = true
            IF token.isWhitespace:
                currentChunk = ""
                currentWidth = 0
                chunkStartIndex = token.endIndex
            ELSE:
                currentChunk = token.text
                currentWidth = tokenWidth
                chunkStartIndex = token.startIndex
                atLineStart = false
        ELSE:
            currentChunk += token.text
            currentWidth += tokenWidth

    // Push final chunk
    IF currentChunk:
        chunks.push(...)

    RETURN chunks
```

### 2.3 Visual Line Mapping

```
VisualLineInfo {
    logicalLine: number    // Index into state.lines
    startCol: number       // Starting byte offset
    length: number         // Byte length of this visual segment
}

FUNCTION buildVisualLineMap(width: number) -> VisualLineInfo[]
    visualLines = []

    FOR i = 0 TO lines.length - 1:
        line = lines[i]
        lineVisWidth = visibleWidth(line)

        IF line.length == 0:
            // Empty line still occupies one visual line
            visualLines.push({ logicalLine: i, startCol: 0, length: 0 })
        ELSE IF lineVisWidth <= width:
            visualLines.push({ logicalLine: i, startCol: 0, length: line.length })
        ELSE:
            // Line needs wrapping
            chunks = wordWrapLine(line, width)
            FOR EACH chunk IN chunks:
                visualLines.push({
                    logicalLine: i,
                    startCol: chunk.startIndex,
                    length: chunk.endIndex - chunk.startIndex
                })

    RETURN visualLines
```

### 2.4 Finding Current Visual Line

```
FUNCTION findCurrentVisualLine(visualLines: VisualLineInfo[]) -> number
    FOR i = 0 TO visualLines.length - 1:
        vl = visualLines[i]
        IF vl.logicalLine == cursorLine:
            colInSegment = cursorCol - vl.startCol
            isLastSegment = (i == visualLines.length - 1) OR
                            (visualLines[i + 1].logicalLine != vl.logicalLine)

            // Cursor belongs here if within range
            // For last segment, cursor can be at length (end position)
            IF colInSegment >= 0 AND (colInSegment < vl.length OR
                                      (isLastSegment AND colInSegment <= vl.length)):
                RETURN i

    RETURN visualLines.length - 1  // Fallback
```

---

## 3. Cursor Movement Algorithms

### 3.1 Character Movement (Left/Right)

```
FUNCTION moveCursorHorizontal(direction: -1|1)
    lastAction = null
    line = lines[cursorLine]

    IF direction > 0:  // Moving right
        IF cursorCol < line.length:
            // Move by one grapheme
            afterCursor = line.slice(cursorCol)
            graphemes = segment(afterCursor)
            firstGrapheme = graphemes[0]
            cursorCol += firstGrapheme.length
        ELSE IF cursorLine < lines.length - 1:
            // Wrap to start of next logical line
            cursorLine++
            cursorCol = 0
    ELSE:  // Moving left
        IF cursorCol > 0:
            // Move by one grapheme
            beforeCursor = line.slice(0, cursorCol)
            graphemes = segment(beforeCursor)
            lastGrapheme = graphemes[graphemes.length - 1]
            cursorCol -= lastGrapheme.length
        ELSE IF cursorLine > 0:
            // Wrap to end of previous logical line
            cursorLine--
            cursorCol = lines[cursorLine].length
```

### 3.2 Vertical Movement (Up/Down)

```
FUNCTION moveCursorVertical(delta: number)
    lastAction = null

    // Build visual line map
    visualLines = buildVisualLineMap(lastWidth)
    currentVisualLine = findCurrentVisualLine(visualLines)

    // Calculate column within current visual line
    currentVL = visualLines[currentVisualLine]
    visualCol = cursorCol - currentVL.startCol

    // Calculate target visual line
    targetVisualLine = currentVisualLine + delta

    IF targetVisualLine >= 0 AND targetVisualLine < visualLines.length:
        targetVL = visualLines[targetVisualLine]
        cursorLine = targetVL.logicalLine

        // Try to maintain visual column, clamped to line length
        targetCol = targetVL.startCol + min(visualCol, targetVL.length)
        logicalLine = lines[targetVL.logicalLine]
        cursorCol = min(targetCol, logicalLine.length)
```

### 3.3 Word Movement

```
FUNCTION moveWordBackwards()
    lastAction = null
    line = lines[cursorLine]

    // If at start of line, move to end of previous line
    IF cursorCol == 0:
        IF cursorLine > 0:
            cursorLine--
            cursorCol = lines[cursorLine].length
        RETURN

    textBeforeCursor = line.slice(0, cursorCol)
    graphemes = segment(textBeforeCursor)
    newCol = cursorCol

    // Phase 1: Skip trailing whitespace
    WHILE graphemes.length > 0 AND isWhitespace(graphemes.last()):
        newCol -= graphemes.pop().length

    // Phase 2: Skip word or punctuation run
    IF graphemes.length > 0:
        lastChar = graphemes.last()
        IF isPunctuation(lastChar):
            // Skip punctuation run
            WHILE graphemes.length > 0 AND isPunctuation(graphemes.last()):
                newCol -= graphemes.pop().length
        ELSE:
            // Skip word run (non-whitespace, non-punctuation)
            WHILE graphemes.length > 0 AND
                  NOT isWhitespace(graphemes.last()) AND
                  NOT isPunctuation(graphemes.last()):
                newCol -= graphemes.pop().length

    cursorCol = newCol


FUNCTION moveWordForwards()
    lastAction = null
    line = lines[cursorLine]

    // If at end of line, move to start of next line
    IF cursorCol >= line.length:
        IF cursorLine < lines.length - 1:
            cursorLine++
            cursorCol = 0
        RETURN

    textAfterCursor = line.slice(cursorCol)
    iterator = segment(textAfterCursor).iterator()

    // Phase 1: Skip leading whitespace
    WHILE NOT iterator.done AND isWhitespace(iterator.current):
        cursorCol += iterator.current.length
        iterator.next()

    // Phase 2: Skip word or punctuation run
    IF NOT iterator.done:
        firstChar = iterator.current
        IF isPunctuation(firstChar):
            // Skip punctuation run
            WHILE NOT iterator.done AND isPunctuation(iterator.current):
                cursorCol += iterator.current.length
                iterator.next()
        ELSE:
            // Skip word run
            WHILE NOT iterator.done AND
                  NOT isWhitespace(iterator.current) AND
                  NOT isPunctuation(iterator.current):
                cursorCol += iterator.current.length
                iterator.next()
```

### 3.4 Line Start/End Movement

```
FUNCTION moveToLineStart()
    lastAction = null
    cursorCol = 0

FUNCTION moveToLineEnd()
    lastAction = null
    cursorCol = lines[cursorLine].length
```

### 3.5 Page Scroll

```
FUNCTION pageScroll(direction: -1|1)
    lastAction = null
    pageSize = max(5, floor(terminalRows * 0.3))

    visualLines = buildVisualLineMap(lastWidth)
    currentVisualLine = findCurrentVisualLine(visualLines)

    targetVisualLine = clamp(currentVisualLine + direction * pageSize,
                             0, visualLines.length - 1)

    targetVL = visualLines[targetVisualLine]
    currentVL = visualLines[currentVisualLine]
    visualCol = cursorCol - currentVL.startCol

    cursorLine = targetVL.logicalLine
    targetCol = targetVL.startCol + min(visualCol, targetVL.length)
    cursorCol = min(targetCol, lines[targetVL.logicalLine].length)
```

---

## 4. Text Manipulation Operations

### 4.1 Character Insertion

```
FUNCTION insertCharacter(char: string, skipUndoCoalescing: boolean = false)
    historyIndex = -1  // Exit history browsing

    // Undo coalescing (fish shell style)
    IF NOT skipUndoCoalescing:
        IF isWhitespace(char) OR lastAction != "type-word":
            pushUndoSnapshot()
        lastAction = "type-word"

    line = lines[cursorLine]
    before = line.slice(0, cursorCol)
    after = line.slice(cursorCol)

    lines[cursorLine] = before + char + after
    cursorCol += char.length

    triggerOnChange()
    maybeUpdateAutocomplete()
```

### 4.2 Backspace (Delete Backward)

```
FUNCTION handleBackspace()
    historyIndex = -1
    lastAction = null

    IF cursorCol > 0:
        pushUndoSnapshot()

        // Delete one grapheme before cursor
        line = lines[cursorLine]
        beforeCursor = line.slice(0, cursorCol)
        graphemes = segment(beforeCursor)
        lastGrapheme = graphemes.last()
        graphemeLength = lastGrapheme.length

        before = line.slice(0, cursorCol - graphemeLength)
        after = line.slice(cursorCol)

        lines[cursorLine] = before + after
        cursorCol -= graphemeLength

    ELSE IF cursorLine > 0:
        pushUndoSnapshot()

        // Merge with previous line
        currentLine = lines[cursorLine]
        previousLine = lines[cursorLine - 1]

        lines[cursorLine - 1] = previousLine + currentLine
        lines.splice(cursorLine, 1)

        cursorLine--
        cursorCol = previousLine.length

    triggerOnChange()
    maybeUpdateAutocomplete()
```

### 4.3 Forward Delete

```
FUNCTION handleForwardDelete()
    historyIndex = -1
    lastAction = null

    line = lines[cursorLine]

    IF cursorCol < line.length:
        pushUndoSnapshot()

        // Delete one grapheme at cursor
        afterCursor = line.slice(cursorCol)
        graphemes = segment(afterCursor)
        firstGrapheme = graphemes[0]
        graphemeLength = firstGrapheme.length

        before = line.slice(0, cursorCol)
        after = line.slice(cursorCol + graphemeLength)

        lines[cursorLine] = before + after

    ELSE IF cursorLine < lines.length - 1:
        pushUndoSnapshot()

        // Merge with next line
        nextLine = lines[cursorLine + 1]
        lines[cursorLine] = line + nextLine
        lines.splice(cursorLine + 1, 1)

    triggerOnChange()
    maybeUpdateAutocomplete()
```

### 4.4 Delete to Line Start (Ctrl+U)

```
FUNCTION deleteToStartOfLine()
    historyIndex = -1
    line = lines[cursorLine]

    IF cursorCol > 0:
        pushUndoSnapshot()

        // Save deleted text to kill ring (backward = prepend)
        deletedText = line.slice(0, cursorCol)
        addToKillRing(deletedText, prepend=true)
        lastAction = "kill"

        lines[cursorLine] = line.slice(cursorCol)
        cursorCol = 0

    ELSE IF cursorLine > 0:
        pushUndoSnapshot()

        // At start of line - merge with previous (newline deleted)
        addToKillRing("\n", prepend=true)
        lastAction = "kill"

        previousLine = lines[cursorLine - 1]
        lines[cursorLine - 1] = previousLine + line
        lines.splice(cursorLine, 1)
        cursorLine--
        cursorCol = previousLine.length

    triggerOnChange()
```

### 4.5 Delete to Line End (Ctrl+K)

```
FUNCTION deleteToEndOfLine()
    historyIndex = -1
    line = lines[cursorLine]

    IF cursorCol < line.length:
        pushUndoSnapshot()

        // Save deleted text to kill ring (forward = append)
        deletedText = line.slice(cursorCol)
        addToKillRing(deletedText, prepend=false)
        lastAction = "kill"

        lines[cursorLine] = line.slice(0, cursorCol)

    ELSE IF cursorLine < lines.length - 1:
        pushUndoSnapshot()

        // At end of line - merge with next (newline deleted)
        addToKillRing("\n", prepend=false)
        lastAction = "kill"

        nextLine = lines[cursorLine + 1]
        lines[cursorLine] = line + nextLine
        lines.splice(cursorLine + 1, 1)

    triggerOnChange()
```

### 4.6 Delete Word Backward (Ctrl+W / Alt+Backspace)

```
FUNCTION deleteWordBackwards()
    historyIndex = -1
    line = lines[cursorLine]

    IF cursorCol == 0:
        IF cursorLine > 0:
            pushUndoSnapshot()

            // Treat newline as deleted text
            addToKillRing("\n", prepend=true)
            lastAction = "kill"

            previousLine = lines[cursorLine - 1]
            lines[cursorLine - 1] = previousLine + line
            lines.splice(cursorLine, 1)
            cursorLine--
            cursorCol = previousLine.length
    ELSE:
        pushUndoSnapshot()

        // Save lastAction before movement (which resets it)
        wasKill = lastAction == "kill"

        oldCursorCol = cursorCol
        moveWordBackwards()  // This sets lastAction = null
        deleteFrom = cursorCol
        cursorCol = oldCursorCol

        // Restore kill state for accumulation
        lastAction = wasKill ? "kill" : null
        deletedText = line.slice(deleteFrom, cursorCol)
        addToKillRing(deletedText, prepend=true)
        lastAction = "kill"

        lines[cursorLine] = line.slice(0, deleteFrom) + line.slice(cursorCol)
        cursorCol = deleteFrom

    triggerOnChange()
```

### 4.7 Delete Word Forward (Alt+D / Alt+Delete)

```
FUNCTION deleteWordForward()
    historyIndex = -1
    line = lines[cursorLine]

    IF cursorCol >= line.length:
        IF cursorLine < lines.length - 1:
            pushUndoSnapshot()

            addToKillRing("\n", prepend=false)
            lastAction = "kill"

            nextLine = lines[cursorLine + 1]
            lines[cursorLine] = line + nextLine
            lines.splice(cursorLine + 1, 1)
    ELSE:
        pushUndoSnapshot()

        wasKill = lastAction == "kill"

        oldCursorCol = cursorCol
        moveWordForwards()
        deleteTo = cursorCol
        cursorCol = oldCursorCol

        lastAction = wasKill ? "kill" : null
        deletedText = line.slice(cursorCol, deleteTo)
        addToKillRing(deletedText, prepend=false)
        lastAction = "kill"

        lines[cursorLine] = line.slice(0, cursorCol) + line.slice(deleteTo)

    triggerOnChange()
```

### 4.8 Add New Line (Shift+Enter)

```
FUNCTION addNewLine()
    historyIndex = -1
    lastAction = null
    pushUndoSnapshot()

    line = lines[cursorLine]
    before = line.slice(0, cursorCol)
    after = line.slice(cursorCol)

    lines[cursorLine] = before
    lines.splice(cursorLine + 1, 0, after)

    cursorLine++
    cursorCol = 0

    triggerOnChange()
```

---

## 5. Kill Ring

### 5.1 Data Structure

```
killRing: string[]   // Ring buffer, newest entry at END
lastAction: "kill" | "yank" | "type-word" | null
```

**Key properties:**
- Maximum size: unbounded (could add limit if needed)
- Newest entry at `killRing[killRing.length - 1]`
- Rotation for yank-pop: move end to front

### 5.2 Adding to Kill Ring

```
FUNCTION addToKillRing(text: string, prepend: boolean)
    IF text is empty:
        RETURN

    IF lastAction == "kill" AND killRing.length > 0:
        // Accumulate with most recent entry
        lastEntry = killRing.pop()
        IF prepend:
            killRing.push(text + lastEntry)
        ELSE:
            killRing.push(lastEntry + text)
    ELSE:
        // Add new entry
        killRing.push(text)
```

**Accumulation behavior:**
- Consecutive kill operations accumulate into single entry
- Backward kills (Ctrl+U, Ctrl+W backward) prepend
- Forward kills (Ctrl+K, Alt+D forward) append
- Non-kill action breaks accumulation chain

### 5.3 Yank (Ctrl+Y)

```
FUNCTION yank()
    IF killRing.length == 0:
        RETURN

    pushUndoSnapshot()

    text = killRing[killRing.length - 1]  // Most recent
    insertYankedText(text)

    lastAction = "yank"
```

### 5.4 Yank-Pop (Alt+Y)

```
FUNCTION yankPop()
    // Only works immediately after yank
    IF lastAction != "yank" OR killRing.length <= 1:
        RETURN

    pushUndoSnapshot()

    // Delete previously yanked text
    deleteYankedText()

    // Rotate ring: move end to front
    lastEntry = killRing.pop()
    killRing.unshift(lastEntry)

    // Insert new most recent (now at end after rotation)
    text = killRing[killRing.length - 1]
    insertYankedText(text)

    lastAction = "yank"  // Allow continued cycling
```

### 5.5 Insert/Delete Yanked Text

```
FUNCTION insertYankedText(text: string)
    historyIndex = -1
    lines = text.split("\n")

    IF lines.length == 1:
        // Single line insert
        currentLine = lines[cursorLine]
        before = currentLine.slice(0, cursorCol)
        after = currentLine.slice(cursorCol)
        lines[cursorLine] = before + text + after
        cursorCol += text.length
    ELSE:
        // Multi-line insert
        currentLine = lines[cursorLine]
        before = currentLine.slice(0, cursorCol)
        after = currentLine.slice(cursorCol)

        // First line merges with before
        lines[cursorLine] = before + lines[0]

        // Middle lines inserted
        FOR i = 1 TO lines.length - 2:
            lines.splice(cursorLine + i, 0, lines[i])

        // Last line merges with after
        lastLineIndex = cursorLine + lines.length - 1
        lines.splice(lastLineIndex, 0, lines[lines.length - 1] + after)

        cursorLine = lastLineIndex
        cursorCol = lines[lines.length - 1].length

    triggerOnChange()


FUNCTION deleteYankedText()
    yankedText = killRing[killRing.length - 1]
    IF yankedText is empty:
        RETURN

    yankLines = yankedText.split("\n")

    IF yankLines.length == 1:
        // Single line - delete backward from cursor
        line = lines[cursorLine]
        deleteLen = yankedText.length
        before = line.slice(0, cursorCol - deleteLen)
        after = line.slice(cursorCol)
        lines[cursorLine] = before + after
        cursorCol -= deleteLen
    ELSE:
        // Multi-line delete
        startLine = cursorLine - (yankLines.length - 1)
        startCol = lines[startLine].length - yankLines[0].length

        afterCursor = lines[cursorLine].slice(cursorCol)
        beforeYank = lines[startLine].slice(0, startCol)

        // Remove all yanked lines and replace with merged line
        lines.splice(startLine, yankLines.length, beforeYank + afterCursor)

        cursorLine = startLine
        cursorCol = startCol

    triggerOnChange()
```

---

## 6. Undo System

### 6.1 Snapshot Structure

```
undoStack: EditorState[]
```

Each snapshot is a **deep clone** of `EditorState`:
```
FUNCTION captureUndoSnapshot() -> EditorState
    RETURN structuredClone(state)

FUNCTION restoreUndoSnapshot(snapshot: EditorState)
    Object.assign(state, structuredClone(snapshot))
```

### 6.2 Undo Coalescing

Undo coalescing groups related operations:

```
┌─────────────────────────────────────────────────────────────┐
│ COALESCING RULES (fish shell style)                         │
├─────────────────────────────────────────────────────────────┤
│ 1. Consecutive word characters coalesce                     │
│    - "hello" typed = 1 undo unit                            │
│                                                             │
│ 2. Whitespace/punctuation captures state before itself      │
│    - "hello world" = 2 undo units                           │
│    - First undo removes " world"                            │
│    - Second undo removes "hello"                            │
│                                                             │
│ 3. Non-character actions break coalescing                   │
│    - Cursor movement, paste, yank, kill                     │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 When Snapshots Are Pushed

| Operation | Snapshot Timing |
|-----------|-----------------|
| Character insert | Before first char OR before whitespace/punct |
| Backspace | Before each operation |
| Forward delete | Before each operation |
| Delete word | Before each operation |
| Kill line | Before each operation |
| Newline | Before operation |
| Paste | Before paste content inserted |
| Yank | Before yank |
| History navigate | When first entering history mode |
| External setText | Before if content differs |

### 6.4 Undo Operation

```
FUNCTION undo()
    historyIndex = -1  // Exit history browsing

    IF undoStack.length == 0:
        RETURN

    snapshot = undoStack.pop()
    restoreUndoSnapshot(snapshot)
    lastAction = null

    triggerOnChange()
```

---

## 7. Command History Navigation

### 7.1 History Storage

```
history: string[]        // Past submissions, newest at index 0
historyIndex: number     // -1 = not browsing, 0 = most recent
MAX_HISTORY_SIZE = 100
```

### 7.2 Adding to History

```
FUNCTION addToHistory(text: string)
    trimmed = text.trim()
    IF trimmed is empty:
        RETURN

    // Don't add consecutive duplicates
    IF history.length > 0 AND history[0] == trimmed:
        RETURN

    history.unshift(trimmed)

    IF history.length > MAX_HISTORY_SIZE:
        history.pop()
```

### 7.3 History Navigation

```
FUNCTION navigateHistory(direction: 1|-1)  // 1=down, -1=up
    lastAction = null

    IF history.length == 0:
        RETURN

    newIndex = historyIndex - direction  // Up increases index

    IF newIndex < -1 OR newIndex >= history.length:
        RETURN

    // Capture state when first entering history mode
    IF historyIndex == -1 AND newIndex >= 0:
        pushUndoSnapshot()

    historyIndex = newIndex

    IF historyIndex == -1:
        // Returned to "current" - clear editor
        setTextInternal("")
    ELSE:
        setTextInternal(history[historyIndex])
```

### 7.4 History + Cursor Position Logic

```
ON Up Arrow:
    IF editor is empty:
        navigateHistory(-1)  // Go to history
    ELSE IF historyIndex > -1 AND onFirstVisualLine():
        navigateHistory(-1)  // Continue through history
    ELSE:
        moveCursor(-1, 0)    // Normal vertical movement

ON Down Arrow:
    IF historyIndex > -1 AND onLastVisualLine():
        navigateHistory(1)   // Move toward current
    ELSE:
        moveCursor(1, 0)     // Normal vertical movement
```

---

## 8. Bracketed Paste Handling

### 8.1 Protocol

Terminal sends:
```
\x1b[200~<paste content>\x1b[201~
```

### 8.2 State Machine

```
isInPaste: boolean = false
pasteBuffer: string = ""

FUNCTION handleInput(data: string)
    // Check for paste start
    IF data.includes("\x1b[200~"):
        isInPaste = true
        pasteBuffer = ""
        data = data.replace("\x1b[200~", "")

    IF isInPaste:
        pasteBuffer += data
        endIndex = pasteBuffer.indexOf("\x1b[201~")

        IF endIndex != -1:
            // Extract paste content
            pasteContent = pasteBuffer.substring(0, endIndex)
            IF pasteContent.length > 0:
                handlePaste(pasteContent)

            isInPaste = false
            remaining = pasteBuffer.substring(endIndex + 6)
            pasteBuffer = ""

            // Process remaining input
            IF remaining.length > 0:
                handleInput(remaining)

        RETURN  // Wait for paste end

    // Normal input handling...
```

### 8.3 Large Paste Compression

```
pastes: Map<number, string>  // ID -> full content
pasteCounter: number = 0
LARGE_PASTE_THRESHOLD_LINES = 10
LARGE_PASTE_THRESHOLD_CHARS = 1000

FUNCTION handlePaste(pastedText: string)
    historyIndex = -1
    lastAction = null
    pushUndoSnapshot()

    // Clean text
    cleanText = pastedText
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\t/g, "    ")
        .filter(char => char == "\n" OR char.code >= 32)

    // Auto-prepend space if pasting path after word
    IF cleanText matches /^[/~.]/ AND charBeforeCursor is word char:
        cleanText = " " + cleanText

    lines = cleanText.split("\n")
    totalChars = cleanText.length

    // Check for large paste
    IF lines.length > 10 OR totalChars > 1000:
        pasteCounter++
        pasteId = pasteCounter
        pastes.set(pasteId, cleanText)

        // Insert marker
        marker = lines.length > 10
            ? "[paste #${pasteId} +${lines.length} lines]"
            : "[paste #${pasteId} ${totalChars} chars]"

        FOR char IN marker:
            insertCharacter(char, skipUndoCoalescing=true)
        RETURN

    // Normal paste - insert characters
    IF lines.length == 1:
        FOR char IN lines[0]:
            insertCharacter(char, skipUndoCoalescing=true)
    ELSE:
        // Multi-line paste (detailed insertion logic)
        ...
```

### 8.4 Paste Marker Expansion

On submit, markers are expanded:
```
FUNCTION expandPasteMarkers(text: string) -> string
    result = text
    FOR (pasteId, content) IN pastes:
        regex = /\[paste #${pasteId}( (\+\d+ lines|\d+ chars))?\]/g
        result = result.replace(regex, content)
    RETURN result
```

---

## 9. Autocomplete System

### 9.1 Trigger Conditions

```
Auto-trigger on character insert:
    "/" at message start     -> Slash command completion
    "@" after space/start    -> File reference completion
    alphanumeric in "/" ctx  -> Update slash completion
    alphanumeric in "@" ctx  -> Update file completion

Manual trigger on Tab:
    In "/" context           -> Slash command completion
    Elsewhere                -> File path completion
```

### 9.2 State Management

```
isAutocompleting: boolean = false
autocompleteList: SelectList | null
autocompletePrefix: string = ""  // Current match prefix
autocompleteProvider: AutocompleteProvider | null
```

### 9.3 Autocomplete Flow

```
FUNCTION tryTriggerAutocomplete(explicitTab: boolean = false)
    IF NOT autocompleteProvider:
        RETURN

    IF explicitTab:
        // Check if provider allows file completion here
        IF NOT provider.shouldTriggerFileCompletion(...):
            RETURN

    suggestions = provider.getSuggestions(lines, cursorLine, cursorCol)

    IF suggestions AND suggestions.items.length > 0:
        autocompletePrefix = suggestions.prefix
        autocompleteList = new SelectList(suggestions.items, 5, theme)
        isAutocompleting = true
    ELSE:
        cancelAutocomplete()


FUNCTION updateAutocomplete()
    IF NOT isAutocompleting OR NOT autocompleteProvider:
        RETURN

    suggestions = provider.getSuggestions(lines, cursorLine, cursorCol)

    IF suggestions AND suggestions.items.length > 0:
        autocompletePrefix = suggestions.prefix
        autocompleteList = new SelectList(suggestions.items, 5, theme)
    ELSE:
        cancelAutocomplete()


FUNCTION cancelAutocomplete()
    isAutocompleting = false
    autocompleteList = null
    autocompletePrefix = ""
```

### 9.4 Autocomplete Input Handling

```
IF isAutocompleting AND autocompleteList:
    IF Escape OR Ctrl+C:
        cancelAutocomplete()
        RETURN

    IF Up OR Down:
        autocompleteList.handleInput(data)
        RETURN

    IF Tab OR Enter:
        selected = autocompleteList.getSelectedItem()
        IF selected AND autocompleteProvider:
            pushUndoSnapshot()
            lastAction = null
            result = provider.applyCompletion(
                lines, cursorLine, cursorCol, selected, autocompletePrefix
            )
            lines = result.lines
            cursorLine = result.cursorLine
            cursorCol = result.cursorCol

            IF autocompletePrefix.startsWith("/"):
                cancelAutocomplete()
                // Fall through to submit if Enter
            ELSE:
                cancelAutocomplete()
                triggerOnChange()
                RETURN
```

---

## 10. Rendering

### 10.1 Layout Line Structure

```
LayoutLine {
    text: string           // Display text for this visual line
    hasCursor: boolean     // Whether cursor is on this line
    cursorPos?: number     // Byte position of cursor in text
}
```

### 10.2 Layout Algorithm

```
FUNCTION layoutText(contentWidth: number) -> LayoutLine[]
    layoutLines = []

    IF lines is empty OR (lines.length == 1 AND lines[0] == ""):
        RETURN [{ text: "", hasCursor: true, cursorPos: 0 }]

    FOR i = 0 TO lines.length - 1:
        line = lines[i]
        isCurrentLine = (i == cursorLine)
        lineVisWidth = visibleWidth(line)

        IF lineVisWidth <= contentWidth:
            // No wrapping needed
            IF isCurrentLine:
                layoutLines.push({ text: line, hasCursor: true, cursorPos: cursorCol })
            ELSE:
                layoutLines.push({ text: line, hasCursor: false })
        ELSE:
            // Word wrap
            chunks = wordWrapLine(line, contentWidth)

            FOR chunkIndex = 0 TO chunks.length - 1:
                chunk = chunks[chunkIndex]
                isLastChunk = (chunkIndex == chunks.length - 1)

                // Determine cursor position in chunk
                hasCursorInChunk = false
                adjustedCursorPos = 0

                IF isCurrentLine:
                    IF isLastChunk:
                        hasCursorInChunk = cursorCol >= chunk.startIndex
                        adjustedCursorPos = cursorCol - chunk.startIndex
                    ELSE:
                        hasCursorInChunk = cursorCol >= chunk.startIndex AND
                                           cursorCol < chunk.endIndex
                        IF hasCursorInChunk:
                            adjustedCursorPos = cursorCol - chunk.startIndex
                            // Clamp to text length
                            adjustedCursorPos = min(adjustedCursorPos, chunk.text.length)

                IF hasCursorInChunk:
                    layoutLines.push({
                        text: chunk.text,
                        hasCursor: true,
                        cursorPos: adjustedCursorPos
                    })
                ELSE:
                    layoutLines.push({ text: chunk.text, hasCursor: false })

    RETURN layoutLines
```

### 10.3 Render Output

```
FUNCTION render(width: number) -> string[]
    paddingX = min(this.paddingX, floor((width - 1) / 2))
    contentWidth = max(1, width - paddingX * 2)
    lastWidth = contentWidth

    layoutLines = layoutText(contentWidth)

    // Calculate visible lines
    maxVisibleLines = max(5, floor(terminalRows * 0.3))

    // Find cursor line
    cursorLineIndex = layoutLines.findIndex(l => l.hasCursor)

    // Adjust scroll to keep cursor visible
    IF cursorLineIndex < scrollOffset:
        scrollOffset = cursorLineIndex
    ELSE IF cursorLineIndex >= scrollOffset + maxVisibleLines:
        scrollOffset = cursorLineIndex - maxVisibleLines + 1

    // Clamp scroll
    maxScrollOffset = max(0, layoutLines.length - maxVisibleLines)
    scrollOffset = clamp(scrollOffset, 0, maxScrollOffset)

    visibleLines = layoutLines.slice(scrollOffset, scrollOffset + maxVisibleLines)

    result = []
    leftPadding = " ".repeat(paddingX)
    rightPadding = leftPadding

    // Top border with scroll indicator
    IF scrollOffset > 0:
        indicator = "--- ^ ${scrollOffset} more "
        result.push(borderColor(indicator + "-".repeat(width - indicator.length)))
    ELSE:
        result.push(borderColor("-".repeat(width)))

    // Render visible lines
    emitCursorMarker = focused AND NOT isAutocompleting

    FOR layoutLine IN visibleLines:
        displayText = layoutLine.text
        lineVisWidth = visibleWidth(layoutLine.text)

        IF layoutLine.hasCursor AND layoutLine.cursorPos defined:
            before = displayText.slice(0, layoutLine.cursorPos)
            after = displayText.slice(layoutLine.cursorPos)
            marker = emitCursorMarker ? CURSOR_MARKER : ""

            IF after.length > 0:
                // Cursor on character
                firstGrapheme = segment(after)[0]
                restAfter = after.slice(firstGrapheme.length)
                cursor = "\x1b[7m" + firstGrapheme + "\x1b[0m"
                displayText = before + marker + cursor + restAfter
            ELSE:
                // Cursor at end
                IF lineVisWidth < contentWidth:
                    cursor = "\x1b[7m \x1b[0m"
                    displayText = before + marker + cursor
                    lineVisWidth++
                ELSE:
                    // Full width - reverse last char
                    graphemes = segment(before)
                    lastGrapheme = graphemes.last()
                    beforeWithoutLast = graphemes.slice(0, -1).join("")
                    cursor = "\x1b[7m" + lastGrapheme + "\x1b[0m"
                    displayText = beforeWithoutLast + marker + cursor

        padding = " ".repeat(max(0, contentWidth - lineVisWidth))
        result.push(leftPadding + displayText + padding + rightPadding)

    // Bottom border with scroll indicator
    linesBelow = layoutLines.length - (scrollOffset + visibleLines.length)
    IF linesBelow > 0:
        indicator = "--- v ${linesBelow} more "
        result.push(borderColor(indicator + "-".repeat(width - indicator.length)))
    ELSE:
        result.push(borderColor("-".repeat(width)))

    // Autocomplete dropdown
    IF isAutocompleting AND autocompleteList:
        autocompleteLines = autocompleteList.render(contentWidth)
        FOR line IN autocompleteLines:
            lineWidth = visibleWidth(line)
            linePadding = " ".repeat(max(0, contentWidth - lineWidth))
            result.push(leftPadding + line + linePadding + rightPadding)

    RETURN result
```

### 10.4 Cursor Marker

Hardware cursor positioning uses APC sequence:
```
CURSOR_MARKER = "\x1b_cursor\x1b\\"  // APC "cursor" ST
```

Emitted only when:
- Editor is focused
- NOT showing autocomplete (autocomplete has its own cursor)

---

## 11. Keybindings

### 11.1 Default Keybindings

| Action | Default Binding(s) |
|--------|-------------------|
| **Cursor Movement** ||
| cursorUp | Up |
| cursorDown | Down |
| cursorLeft | Left |
| cursorRight | Right |
| cursorWordLeft | Alt+Left, Ctrl+Left |
| cursorWordRight | Alt+Right, Ctrl+Right |
| cursorLineStart | Home, Ctrl+A |
| cursorLineEnd | End, Ctrl+E |
| pageUp | PageUp |
| pageDown | PageDown |
| **Deletion** ||
| deleteCharBackward | Backspace |
| deleteCharForward | Delete |
| deleteWordBackward | Ctrl+W, Alt+Backspace |
| deleteWordForward | Alt+D, Alt+Delete |
| deleteToLineStart | Ctrl+U |
| deleteToLineEnd | Ctrl+K |
| **Text Input** ||
| newLine | Shift+Enter |
| submit | Enter |
| tab | Tab |
| **Selection/Autocomplete** ||
| selectUp | Up |
| selectDown | Down |
| selectConfirm | Enter |
| selectCancel | Escape, Ctrl+C |
| **Kill Ring** ||
| yank | Ctrl+Y |
| yankPop | Alt+Y |
| **Undo** ||
| undo | Ctrl+- |
| **Other** ||
| copy | Ctrl+C |

### 11.2 Shift+Enter Alternative

Backslash followed by Enter serves as Shift+Enter:
```
pendingShiftEnter: boolean = false

IF input == "\\":
    pendingShiftEnter = true
    RETURN

IF pendingShiftEnter:
    IF input == "\r":
        pendingShiftEnter = false
        addNewLine()
        RETURN
    pendingShiftEnter = false
    insertCharacter("\\")
```

### 11.3 Kitty CSI-u Sequences

Modern terminals send printable keys as CSI-u:
```
\x1b[<codepoint>[:<shifted>[:<base>]][;<mod>]u

Example: Shift+A -> \x1b[97:65;2u
- codepoint = 97 (a)
- shifted = 65 (A)
- mod = 2 (shift)

FUNCTION decodeKittyPrintable(data: string) -> string | undefined
    match = data.match(/^\x1b\[(\d+)(?::(\d*))?(?::(\d+))?(?:;(\d+))?(?::(\d+))?u$/)
    IF NOT match:
        RETURN undefined

    codepoint = parseInt(match[1])
    shiftedKey = match[2] ? parseInt(match[2]) : undefined
    modValue = match[4] ? parseInt(match[4]) : 1
    modifier = modValue - 1  // Normalize to bitmask

    // Ignore Alt/Ctrl shortcuts
    IF modifier & (ALT | CTRL):
        RETURN undefined

    // Prefer shifted keycode when Shift held
    effectiveCodepoint = codepoint
    IF (modifier & SHIFT) AND shiftedKey defined:
        effectiveCodepoint = shiftedKey

    // Drop control chars
    IF effectiveCodepoint < 32:
        RETURN undefined

    RETURN String.fromCodePoint(effectiveCodepoint)
```

---

## 12. Unicode Handling

### 12.1 Grapheme Segmentation

All character operations use `Intl.Segmenter`:
```
segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

// Correct handling of:
// - Emoji sequences (👨‍👩‍👧‍👦 = 1 grapheme, 11 code units)
// - Combining characters (e + ́ = 1 grapheme, 2 code points)
// - Regional indicators (🇺🇸 = 1 grapheme, 4 code units)
```

### 12.2 Visible Width Calculation

```
FUNCTION visibleWidth(str: string) -> number
    IF str is empty:
        RETURN 0

    // Fast path: pure ASCII
    isPureAscii = true
    FOR i = 0 TO str.length - 1:
        code = str.charCodeAt(i)
        IF code < 0x20 OR code > 0x7e:
            isPureAscii = false
            BREAK
    IF isPureAscii:
        RETURN str.length

    // Check cache
    IF widthCache.has(str):
        RETURN widthCache.get(str)

    // Clean string
    clean = str
        .replace(/\t/g, "   ")                    // Tabs to 3 spaces
        .replace(/\x1b\[[0-9;]*[mGKHJ]/g, "")    // Strip SGR codes
        .replace(/\x1b\]8;;[^\x07]*\x07/g, "")   // Strip OSC 8 hyperlinks
        .replace(/\x1b_[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")  // Strip APC

    width = 0
    FOR segment IN segmenter.segment(clean):
        width += graphemeWidth(segment)

    widthCache.set(str, width)
    RETURN width


FUNCTION graphemeWidth(segment: string) -> number
    // Zero-width clusters
    IF isZeroWidth(segment):
        RETURN 0

    // Emoji check
    IF couldBeEmoji(segment) AND isRGIEmoji(segment):
        RETURN 2

    // Get base character
    base = segment.replace(leadingNonPrintingChars, "")
    cp = base.codePointAt(0)
    IF cp undefined:
        RETURN 0

    width = eastAsianWidth(cp)  // 1 or 2

    // Handle trailing fullwidth forms
    IF segment.length > 1:
        FOR char IN segment.slice(1):
            c = char.codePointAt(0)
            IF c >= 0xFF00 AND c <= 0xFFEF:
                width += eastAsianWidth(c)

    RETURN width
```

### 12.3 Character Classification

```
FUNCTION isWhitespaceChar(char: string) -> boolean
    RETURN /\s/.test(char)

FUNCTION isPunctuationChar(char: string) -> boolean
    RETURN /[(){}[\]<>.,;:'"!?+\-=*/\\|&%^$#@~`]/.test(char)
```

---

## 13. Special Input Sequences

### 13.1 Shift+Space

```
IF matchesKey(data, "shift+space"):
    insertCharacter(" ")
    RETURN
```

### 13.2 Shift+Backspace / Shift+Delete

```
IF matchesKey(data, "shift+backspace"):
    handleBackspace()
    RETURN

IF matchesKey(data, "shift+delete"):
    handleForwardDelete()
    RETURN
```

### 13.3 Various Newline Sequences

Multiple sequences can trigger newline:
```
kb.matches(data, "newLine")       // Configured binding
data.charCodeAt(0) == 10          // LF with extra data
data == "\x1b\r"                  // Alt+Enter (some terminals)
data == "\x1b[13;2~"              // Shift+Enter (xterm)
data includes "\x1b" AND "\r"     // Various escape combos
data == "\n"                      // Raw newline
data == "\\\r"                    // Backslash+Enter
```

---

## 14. Submit Flow

```
FUNCTION handleSubmit()
    IF disableSubmit:
        RETURN

    // Expand paste markers
    result = lines.join("\n").trim()
    FOR (pasteId, content) IN pastes:
        result = result.replace(/\[paste #${pasteId}...\]/g, content)

    // Reset state
    state = { lines: [""], cursorLine: 0, cursorCol: 0 }
    pastes.clear()
    pasteCounter = 0
    historyIndex = -1
    scrollOffset = 0
    undoStack.length = 0
    lastAction = null

    triggerOnChange("")
    triggerOnSubmit(result)
```

---

## 15. Public API

### 15.1 Constructor

```
constructor(tui: TUI, theme: EditorTheme, options?: EditorOptions)

EditorTheme {
    borderColor: (str) => string    // ANSI styling for borders
    selectList: SelectListTheme     // Theme for autocomplete
}

EditorOptions {
    paddingX?: number               // Horizontal padding (default: 0)
}
```

### 15.2 Methods

| Method | Description |
|--------|-------------|
| `render(width: number): string[]` | Render editor to lines |
| `handleInput(data: string): void` | Process keyboard input |
| `getText(): string` | Get current text (with paste markers) |
| `getExpandedText(): string` | Get text with markers expanded |
| `getLines(): string[]` | Get copy of lines array |
| `getCursor(): {line, col}` | Get cursor position |
| `setText(text: string): void` | Set editor content |
| `insertTextAtCursor(text: string): void` | Insert at cursor (atomic undo) |
| `addToHistory(text: string): void` | Add to command history |
| `setAutocompleteProvider(p): void` | Set autocomplete provider |
| `isShowingAutocomplete(): boolean` | Check autocomplete state |
| `getPaddingX(): number` | Get horizontal padding |
| `setPaddingX(n: number): void` | Set horizontal padding |
| `invalidate(): void` | No-op (no cached state) |

### 15.3 Properties

| Property | Type | Description |
|----------|------|-------------|
| `focused` | boolean | Set by TUI on focus change |
| `borderColor` | (str) => string | Dynamic border styling |
| `onSubmit` | (text) => void | Submit callback |
| `onChange` | (text) => void | Change callback |
| `disableSubmit` | boolean | Prevent Enter from submitting |

---

## 16. Autocomplete Provider Interface

```
AutocompleteProvider {
    getSuggestions(
        lines: string[],
        cursorLine: number,
        cursorCol: number
    ): { items: AutocompleteItem[], prefix: string } | null

    applyCompletion(
        lines: string[],
        cursorLine: number,
        cursorCol: number,
        item: AutocompleteItem,
        prefix: string
    ): { lines: string[], cursorLine: number, cursorCol: number }
}

AutocompleteItem {
    value: string           // Completion value
    label: string           // Display label
    description?: string    // Optional description
}

CombinedAutocompleteProvider extends AutocompleteProvider {
    // Additional methods for tab completion
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol): boolean
    getForceFileSuggestions(lines, cursorLine, cursorCol): {...} | null
}
```

---

## 17. Integration Points

### 17.1 TUI Integration

```
// Focus management
editor.focused = true/false  // Set by TUI

// Cursor marker for IME positioning
CURSOR_MARKER in render output  // Zero-width, positions hardware cursor
```

### 17.2 SelectList Integration

```
// Create dropdown for autocomplete
autocompleteList = new SelectList(items, maxVisible, theme)

// Handle input delegation
autocompleteList.handleInput(data)

// Get selection
item = autocompleteList.getSelectedItem()

// Render below editor
lines = autocompleteList.render(width)
```

### 17.3 External Editor

```
// Get expanded text for external editing
text = editor.getExpandedText()

// Set text after external edit
editor.setText(modifiedText)
```

---

## Appendix A: State Transition Diagram

```
                    ┌──────────────┐
                    │   EDITING    │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    ┌─────────┐     ┌─────────────┐    ┌──────────┐
    │ HISTORY │     │ AUTOCOMPLETE│    │ PASTE    │
    │ BROWSE  │     │             │    │ MODE     │
    └────┬────┘     └──────┬──────┘    └────┬─────┘
         │                 │                 │
         │  Up/Down        │  Esc/Tab/Enter  │  \x1b[201~
         │  (at boundary)  │  char input     │  (paste end)
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   EDITING    │
                    └──────────────┘
```

---

## Appendix B: Kill Ring Example

```
Initial state:
  killRing = []
  lastAction = null

User types "hello world" then Ctrl+K:
  killRing = ["world"]  (deleted " world" but shows as "world" after trim)
  lastAction = "kill"

User presses Ctrl+K again (line end):
  killRing = ["world\n"]  (accumulated newline)
  lastAction = "kill"

User types "x" then Ctrl+W:
  killRing = ["world\n", "x"]  (new entry - broke accumulation)
  lastAction = "kill"

User presses Ctrl+W again:
  killRing = ["world\n", " x"]  (accumulated with prepend)
  lastAction = "kill"

User presses Ctrl+Y:
  Inserts " x"
  lastAction = "yank"

User presses Alt+Y:
  Deletes " x", inserts "world\n"
  killRing = [" x", "world\n"]  (rotated)
  lastAction = "yank"

User presses Alt+Y:
  Deletes "world\n", inserts " x"
  killRing = ["world\n", " x"]  (rotated back)
  lastAction = "yank"
```

---

## Appendix C: Word Wrap Example

```
Input: "The quick brown fox jumps over the lazy dog"
Width: 15

Tokenization:
  ["The", " ", "quick", " ", "brown", " ", "fox", " ", "jumps",
   " ", "over", " ", "the", " ", "lazy", " ", "dog"]

Chunk building:
  Chunk 1: "The quick"        (startIndex=0, endIndex=10)
  Chunk 2: "brown fox"        (startIndex=10, endIndex=20)
  Chunk 3: "jumps over"       (startIndex=20, endIndex=31)
  Chunk 4: "the lazy dog"     (startIndex=31, endIndex=44)

Note: Leading whitespace trimmed from wrapped lines
```

---

## Appendix D: Cursor Position in Wrapped Lines

```
Logical line: "The quick brown fox"
Width: 10

Visual lines:
  [0] "The quick"   startIndex=0, endIndex=10
  [1] "brown fox"   startIndex=10, endIndex=19

Cursor at logical col 5 ("q"):
  Visual line 0, cursorPos = 5 - 0 = 5

Cursor at logical col 12 ("o" in "brown"):
  Visual line 1, cursorPos = 12 - 10 = 2

Cursor at logical col 10 (space before "brown"):
  Visual line 0, cursorPos = 10 - 0 = 10 (at end)
  OR visual line 1 depending on interpretation
```
