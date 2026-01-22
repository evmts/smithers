# Session Management - Engineering Specification

## Overview

Session management provides persistent conversation history with tree-structured branching, context compaction, and crash recovery. Sessions are stored as append-only NDJSON files that maintain the complete conversation tree.

## Session File Format

### File Location

```
~/.pi/agent/sessions/
  └── --<encoded-cwd>--/
      └── <timestamp>_<session-id>.jsonl
```

**Path encoding algorithm:**
```pseudocode
function encodeSessionDir(cwd: string) -> string:
    safePath = "--" + cwd.stripLeadingSlash().replaceAll(/[\/\\:]/g, "-") + "--"
    return join(agentDir, "sessions", safePath)
```

### NDJSON Structure

Each line is a JSON object. First line MUST be the session header.

```
{"type":"session","version":3,"id":"uuid","timestamp":"ISO8601","cwd":"/path","parentSession":"..."}
{"type":"message","id":"abc12345","parentId":null,"timestamp":"ISO8601","message":{...}}
{"type":"message","id":"def67890","parentId":"abc12345","timestamp":"ISO8601","message":{...}}
{"type":"compaction","id":"ghi11111","parentId":"def67890","timestamp":"ISO8601","summary":"...","firstKeptEntryId":"abc12345","tokensBefore":50000}
...
```

## Entry Type Schemas

### Session Header

```typescript
interface SessionHeader {
    type: "session"
    version: number           // Current: 3
    id: string                // UUID
    timestamp: string         // ISO8601
    cwd: string               // Working directory
    parentSession?: string    // Path to parent session (for forks)
}
```

### Base Entry Structure

All entries share this base:

```typescript
interface SessionEntryBase {
    type: string
    id: string              // 8-char hex, collision-checked
    parentId: string | null // null = root
    timestamp: string       // ISO8601
}
```

### Message Entry

```typescript
interface SessionMessageEntry extends SessionEntryBase {
    type: "message"
    message: AgentMessage   // user | assistant | toolResult | bashExecution | custom
}

// AgentMessage variants:
interface UserMessage {
    role: "user"
    content: string | ContentBlock[]
    timestamp: number
}

interface AssistantMessage {
    role: "assistant"
    content: ContentBlock[]     // text | thinking | toolCall
    usage: Usage
    stopReason: "end_turn" | "tool_use" | "aborted" | "error"
    errorMessage?: string
    provider: string
    model: string
    timestamp: number
}

interface ToolResultMessage {
    role: "toolResult"
    toolCallId: string
    toolName: string
    content: ContentBlock[]
    isError: boolean
    details?: unknown
    timestamp: number
}

interface BashExecutionMessage {
    role: "bashExecution"
    command: string
    output: string
    exitCode: number | undefined
    cancelled: boolean
    truncated: boolean
    fullOutputPath?: string
    timestamp: number
    excludeFromContext?: boolean  // !! prefix - not sent to LLM
}

interface CustomMessage<T = unknown> {
    role: "custom"
    customType: string
    content: string | ContentBlock[]
    display: boolean
    details?: T
    timestamp: number
}
```

### Model/Thinking Change Entries

```typescript
interface ThinkingLevelChangeEntry extends SessionEntryBase {
    type: "thinking_level_change"
    thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
}

interface ModelChangeEntry extends SessionEntryBase {
    type: "model_change"
    provider: string
    modelId: string
}
```

### Compaction Entry

```typescript
interface CompactionEntry<T = unknown> extends SessionEntryBase {
    type: "compaction"
    summary: string              // LLM-generated context summary
    firstKeptEntryId: string     // ID of first entry kept after compaction
    tokensBefore: number         // Context tokens before compaction
    details?: T                  // Extension data (file lists, etc.)
    fromHook?: boolean           // true if extension-generated
}

interface CompactionDetails {
    readFiles: string[]          // Files only read
    modifiedFiles: string[]      // Files written/edited
}
```

### Branch Summary Entry

```typescript
interface BranchSummaryEntry<T = unknown> extends SessionEntryBase {
    type: "branch_summary"
    fromId: string               // Entry ID where branch diverged
    summary: string              // LLM-generated branch summary
    details?: T                  // Extension data
    fromHook?: boolean           // true if extension-generated
}

interface BranchSummaryDetails {
    readFiles: string[]
    modifiedFiles: string[]
}
```

### Custom Entry (Extension State)

```typescript
interface CustomEntry<T = unknown> extends SessionEntryBase {
    type: "custom"
    customType: string           // Extension identifier
    data?: T                     // Extension-specific state
}
// NOT included in LLM context
```

### Custom Message Entry (Extension Context)

```typescript
interface CustomMessageEntry<T = unknown> extends SessionEntryBase {
    type: "custom_message"
    customType: string
    content: string | ContentBlock[]
    details?: T                  // NOT sent to LLM
    display: boolean             // TUI rendering flag
}
// IS included in LLM context
```

### Label Entry

```typescript
interface LabelEntry extends SessionEntryBase {
    type: "label"
    targetId: string             // Entry being labeled
    label: string | undefined    // undefined = clear label
}
```

### Session Info Entry

```typescript
interface SessionInfoEntry extends SessionEntryBase {
    type: "session_info"
    name?: string                // User-defined display name
}
```

## Session Tree Structure

### Tree Model

Sessions form a directed acyclic graph (tree) via `parentId` references:

```
                    [header]
                       │
                    [user: msg1]  ← parentId: null (root)
                       │
                    [asst: resp1] ← parentId: msg1
                       │
              ┌───────┴───────┐
              │               │
           [user: msg2]    [user: msg3]  ← both parentId: resp1
              │               │
           [asst: resp2]   [asst: resp3]
              │
           [compaction]
              │
           [user: msg4]
```

### Leaf Pointer

The `leafId` tracks the current position in the tree:
- New entries are children of the current leaf
- Navigation moves the leaf pointer
- Building context walks from leaf to root

### ID Generation

```pseudocode
function generateId(existingIds: Set<string>) -> string:
    for i in 0..100:
        id = randomUUID().slice(0, 8)
        if not existingIds.has(id):
            return id
    return randomUUID()  // Full UUID fallback
```

## Branch Navigation Algorithm

### Building Context Path

```pseudocode
function buildSessionContext(entries, leafId, byId) -> SessionContext:
    if leafId == null:
        return { messages: [], thinkingLevel: "off", model: null }

    leaf = byId.get(leafId)
    if not leaf:
        leaf = entries[entries.length - 1]

    // Walk from leaf to root
    path = []
    current = leaf
    while current:
        path.unshift(current)
        current = current.parentId ? byId.get(current.parentId) : null

    // Extract settings and find compaction
    thinkingLevel = "off"
    model = null
    compaction = null

    for entry in path:
        if entry.type == "thinking_level_change":
            thinkingLevel = entry.thinkingLevel
        else if entry.type == "model_change":
            model = { provider, modelId }
        else if entry.type == "message" and entry.message.role == "assistant":
            model = { provider, modelId }
        else if entry.type == "compaction":
            compaction = entry

    // Build messages handling compaction
    messages = []

    if compaction:
        // 1. Emit summary first
        messages.push(createCompactionSummaryMessage(compaction))

        compactionIdx = path.findIndex(e => e.id == compaction.id)

        // 2. Emit kept messages (before compaction, from firstKeptEntryId)
        foundFirstKept = false
        for i in 0..compactionIdx:
            if path[i].id == compaction.firstKeptEntryId:
                foundFirstKept = true
            if foundFirstKept:
                appendMessage(path[i])

        // 3. Emit messages after compaction
        for i in (compactionIdx + 1)..path.length:
            appendMessage(path[i])
    else:
        for entry in path:
            appendMessage(entry)

    return { messages, thinkingLevel, model }
```

### Common Ancestor Finding

```pseudocode
function findCommonAncestor(session, oldLeafId, targetId) -> string | null:
    if not oldLeafId:
        return null

    // Build path set from old leaf
    oldPath = Set(session.getBranch(oldLeafId).map(e => e.id))

    // Walk target path from root, find deepest common
    targetPath = session.getBranch(targetId)

    commonAncestorId = null
    for i in (targetPath.length - 1)..0 step -1:
        if oldPath.has(targetPath[i].id):
            commonAncestorId = targetPath[i].id
            break

    return commonAncestorId
```

### Branch Navigation

```pseudocode
function navigateTree(session, targetId, options) -> Result:
    oldLeafId = session.getLeafId()

    if targetId == oldLeafId:
        return { cancelled: false }

    targetEntry = session.getEntry(targetId)

    // Collect entries to summarize (from old leaf to common ancestor)
    { entries, commonAncestorId } = collectEntriesForBranchSummary(
        session, oldLeafId, targetId
    )

    // Generate branch summary if requested
    summaryText = null
    if options.summarize and entries.length > 0:
        summaryText = await generateBranchSummary(entries, options)

    // Determine new leaf based on target type
    if targetEntry.type == "message" and targetEntry.message.role == "user":
        // User message: leaf = parent, text goes to editor
        newLeafId = targetEntry.parentId
        editorText = extractText(targetEntry.message.content)
    else:
        // Non-user message: leaf = selected node
        newLeafId = targetId

    // Update session tree
    if summaryText:
        session.branchWithSummary(newLeafId, summaryText, details, fromHook)
    else if newLeafId == null:
        session.resetLeaf()
    else:
        session.branch(newLeafId)

    // Rebuild agent state
    context = session.buildSessionContext()
    agent.replaceMessages(context.messages)

    return { editorText, cancelled: false }
```

## Branch Summarization

### Summary Collection

```pseudocode
function collectEntriesForBranchSummary(session, oldLeafId, targetId):
    if not oldLeafId:
        return { entries: [], commonAncestorId: null }

    // Find common ancestor
    oldPath = Set(session.getBranch(oldLeafId).map(e => e.id))
    targetPath = session.getBranch(targetId)

    commonAncestorId = null
    for i in (targetPath.length - 1)..0 step -1:
        if oldPath.has(targetPath[i].id):
            commonAncestorId = targetPath[i].id
            break

    // Collect entries from old leaf to common ancestor
    entries = []
    current = oldLeafId
    while current and current != commonAncestorId:
        entry = session.getEntry(current)
        if not entry: break
        entries.push(entry)
        current = entry.parentId

    entries.reverse()  // Chronological order
    return { entries, commonAncestorId }
```

### Summary Generation

```pseudocode
function generateBranchSummary(entries, options) -> BranchSummaryResult:
    contextWindow = model.contextWindow or 128000
    tokenBudget = contextWindow - options.reserveTokens

    { messages, fileOps, totalTokens } = prepareBranchEntries(entries, tokenBudget)

    if messages.length == 0:
        return { summary: "No content to summarize" }

    // Serialize conversation (prevents LLM from continuing it)
    llmMessages = convertToLlm(messages)
    conversationText = serializeConversation(llmMessages)

    prompt = buildBranchSummaryPrompt(conversationText, options.customInstructions)

    response = await llm.complete(prompt, { maxTokens: 2048 })

    summary = BRANCH_SUMMARY_PREAMBLE + response.text

    // Append file operations
    { readFiles, modifiedFiles } = computeFileLists(fileOps)
    summary += formatFileOperations(readFiles, modifiedFiles)

    return { summary, readFiles, modifiedFiles }
```

## Context Compaction Algorithm

### Trigger Conditions

```pseudocode
function shouldCompact(contextTokens, contextWindow, settings) -> bool:
    if not settings.enabled:
        return false
    return contextTokens > contextWindow - settings.reserveTokens

DEFAULT_SETTINGS = {
    enabled: true,
    reserveTokens: 16384,    // Buffer for response
    keepRecentTokens: 20000  // Recent context to preserve
}
```

### Auto-Compaction Triggers

1. **Threshold**: After successful turn, context exceeds `contextWindow - reserveTokens`
2. **Overflow**: LLM returns context overflow error

### Cut Point Detection

```pseudocode
function findCutPoint(entries, startIndex, endIndex, keepRecentTokens) -> CutPointResult:
    cutPoints = findValidCutPoints(entries, startIndex, endIndex)

    if cutPoints.length == 0:
        return { firstKeptEntryIndex: startIndex, turnStartIndex: -1, isSplitTurn: false }

    // Walk backwards accumulating tokens
    accumulatedTokens = 0
    cutIndex = cutPoints[0]

    for i in (endIndex - 1)..startIndex step -1:
        entry = entries[i]
        if entry.type != "message": continue

        messageTokens = estimateTokens(entry.message)
        accumulatedTokens += messageTokens

        if accumulatedTokens >= keepRecentTokens:
            // Find closest valid cut point
            for c in 0..cutPoints.length:
                if cutPoints[c] >= i:
                    cutIndex = cutPoints[c]
                    break
            break

    // Include non-message entries before cut
    while cutIndex > startIndex:
        prevEntry = entries[cutIndex - 1]
        if prevEntry.type == "compaction" or prevEntry.type == "message":
            break
        cutIndex--

    // Determine if splitting a turn
    cutEntry = entries[cutIndex]
    isUserMessage = cutEntry.type == "message" and cutEntry.message.role == "user"
    turnStartIndex = isUserMessage ? -1 : findTurnStartIndex(entries, cutIndex, startIndex)

    return {
        firstKeptEntryIndex: cutIndex,
        turnStartIndex,
        isSplitTurn: not isUserMessage and turnStartIndex != -1
    }

function findValidCutPoints(entries, start, end) -> number[]:
    cutPoints = []
    for i in start..end:
        entry = entries[i]
        if entry.type == "message":
            role = entry.message.role
            // Valid: user, assistant, bashExecution, custom, branchSummary, compactionSummary
            // Invalid: toolResult (must follow tool call)
            if role != "toolResult":
                cutPoints.push(i)
        else if entry.type in ["branch_summary", "custom_message"]:
            cutPoints.push(i)
    return cutPoints
```

### Token Estimation

```pseudocode
function estimateTokens(message) -> number:
    chars = 0

    switch message.role:
        case "user":
            if typeof message.content == "string":
                chars = message.content.length
            else:
                for block in message.content:
                    if block.type == "text":
                        chars += block.text.length

        case "assistant":
            for block in message.content:
                if block.type == "text":
                    chars += block.text.length
                else if block.type == "thinking":
                    chars += block.thinking.length
                else if block.type == "toolCall":
                    chars += block.name.length + JSON.stringify(block.arguments).length

        case "toolResult", "custom":
            if typeof message.content == "string":
                chars = message.content.length
            else:
                for block in message.content:
                    if block.type == "text":
                        chars += block.text.length
                    if block.type == "image":
                        chars += 4800  // ~1200 tokens estimate

        case "bashExecution":
            chars = message.command.length + message.output.length

        case "branchSummary", "compactionSummary":
            chars = message.summary.length

    return ceil(chars / 4)  // Conservative estimate
```

### Compaction Execution

```pseudocode
function compact(preparation, model, apiKey, customInstructions, signal) -> CompactionResult:
    {
        firstKeptEntryId,
        messagesToSummarize,
        turnPrefixMessages,
        isSplitTurn,
        tokensBefore,
        previousSummary,
        fileOps,
        settings
    } = preparation

    if isSplitTurn and turnPrefixMessages.length > 0:
        // Generate both summaries in parallel
        [historyResult, turnPrefixResult] = await Promise.all([
            messagesToSummarize.length > 0
                ? generateSummary(messagesToSummarize, model, settings.reserveTokens, apiKey, signal, customInstructions, previousSummary)
                : "No prior history.",
            generateTurnPrefixSummary(turnPrefixMessages, model, settings.reserveTokens, apiKey, signal)
        ])
        summary = historyResult + "\n\n---\n\n**Turn Context (split turn):**\n\n" + turnPrefixResult
    else:
        summary = await generateSummary(messagesToSummarize, model, settings.reserveTokens, apiKey, signal, customInstructions, previousSummary)

    // Append file operations
    { readFiles, modifiedFiles } = computeFileLists(fileOps)
    summary += formatFileOperations(readFiles, modifiedFiles)

    return {
        summary,
        firstKeptEntryId,
        tokensBefore,
        details: { readFiles, modifiedFiles }
    }
```

### Iterative Summarization

When a previous compaction exists, the UPDATE prompt merges new information:

```
Previous summary + New messages → Updated summary
```

This preserves context across multiple compactions without losing early information.

## Session Metadata

### Session Name

User-defined display name stored via `session_info` entry:

```pseudocode
function getSessionName(session) -> string | undefined:
    entries = session.getEntries()
    for i in (entries.length - 1)..0 step -1:
        if entries[i].type == "session_info" and entries[i].name:
            return entries[i].name
    return undefined
```

### Labels

User-defined bookmarks on any entry:

```pseudocode
function getLabel(session, entryId) -> string | undefined:
    return session.labelsById.get(entryId)

function setLabel(session, targetId, label):
    entry = {
        type: "label",
        id: generateId(session.byId),
        parentId: session.leafId,
        timestamp: now(),
        targetId,
        label  // undefined clears label
    }
    session.appendEntry(entry)
    if label:
        session.labelsById.set(targetId, label)
    else:
        session.labelsById.delete(targetId)
```

## Session Operations

### Session Creation

```pseudocode
function SessionManager.create(cwd, sessionDir?) -> SessionManager:
    dir = sessionDir ?? getDefaultSessionDir(cwd)
    return new SessionManager(cwd, dir, undefined, persist=true)

function SessionManager.newSession(options?):
    sessionId = randomUUID()
    timestamp = now()

    header = {
        type: "session",
        version: CURRENT_VERSION,
        id: sessionId,
        timestamp,
        cwd: this.cwd,
        parentSession: options?.parentSession
    }

    this.fileEntries = [header]
    this.byId.clear()
    this.labelsById.clear()
    this.leafId = null
    this.flushed = false

    if this.persist:
        fileTimestamp = timestamp.replaceAll(/[:.]/g, "-")
        this.sessionFile = join(this.sessionDir, fileTimestamp + "_" + sessionId + ".jsonl")
```

### Session Resumption

```pseudocode
function SessionManager.continueRecent(cwd, sessionDir?) -> SessionManager:
    dir = sessionDir ?? getDefaultSessionDir(cwd)
    mostRecent = findMostRecentSession(dir)

    if mostRecent:
        return new SessionManager(cwd, dir, mostRecent, persist=true)
    return SessionManager.create(cwd, sessionDir)

function findMostRecentSession(sessionDir) -> string | null:
    files = readdirSync(sessionDir)
        .filter(f => f.endsWith(".jsonl"))
        .map(f => join(sessionDir, f))
        .filter(isValidSessionFile)
        .map(path => { path, mtime: statSync(path).mtime })
        .sort((a, b) => b.mtime - a.mtime)

    return files[0]?.path || null
```

### Session Switching

```pseudocode
async function AgentSession.switchSession(sessionPath):
    previousFile = this.sessionManager.getSessionFile()

    // Extension hook - can cancel
    if this.extensionRunner?.hasHandlers("session_before_switch"):
        result = await this.extensionRunner.emit({
            type: "session_before_switch",
            reason: "resume",
            targetSessionFile: sessionPath
        })
        if result?.cancel: return false

    this.disconnectFromAgent()
    await this.abort()

    // Load new session
    this.sessionManager.setSessionFile(sessionPath)
    this.agent.sessionId = this.sessionManager.getSessionId()

    // Restore context
    context = this.sessionManager.buildSessionContext()

    // Extension notification
    await this.extensionRunner?.emit({
        type: "session_switch",
        reason: "resume",
        previousSessionFile: previousFile
    })

    this.agent.replaceMessages(context.messages)

    // Restore model if available
    if context.model:
        availableModels = await this.modelRegistry.getAvailable()
        match = availableModels.find(m =>
            m.provider == context.model.provider and
            m.id == context.model.modelId
        )
        if match:
            this.agent.setModel(match)

    // Restore thinking level
    if context.thinkingLevel:
        this.setThinkingLevel(context.thinkingLevel)

    this.reconnectToAgent()
    return true
```

### Session Forking

Creates new session file with path from root to specified entry:

```pseudocode
function SessionManager.createBranchedSession(leafId) -> string | undefined:
    path = this.getBranch(leafId)
    if path.length == 0:
        throw Error("Entry not found")

    // Filter out labels - will recreate from resolved map
    pathWithoutLabels = path.filter(e => e.type != "label")

    newSessionId = randomUUID()
    timestamp = now()
    fileTimestamp = timestamp.replaceAll(/[:.]/g, "-")
    newSessionFile = join(this.sessionDir, fileTimestamp + "_" + newSessionId + ".jsonl")

    header = {
        type: "session",
        version: CURRENT_VERSION,
        id: newSessionId,
        timestamp,
        cwd: this.cwd,
        parentSession: this.persist ? this.sessionFile : undefined
    }

    if this.persist:
        appendFileSync(newSessionFile, JSON.stringify(header) + "\n")
        for entry in pathWithoutLabels:
            appendFileSync(newSessionFile, JSON.stringify(entry) + "\n")

        // Recreate labels for entries in path
        for [targetId, label] of this.labelsById:
            if pathEntryIds.has(targetId):
                labelEntry = createLabelEntry(targetId, label)
                appendFileSync(newSessionFile, JSON.stringify(labelEntry) + "\n")

        this.fileEntries = [header, ...pathWithoutLabels, ...labelEntries]
        this.sessionId = newSessionId
        this.buildIndex()
        return newSessionFile

    // In-memory mode
    this.fileEntries = [header, ...pathWithoutLabels, ...labelEntries]
    this.sessionId = newSessionId
    this.buildIndex()
    return undefined
```

### Cross-Project Forking

Fork a session from another project into current project:

```pseudocode
function SessionManager.forkFrom(sourcePath, targetCwd, sessionDir?) -> SessionManager:
    sourceEntries = loadEntriesFromFile(sourcePath)
    if sourceEntries.length == 0:
        throw Error("Source session empty or invalid")

    sourceHeader = sourceEntries.find(e => e.type == "session")
    if not sourceHeader:
        throw Error("Source session has no header")

    dir = sessionDir ?? getDefaultSessionDir(targetCwd)
    mkdirSync(dir, { recursive: true })

    newSessionId = randomUUID()
    timestamp = now()
    fileTimestamp = timestamp.replaceAll(/[:.]/g, "-")
    newSessionFile = join(dir, fileTimestamp + "_" + newSessionId + ".jsonl")

    // Write new header with updated cwd and parent reference
    newHeader = {
        type: "session",
        version: CURRENT_VERSION,
        id: newSessionId,
        timestamp,
        cwd: targetCwd,
        parentSession: sourcePath
    }
    appendFileSync(newSessionFile, JSON.stringify(newHeader) + "\n")

    // Copy all non-header entries
    for entry in sourceEntries:
        if entry.type != "session":
            appendFileSync(newSessionFile, JSON.stringify(entry) + "\n")

    return new SessionManager(targetCwd, dir, newSessionFile, persist=true)
```

## Crash Recovery

### Append-Only Durability

Sessions are crash-safe by design:
- Each entry is a complete JSON line
- Partial writes leave incomplete line at end
- Recovery: truncate to last complete line

### File Validation

```pseudocode
function isValidSessionFile(filePath) -> bool:
    try:
        fd = openSync(filePath, "r")
        buffer = Buffer.alloc(512)
        bytesRead = readSync(fd, buffer, 0, 512, 0)
        closeSync(fd)

        firstLine = buffer.toString("utf8", 0, bytesRead).split("\n")[0]
        if not firstLine: return false

        header = JSON.parse(firstLine)
        return header.type == "session" and typeof header.id == "string"
    catch:
        return false
```

### Malformed Line Handling

```pseudocode
function loadEntriesFromFile(filePath) -> FileEntry[]:
    if not existsSync(filePath): return []

    content = readFileSync(filePath, "utf8")
    entries = []
    lines = content.trim().split("\n")

    for line in lines:
        if not line.trim(): continue
        try:
            entries.push(JSON.parse(line))
        catch:
            // Skip malformed lines (partial writes from crash)
            continue

    // Validate header
    if entries.length == 0: return entries
    header = entries[0]
    if header.type != "session" or typeof header.id != "string":
        return []

    return entries
```

### Lazy Persistence

Sessions only persist after first assistant response:

```pseudocode
function _persist(entry):
    if not this.persist or not this.sessionFile: return

    // Don't persist until we have an assistant message
    hasAssistant = this.fileEntries.some(e =>
        e.type == "message" and e.message.role == "assistant"
    )
    if not hasAssistant: return

    if not this.flushed:
        // Flush all entries on first persist
        for e in this.fileEntries:
            appendFileSync(this.sessionFile, JSON.stringify(e) + "\n")
        this.flushed = true
    else:
        // Append single entry
        appendFileSync(this.sessionFile, JSON.stringify(entry) + "\n")
```

## Session Export

### HTML Export

```pseudocode
async function exportSessionToHtml(sm, state, options) -> string:
    sessionFile = sm.getSessionFile()
    if not sessionFile:
        throw Error("Cannot export in-memory session")

    entries = sm.getEntries()

    // Pre-render custom tools if renderer available
    renderedTools = undefined
    if options.toolRenderer:
        renderedTools = preRenderCustomTools(entries, options.toolRenderer)

    sessionData = {
        header: sm.getHeader(),
        entries,
        leafId: sm.getLeafId(),
        systemPrompt: state?.systemPrompt,
        tools: state?.tools?.map(t => { name, description }),
        renderedTools
    }

    html = generateHtml(sessionData, options.themeName)

    outputPath = options.outputPath ??
        appName + "-session-" + basename(sessionFile, ".jsonl") + ".html"

    writeFileSync(outputPath, html, "utf8")
    return outputPath

function generateHtml(sessionData, themeName) -> string:
    template = readFileSync(join(templateDir, "template.html"), "utf-8")
    css = readFileSync(join(templateDir, "template.css"), "utf-8")
    js = readFileSync(join(templateDir, "template.js"), "utf-8")

    themeVars = generateThemeVars(themeName)
    sessionDataBase64 = btoa(JSON.stringify(sessionData))

    return template
        .replace("{{CSS}}", css.replace("{{THEME_VARS}}", themeVars))
        .replace("{{JS}}", js)
        .replace("{{SESSION_DATA}}", sessionDataBase64)
```

### Session Sharing

Share via gist URL:

```pseudocode
function getShareViewerUrl(gistId) -> string:
    baseUrl = process.env.PI_SHARE_VIEWER_URL ?? "https://buildwithpi.ai/session/"
    return baseUrl + "#" + gistId
```

## Session Listing

### List Sessions for Directory

```pseudocode
async function SessionManager.list(cwd, sessionDir?, onProgress?) -> SessionInfo[]:
    dir = sessionDir ?? getDefaultSessionDir(cwd)
    sessions = await listSessionsFromDir(dir, onProgress)
    sessions.sort((a, b) => b.modified - a.modified)
    return sessions

async function listSessionsFromDir(dir, onProgress?, progressOffset?, progressTotal?) -> SessionInfo[]:
    sessions = []
    if not existsSync(dir): return sessions

    dirEntries = await readdir(dir)
    files = dirEntries.filter(f => f.endsWith(".jsonl")).map(f => join(dir, f))
    total = progressTotal ?? files.length

    loaded = 0
    results = await Promise.all(
        files.map(async file => {
            info = await buildSessionInfo(file)
            loaded++
            onProgress?.(progressOffset + loaded, total)
            return info
        })
    )

    return results.filter(info => info != null)
```

### List All Sessions

```pseudocode
async function SessionManager.listAll(onProgress?) -> SessionInfo[]:
    sessionsDir = getSessionsDir()
    if not existsSync(sessionsDir): return []

    entries = await readdir(sessionsDir, { withFileTypes: true })
    dirs = entries.filter(e => e.isDirectory()).map(e => join(sessionsDir, e.name))

    // Count total files for progress
    totalFiles = 0
    dirFiles = []
    for dir in dirs:
        files = (await readdir(dir)).filter(f => f.endsWith(".jsonl"))
        dirFiles.push(files.map(f => join(dir, f)))
        totalFiles += files.length

    // Process all files with progress
    loaded = 0
    sessions = []
    allFiles = dirFiles.flat()

    results = await Promise.all(
        allFiles.map(async file => {
            info = await buildSessionInfo(file)
            loaded++
            onProgress?.(loaded, totalFiles)
            return info
        })
    )

    sessions = results.filter(info => info != null)
    sessions.sort((a, b) => b.modified - a.modified)
    return sessions
```

### Session Info Structure

```typescript
interface SessionInfo {
    path: string
    id: string
    cwd: string
    name?: string            // From session_info entries
    created: Date
    modified: Date
    messageCount: number
    firstMessage: string     // First user message text
    allMessagesText: string  // For search
}
```

## Version Migration

### Migration Pipeline

```pseudocode
function migrateToCurrentVersion(entries) -> bool:
    header = entries.find(e => e.type == "session")
    version = header?.version ?? 1

    if version >= CURRENT_VERSION: return false

    if version < 2: migrateV1ToV2(entries)
    if version < 3: migrateV2ToV3(entries)

    return true
```

### V1 to V2: Add Tree Structure

```pseudocode
function migrateV1ToV2(entries):
    ids = new Set()
    prevId = null

    for entry in entries:
        if entry.type == "session":
            entry.version = 2
            continue

        entry.id = generateId(ids)
        entry.parentId = prevId
        prevId = entry.id

        // Convert firstKeptEntryIndex to firstKeptEntryId
        if entry.type == "compaction":
            if typeof entry.firstKeptEntryIndex == "number":
                targetEntry = entries[entry.firstKeptEntryIndex]
                if targetEntry and targetEntry.type != "session":
                    entry.firstKeptEntryId = targetEntry.id
                delete entry.firstKeptEntryIndex
```

### V2 to V3: Rename Message Role

```pseudocode
function migrateV2ToV3(entries):
    for entry in entries:
        if entry.type == "session":
            entry.version = 3
            continue

        if entry.type == "message":
            if entry.message?.role == "hookMessage":
                entry.message.role = "custom"
```

## Extension Integration

### Session Events

Extensions can hook into session lifecycle:

```typescript
// Before switch - can cancel
interface SessionBeforeSwitchEvent {
    type: "session_before_switch"
    reason: "new" | "resume"
    targetSessionFile?: string
}

// After switch
interface SessionSwitchEvent {
    type: "session_switch"
    reason: "new" | "resume"
    previousSessionFile?: string
}

// Before compaction - can provide custom compaction
interface SessionBeforeCompactEvent {
    type: "session_before_compact"
    preparation: CompactionPreparation
    branchEntries: SessionEntry[]
    customInstructions?: string
    signal: AbortSignal
}

// After compaction
interface SessionCompactEvent {
    type: "session_compact"
    compactionEntry: CompactionEntry
    fromExtension: boolean
}

// Before tree navigation - can provide custom summary
interface SessionBeforeTreeEvent {
    type: "session_before_tree"
    preparation: TreePreparation
    signal: AbortSignal
}

// After tree navigation
interface SessionTreeEvent {
    type: "session_tree"
    newLeafId: string | null
    oldLeafId: string | null
    summaryEntry?: BranchSummaryEntry
    fromExtension?: boolean
}
```

## Implementation Notes

### Performance Considerations

1. **File I/O**: Append-only writes minimize disk seeking
2. **Tree Building**: On-demand path walking, O(depth) per query
3. **Index Maintenance**: HashMap by ID for O(1) lookups
4. **Token Estimation**: chars/4 heuristic avoids tokenizer calls

### Memory Management

1. **Lazy Loading**: Sessions load on first access
2. **Incremental Persistence**: Only flush after first assistant response
3. **Path Reuse**: Build index once, reuse for all queries

### Concurrency

1. **Single Writer**: One session manager per process
2. **Append Safety**: Each write is atomic at line level
3. **Abort Controllers**: Compaction/summarization are cancellable
