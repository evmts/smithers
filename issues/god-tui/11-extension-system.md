# Extension System - Engineering Specification

## Overview

The extension system provides a plugin architecture for extending agent functionality. Extensions are TypeScript/JavaScript modules that:

- Subscribe to agent lifecycle events
- Register LLM-callable tools
- Register commands, keyboard shortcuts, and CLI flags
- Interact with users via UI primitives
- Persist state across sessions
- Communicate with other extensions via event bus

```
+------------------+     +------------------+     +------------------+
|   Extension A    |     |   Extension B    |     |   Extension C    |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         v                        v                        v
+------------------------------------------------------------------------+
|                         ExtensionAPI                                    |
|  - on(event, handler)           - registerTool(definition)             |
|  - registerCommand(name, opts)  - registerShortcut(key, opts)          |
|  - registerFlag(name, opts)     - sendMessage(msg, opts)               |
|  - appendEntry(type, data)      - events (EventBus)                    |
+------------------------------------------------------------------------+
         |                        |                        |
         v                        v                        v
+------------------+     +------------------+     +------------------+
|     Loader       |     |     Runner       |     |   UIContext      |
+------------------+     +------------------+     +------------------+
```

---

## Extension Factory Function

Extensions export a default factory function that receives the `ExtensionAPI`:

```typescript
// Extension entry point
type ExtensionFactory = (api: ExtensionAPI) => void | Promise<void>

export default function (api: ExtensionAPI) {
  // Register handlers, tools, commands during initialization
  api.on("session_start", async (event, ctx) => { ... })
  api.registerTool({ name: "my_tool", ... })
  api.registerCommand("mycommand", { ... })
}
```

**Key constraints:**
- Factory executes during loading phase (before session starts)
- Action methods (sendMessage, appendEntry) throw if called during loading
- Use event handlers to perform runtime actions

---

## ExtensionAPI Interface

```typescript
interface ExtensionAPI {
  // === Event Subscription ===
  on(event: EventType, handler: ExtensionHandler): void

  // === Tool Registration ===
  registerTool<TParams extends TSchema, TDetails>(
    tool: ToolDefinition<TParams, TDetails>
  ): void

  // === Command, Shortcut, Flag Registration ===
  registerCommand(name: string, options: CommandOptions): void
  registerShortcut(shortcut: KeyId, options: ShortcutOptions): void
  registerFlag(name: string, options: FlagOptions): void
  getFlag(name: string): boolean | string | undefined

  // === Message Rendering ===
  registerMessageRenderer<T>(customType: string, renderer: MessageRenderer<T>): void

  // === Actions (runtime only) ===
  sendMessage<T>(message: CustomMessage<T>, options?: SendOptions): void
  sendUserMessage(content: string | Content[], options?: DeliverOptions): void
  appendEntry<T>(customType: string, data?: T): void

  // === Session Metadata ===
  setSessionName(name: string): void
  getSessionName(): string | undefined
  setLabel(entryId: string, label: string | undefined): void

  // === Tool Management ===
  getActiveTools(): string[]
  getAllTools(): ToolInfo[]
  setActiveTools(toolNames: string[]): void

  // === Model and Thinking ===
  setModel(model: Model): Promise<boolean>
  getThinkingLevel(): ThinkingLevel
  setThinkingLevel(level: ThinkingLevel): void

  // === Shell Execution ===
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>

  // === Inter-Extension Communication ===
  events: EventBus
}
```

---

## Event System

### Event Types and Lifecycle

Events fire in a defined order during agent operation:

```
SESSION LIFECYCLE
=================
session_start
  |
  +--[user switches session]
  |    session_before_switch (cancellable)
  |    session_switch
  |
  +--[user forks session]
  |    session_before_fork (cancellable)
  |    session_fork
  |
  +--[context compaction triggered]
  |    session_before_compact (cancellable, customizable)
  |    session_compact
  |
  +--[tree navigation]
  |    session_before_tree (cancellable, customizable)
  |    session_tree
  |
  +--[process exit]
       session_shutdown


AGENT TURN LIFECYCLE
====================
input                              // User submits text
  |
before_agent_start                 // Can inject messages, modify system prompt
  |
agent_start                        // Agent loop begins
  |
  +--[for each LLM call]
  |    context                     // Can modify message array
  |    turn_start
  |      |
  |      +--[for each tool]
  |      |    tool_call            // Can block execution
  |      |    tool_result          // Can modify result
  |      |
  |    turn_end
  |
agent_end                          // Agent loop complete


OTHER EVENTS
============
model_select                       // Model changed
user_bash                          // User executed ! or !! command
```

### Event Definitions

#### Session Events

```typescript
// Fired on initial session load
interface SessionStartEvent {
  type: "session_start"
}

// Fired before switching sessions - return { cancel: true } to prevent
interface SessionBeforeSwitchEvent {
  type: "session_before_switch"
  reason: "new" | "resume"
  targetSessionFile?: string
}
interface SessionBeforeSwitchResult {
  cancel?: boolean
}

// Fired after session switch completes
interface SessionSwitchEvent {
  type: "session_switch"
  reason: "new" | "resume"
  previousSessionFile: string | undefined
}

// Fired before forking - return { cancel: true } to prevent
interface SessionBeforeForkEvent {
  type: "session_before_fork"
  entryId: string
}
interface SessionBeforeForkResult {
  cancel?: boolean
  skipConversationRestore?: boolean
}

// Fired after fork completes
interface SessionForkEvent {
  type: "session_fork"
  previousSessionFile: string | undefined
}

// Fired before compaction - can provide custom compaction
interface SessionBeforeCompactEvent {
  type: "session_before_compact"
  preparation: CompactionPreparation
  branchEntries: SessionEntry[]
  customInstructions?: string
  signal: AbortSignal
}
interface SessionBeforeCompactResult {
  cancel?: boolean
  compaction?: CompactionResult  // Custom compaction output
}

// Fired after compaction
interface SessionCompactEvent {
  type: "session_compact"
  compactionEntry: CompactionEntry
  fromExtension: boolean
}

// Fired before tree navigation - can provide custom summary
interface SessionBeforeTreeEvent {
  type: "session_before_tree"
  preparation: TreePreparation
  signal: AbortSignal
}
interface SessionBeforeTreeResult {
  cancel?: boolean
  summary?: { summary: string; details?: unknown }
  customInstructions?: string
  replaceInstructions?: boolean
  label?: string
}

// Fired after tree navigation
interface SessionTreeEvent {
  type: "session_tree"
  newLeafId: string | null
  oldLeafId: string | null
  summaryEntry?: BranchSummaryEntry
  fromExtension?: boolean
}

// Fired on process exit
interface SessionShutdownEvent {
  type: "session_shutdown"
}
```

#### Agent Events

```typescript
// Fired when user input received
interface InputEvent {
  type: "input"
  text: string
  images?: ImageContent[]
  source: "interactive" | "rpc" | "extension"
}
type InputEventResult =
  | { action: "continue" }           // Pass through unchanged
  | { action: "transform"; text: string; images?: ImageContent[] }  // Modify
  | { action: "handled" }            // Extension handled, don't send to agent

// Fired after user prompt, before agent loop
interface BeforeAgentStartEvent {
  type: "before_agent_start"
  prompt: string
  images?: ImageContent[]
  systemPrompt: string
}
interface BeforeAgentStartEventResult {
  message?: CustomMessage            // Inject custom message
  systemPrompt?: string              // Replace/modify system prompt
}

// Fired when agent loop starts
interface AgentStartEvent {
  type: "agent_start"
}

// Fired when agent loop ends
interface AgentEndEvent {
  type: "agent_end"
  messages: AgentMessage[]
}

// Fired before each LLM call - can modify messages
interface ContextEvent {
  type: "context"
  messages: AgentMessage[]
}
interface ContextEventResult {
  messages?: AgentMessage[]          // Replacement messages
}

// Fired at turn start
interface TurnStartEvent {
  type: "turn_start"
  turnIndex: number
  timestamp: number
}

// Fired at turn end
interface TurnEndEvent {
  type: "turn_end"
  turnIndex: number
  message: AgentMessage
  toolResults: ToolResultMessage[]
}
```

#### Tool Events

```typescript
// Fired before tool executes - return { block: true } to prevent
interface ToolCallEvent {
  type: "tool_call"
  toolName: string
  toolCallId: string
  input: Record<string, unknown>
}
interface ToolCallEventResult {
  block?: boolean
  reason?: string
}

// Fired after tool executes - can modify result
interface ToolResultEvent {
  type: "tool_result"
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  content: (TextContent | ImageContent)[]
  isError: boolean
  details: unknown                   // Tool-specific details
}
interface ToolResultEventResult {
  content?: (TextContent | ImageContent)[]
  details?: unknown
  isError?: boolean
}
```

#### Other Events

```typescript
// Fired when model changes
interface ModelSelectEvent {
  type: "model_select"
  model: Model
  previousModel: Model | undefined
  source: "set" | "cycle" | "restore"
}

// Fired when user executes bash via ! or !! prefix
interface UserBashEvent {
  type: "user_bash"
  command: string
  excludeFromContext: boolean        // true if !! prefix
  cwd: string
}
interface UserBashEventResult {
  operations?: BashOperations        // Custom execution ops
  result?: BashResult                // Full replacement result
}
```

### Handler Function Signature

```typescript
type ExtensionHandler<E, R = undefined> = (
  event: E,
  ctx: ExtensionContext
) => Promise<R | void> | R | void
```

- Handlers can be sync or async
- Return `void` to continue without modification
- Return result object for events that support it

### Event Firing Order

When multiple extensions register handlers for the same event:
1. Handlers execute in extension load order
2. Results from `before_*` events can short-circuit (cancel)
3. Modification results chain through handlers

---

## Tool Registration

### ToolDefinition Schema

```typescript
interface ToolDefinition<TParams extends TSchema, TDetails = unknown> {
  // Identity
  name: string               // Tool name used in LLM tool calls
  label: string              // Human-readable label for UI
  description: string        // Description sent to LLM

  // Parameters (TypeBox schema)
  parameters: TParams

  // Execution
  execute(
    toolCallId: string,
    params: Static<TParams>,           // Validated parameters
    onUpdate: AgentToolUpdateCallback<TDetails> | undefined,  // Streaming updates
    ctx: ExtensionContext,
    signal?: AbortSignal
  ): Promise<AgentToolResult<TDetails>>

  // Custom rendering (optional)
  renderCall?: (args: Static<TParams>, theme: Theme) => Component
  renderResult?: (
    result: AgentToolResult<TDetails>,
    options: ToolRenderResultOptions,
    theme: Theme
  ) => Component
}
```

### TypeBox Parameter Schemas

Use TypeBox for parameter validation:

```typescript
import { Type } from "@sinclair/typebox"

api.registerTool({
  name: "search_files",
  label: "Search Files",
  description: "Search for files matching a pattern",
  parameters: Type.Object({
    pattern: Type.String({ description: "Glob pattern" }),
    path: Type.Optional(Type.String({ description: "Base directory" })),
    maxResults: Type.Optional(Type.Number({
      description: "Max results",
      default: 100
    }))
  }),

  async execute(toolCallId, params, onUpdate, ctx, signal) {
    // params is typed as { pattern: string; path?: string; maxResults?: number }
    const { pattern, path = ".", maxResults = 100 } = params

    // Streaming updates
    let found = 0
    onUpdate?.({
      content: [{ type: "text", text: `Searching... ${found} found` }],
      details: { found }
    })

    // Return result
    return {
      content: [{ type: "text", text: `Found ${found} files` }],
      details: { files: [...], totalFound: found }
    }
  }
})
```

### Tool Result Structure

```typescript
interface AgentToolResult<TDetails = unknown> {
  content: (TextContent | ImageContent)[]
  details?: TDetails                   // Extension-specific metadata
  isError?: boolean
}
```

### Custom Rendering

Tools can provide custom UI rendering:

```typescript
api.registerTool({
  // ...

  renderCall(args, theme) {
    // Render tool invocation (shown while running)
    const preview = args.pattern.length > 50
      ? args.pattern.slice(0, 47) + "..."
      : args.pattern
    return new Text(
      theme.fg("toolTitle", "search ") +
      theme.fg("accent", preview)
    )
  },

  renderResult(result, options, theme) {
    const { expanded, isPartial } = options
    const files = result.details?.files ?? []

    if (expanded) {
      // Full view
      const container = new Container()
      for (const file of files) {
        container.addChild(new Text(theme.fg("accent", file)))
      }
      return container
    }

    // Collapsed view
    return new Text(
      theme.fg("success", `${files.length} files`) +
      (isPartial ? theme.fg("dim", " (searching...)") : "")
    )
  }
})
```

---

## Command Registration

### RegisteredCommand Schema

```typescript
interface RegisteredCommand {
  name: string
  description?: string

  // Argument completion (optional)
  getArgumentCompletions?: (
    argumentPrefix: string
  ) => AutocompleteItem[] | null

  // Handler receives extended context with session control
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>
}
```

### Command Context

Command handlers receive `ExtensionCommandContext` with additional session control:

```typescript
interface ExtensionCommandContext extends ExtensionContext {
  // Wait for agent to finish streaming
  waitForIdle(): Promise<void>

  // Start new session
  newSession(options?: {
    parentSession?: string
    setup?: (sessionManager: SessionManager) => Promise<void>
  }): Promise<{ cancelled: boolean }>

  // Fork from specific entry
  fork(entryId: string): Promise<{ cancelled: boolean }>

  // Navigate session tree
  navigateTree(
    targetId: string,
    options?: {
      summarize?: boolean
      customInstructions?: string
      replaceInstructions?: boolean
      label?: string
    }
  ): Promise<{ cancelled: boolean }>
}
```

### Command Example

```typescript
api.registerCommand("preset", {
  description: "Switch preset configuration",

  getArgumentCompletions(prefix) {
    const presets = ["plan", "implement", "review"]
    return presets
      .filter(p => p.startsWith(prefix))
      .map(p => ({ value: p, label: p }))
  },

  async handler(args, ctx) {
    if (!args.trim()) {
      // Show selector UI
      const choice = await ctx.ui.select(
        "Select preset",
        ["plan", "implement", "review"]
      )
      if (!choice) return
      args = choice
    }

    // Apply preset...
    ctx.ui.notify(`Preset "${args}" activated`, "info")
  }
})
```

---

## Shortcut Registration

### ShortcutOptions Schema

```typescript
interface ShortcutOptions {
  description?: string
  handler: (ctx: ExtensionContext) => Promise<void> | void
}
```

### Key Identifiers

Use `KeyId` constants from the UI library:

```typescript
import { Key } from "@mariozechner/pi-tui"

api.registerShortcut(Key.ctrlShift("u"), {
  description: "Cycle presets",
  handler: async (ctx) => {
    // Cycle through presets
  }
})

api.registerShortcut(Key.f5, {
  description: "Refresh data",
  handler: (ctx) => {
    ctx.ui.notify("Refreshing...", "info")
  }
})
```

### Reserved Shortcuts

These shortcuts cannot be overridden by extensions:

- `interrupt` (Ctrl+C)
- `clear`
- `exit` (Ctrl+D)
- `suspend` (Ctrl+Z)
- `cycleThinkingLevel`
- `cycleModelForward` / `cycleModelBackward`
- `selectModel` (Ctrl+P)
- `expandTools`
- `toggleThinking`
- `externalEditor`
- `followUp`
- `submit`
- `selectConfirm` / `selectCancel`
- `copy`
- `deleteToLineEnd`

Non-reserved shortcuts show a warning but allow override.

---

## Flag Registration

### FlagOptions Schema

```typescript
interface FlagOptions {
  description?: string
  type: "boolean" | "string"
  default?: boolean | string
}
```

### Flag Example

```typescript
// Register during initialization
api.registerFlag("preset", {
  description: "Preset configuration to use",
  type: "string"
})

api.registerFlag("verbose", {
  description: "Enable verbose output",
  type: "boolean",
  default: false
})

// Read in event handlers
api.on("session_start", async (event, ctx) => {
  const preset = api.getFlag("preset")      // string | undefined
  const verbose = api.getFlag("verbose")    // boolean | string | undefined

  if (typeof preset === "string") {
    // Apply preset configuration
  }
})
```

Flags are passed via CLI: `--preset plan --verbose`

---

## UI Context

### ExtensionUIContext Methods

```typescript
interface ExtensionUIContext {
  // === Dialogs ===
  select(
    title: string,
    options: string[],
    opts?: { signal?: AbortSignal; timeout?: number }
  ): Promise<string | undefined>

  confirm(
    title: string,
    message: string,
    opts?: { signal?: AbortSignal; timeout?: number }
  ): Promise<boolean>

  input(
    title: string,
    placeholder?: string,
    opts?: { signal?: AbortSignal; timeout?: number }
  ): Promise<string | undefined>

  editor(
    title: string,
    prefill?: string
  ): Promise<string | undefined>

  // === Notifications ===
  notify(message: string, type?: "info" | "warning" | "error"): void

  // === Status Bar ===
  setStatus(key: string, text: string | undefined): void
  setWorkingMessage(message?: string): void

  // === Widgets ===
  setWidget(
    key: string,
    content: string[] | undefined,
    options?: { placement?: "aboveEditor" | "belowEditor" }
  ): void
  setWidget(
    key: string,
    factory: ((tui: TUI, theme: Theme) => Component) | undefined,
    options?: { placement?: "aboveEditor" | "belowEditor" }
  ): void

  // === Custom Components ===
  setFooter(
    factory: ((tui: TUI, theme: Theme, footerData: FooterDataProvider) => Component) | undefined
  ): void
  setHeader(
    factory: ((tui: TUI, theme: Theme) => Component) | undefined
  ): void
  setTitle(title: string): void

  // === Editor ===
  setEditorText(text: string): void
  getEditorText(): string
  setEditorComponent(
    factory: ((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => EditorComponent) | undefined
  ): void

  // === Custom Overlay ===
  custom<T>(
    factory: (
      tui: TUI,
      theme: Theme,
      keybindings: KeybindingsManager,
      done: (result: T) => void
    ) => Component | Promise<Component>,
    options?: {
      overlay?: boolean
      overlayOptions?: OverlayOptions | (() => OverlayOptions)
      onHandle?: (handle: OverlayHandle) => void
    }
  ): Promise<T>

  // === Theming ===
  readonly theme: Theme
  getAllThemes(): { name: string; path: string | undefined }[]
  getTheme(name: string): Theme | undefined
  setTheme(theme: string | Theme): { success: boolean; error?: string }
}
```

### UI Availability

Check `ctx.hasUI` before using UI methods:

```typescript
api.on("session_before_fork", async (event, ctx) => {
  if (!ctx.hasUI) {
    // Non-interactive mode (RPC, print)
    return
  }

  const choice = await ctx.ui.select(
    "Fork options",
    ["Keep current code", "Restore checkpoint"]
  )
  // ...
})
```

### Custom Component Example

```typescript
api.registerCommand("settings", {
  async handler(args, ctx) {
    const result = await ctx.ui.custom<string | null>((tui, theme, kb, done) => {
      const container = new Container()

      // Header
      container.addChild(new Text(theme.fg("accent", "Settings")))

      // Content
      const list = new SettingsList(items, height, listTheme,
        (id, value) => { /* setting changed */ },
        () => done(null)  // User cancelled
      )
      container.addChild(list)

      return {
        render(width) {
          return container.render(width)
        },
        invalidate() {
          container.invalidate()
        },
        handleInput(data) {
          list.handleInput(data)
          tui.requestRender()
        },
        dispose() {
          // Cleanup resources
        }
      }
    })
  }
})
```

---

## Extension Context

Event handlers receive `ExtensionContext`:

```typescript
interface ExtensionContext {
  // UI methods (no-op in non-interactive modes)
  ui: ExtensionUIContext
  hasUI: boolean

  // Environment
  cwd: string

  // Session access (read-only)
  sessionManager: ReadonlySessionManager

  // Model management
  modelRegistry: ModelRegistry
  model: Model | undefined

  // Agent state
  isIdle(): boolean
  abort(): void
  hasPendingMessages(): boolean

  // Context management
  getContextUsage(): ContextUsage | undefined
  compact(options?: CompactOptions): void

  // Process control
  shutdown(): void
}

interface ContextUsage {
  tokens: number
  contextWindow: number
  percent: number
  usageTokens: number
  trailingTokens: number
  lastUsageIndex: number | null
}
```

---

## State Persistence

### appendEntry for State Storage

Use `appendEntry` to persist extension state in the session:

```typescript
interface ToolsState {
  enabledTools: string[]
}

// Save state
api.appendEntry<ToolsState>("tools-config", {
  enabledTools: ["read", "bash", "edit"]
})

// Restore state
api.on("session_start", async (event, ctx) => {
  const entries = ctx.sessionManager.getBranch()

  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === "tools-config") {
      const data = entry.data as ToolsState
      api.setActiveTools(data.enabledTools)
    }
  }
})
```

Entries are:
- Persisted to session file
- **Not** sent to LLM
- Branch-aware (different branches can have different state)
- Restored on session load/navigation

### Restoring on Branch Navigation

Handle tree navigation to restore branch-specific state:

```typescript
function restoreState(ctx: ExtensionContext) {
  const entries = ctx.sessionManager.getBranch()
  // Find last state entry and apply...
}

api.on("session_start", (e, ctx) => restoreState(ctx))
api.on("session_tree", (e, ctx) => restoreState(ctx))
api.on("session_fork", (e, ctx) => restoreState(ctx))
api.on("session_switch", (e, ctx) => restoreState(ctx))
```

---

## Inter-Extension Communication

### EventBus API

```typescript
interface EventBus {
  emit(channel: string, data: unknown): void
  on(channel: string, handler: (data: unknown) => void): () => void
}
```

### Usage

```typescript
// Extension A - emitter
api.on("tool_result", async (event, ctx) => {
  if (event.toolName === "git_commit") {
    api.events.emit("git:commit", {
      hash: event.details?.hash,
      message: event.details?.message
    })
  }
})

// Extension B - listener
const unsubscribe = api.events.on("git:commit", (data) => {
  console.log("Commit detected:", data)
})

// Cleanup on shutdown
api.on("session_shutdown", () => {
  unsubscribe()
})
```

### Channel Conventions

- Namespace channels: `extensionName:eventType`
- Common channels: `git:*`, `file:*`, `agent:*`

---

## Extension Loading

### Discovery Locations

Extensions are discovered from (in order):

1. **Global**: `~/.pi/agent/extensions/`
2. **Project-local**: `<cwd>/.pi/extensions/`
3. **CLI-specified**: `--extension <path>`

### Discovery Rules

```
extensions/
  |- my-tool.ts              # Direct file -> load
  |- my-tool.js              # Direct file -> load
  |- complex-ext/
  |  |- package.json         # If has "pi.extensions" -> load declared
  |  |- index.ts             # Or fallback to index file
  |- simple-ext/
  |  |- index.ts             # No package.json -> load index
```

### package.json Manifest

```json
{
  "name": "my-extension",
  "pi": {
    "extensions": ["src/main.ts", "src/tools.ts"],
    "themes": ["themes/dark.json"],
    "skills": ["skills/commit.ts"]
  }
}
```

### Load Order

1. Resolve all extension paths (deduplicated)
2. Create shared `ExtensionRuntime` with throwing action stubs
3. Load each extension:
   - Resolve path (expand `~`, resolve relative)
   - Import module via jiti (TypeScript support)
   - Create `ExtensionAPI` bound to extension
   - Execute factory function
   - Collect handlers, tools, commands, flags, shortcuts
4. Runner initializes runtime with real action implementations
5. Emit `session_start` to all extensions

### Dependency Resolution

Extensions can have npm dependencies:

```
my-extension/
  |- package.json            # Declares dependencies
  |- node_modules/           # npm install creates this
  |- index.ts
```

The loader (jiti) resolves imports from extension's `node_modules`.

---

## Error Isolation

### Handler Error Handling

Errors in handlers are caught and reported without crashing:

```typescript
interface ExtensionError {
  extensionPath: string
  event: string
  error: string
  stack?: string
}
```

The runner:
1. Catches exceptions in event handlers
2. Emits `ExtensionError` to error listeners
3. Continues with next handler/extension
4. Does not propagate error to caller

### Error Listener

```typescript
extensionRunner.onError((error) => {
  console.error(`Extension error [${error.extensionPath}] ${error.event}: ${error.error}`)
  if (error.stack) console.error(error.stack)
})
```

---

## Message Rendering

### Custom Message Renderer

Register renderers for custom message types:

```typescript
interface CustomMessage<T = unknown> {
  customType: string
  content: string
  display: "inline" | "block"
  details?: T
}

type MessageRenderer<T> = (
  message: CustomMessage<T>,
  options: { expanded: boolean },
  theme: Theme
) => Component | undefined

api.registerMessageRenderer<MyDetails>("my-message-type", (message, opts, theme) => {
  const { details, content } = message
  const { expanded } = opts

  if (expanded) {
    return new Markdown(content, 0, 0, markdownTheme)
  }

  return new Text(theme.fg("dim", content.slice(0, 100)))
})
```

### Sending Custom Messages

```typescript
api.sendMessage({
  customType: "my-message-type",
  content: "# Status Report\n\nAll systems operational.",
  display: "block",
  details: { status: "ok", timestamp: Date.now() }
}, {
  triggerTurn: false,
  deliverAs: "nextTurn"
})
```

Options:
- `triggerTurn`: Whether to trigger agent turn (default: false)
- `deliverAs`: "steer" | "followUp" | "nextTurn"

---

## Security Considerations

### Untrusted Extensions

Extensions have full access to:
- File system (via tools)
- Shell execution (via `exec`)
- Network (via Node.js APIs)
- Session data

**Mitigations:**
- Only load extensions from trusted sources
- Review extension code before enabling
- Project-local extensions prompt for confirmation

### Project-Local Extension Confirmation

When `agentScope: "both"` or `"project"`:

```typescript
// Subagent tool confirms before running project extensions
if (projectAgentsRequested.length > 0) {
  const ok = await ctx.ui.confirm(
    "Run project-local agents?",
    `Agents: ${names}\nSource: ${dir}\n\nOnly continue for trusted repositories.`
  )
  if (!ok) return { content: [{ type: "text", text: "Canceled" }] }
}
```

### Shortcut Conflicts

Reserved system shortcuts cannot be overridden. Non-reserved overrides show warnings:

```typescript
if (builtInKeybinding?.restrictOverride === true) {
  console.warn(`Extension shortcut '${key}' conflicts with built-in. Skipping.`)
  continue
}

if (builtInKeybinding?.restrictOverride === false) {
  console.warn(`Extension shortcut '${key}' overrides built-in ${action}.`)
}
```

---

## Runtime Lifecycle

### Phase 1: Loading

```typescript
const runtime = createExtensionRuntime()  // Throwing stubs
const extensions = await loadExtensions(paths, cwd, eventBus)
// extensions now have handlers, tools, commands registered
// runtime.sendMessage() etc. still throw
```

### Phase 2: Initialization

```typescript
const runner = new ExtensionRunner(extensions, runtime, cwd, sessionManager, modelRegistry)

runner.initialize(
  actions,                   // sendMessage, appendEntry, etc.
  contextActions,            // getModel, isIdle, abort, etc.
  commandContextActions,     // waitForIdle, newSession, fork, etc. (optional)
  uiContext                  // UI methods (optional, no-op if not provided)
)
// runtime.sendMessage() etc. now work
```

### Phase 3: Running

```typescript
// Emit events
await runner.emit({ type: "session_start" })
await runner.emit({ type: "agent_start" })
const modifiedMessages = await runner.emitContext(messages)
const toolResult = await runner.emitToolCall(event)
// etc.

// Access registered items
const tools = runner.getAllRegisteredTools()
const commands = runner.getRegisteredCommands()
const shortcuts = runner.getShortcuts(keybindings)
```

### Phase 4: Shutdown

```typescript
await emitSessionShutdownEvent(runner)
// Extensions can cleanup in session_shutdown handler
```

---

## Complete Extension Example

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent"
import { Type } from "@sinclair/typebox"

interface PresetConfig {
  name: string
  model?: string
  tools?: string[]
  instructions?: string
}

interface PresetState {
  activePreset: string
}

export default function presetExtension(api: ExtensionAPI) {
  let presets: Record<string, PresetConfig> = {}
  let activePreset: string | undefined

  // Register CLI flag
  api.registerFlag("preset", {
    description: "Preset to activate on startup",
    type: "string"
  })

  // Register keyboard shortcut
  api.registerShortcut(Key.ctrlShift("p"), {
    description: "Cycle presets",
    handler: async (ctx) => {
      const names = Object.keys(presets)
      const currentIdx = activePreset ? names.indexOf(activePreset) : -1
      const nextIdx = (currentIdx + 1) % names.length
      await applyPreset(names[nextIdx], ctx)
    }
  })

  // Register command
  api.registerCommand("preset", {
    description: "Switch preset configuration",
    getArgumentCompletions: (prefix) =>
      Object.keys(presets)
        .filter(p => p.startsWith(prefix))
        .map(p => ({ value: p, label: p })),
    handler: async (args, ctx) => {
      if (args.trim()) {
        await applyPreset(args.trim(), ctx)
      } else {
        const choice = await ctx.ui.select("Select preset", Object.keys(presets))
        if (choice) await applyPreset(choice, ctx)
      }
    }
  })

  // Apply preset configuration
  async function applyPreset(name: string, ctx: ExtensionContext) {
    const preset = presets[name]
    if (!preset) {
      ctx.ui.notify(`Unknown preset: ${name}`, "error")
      return
    }

    if (preset.tools) api.setActiveTools(preset.tools)
    activePreset = name

    // Persist state
    api.appendEntry<PresetState>("preset-state", { activePreset: name })

    ctx.ui.setStatus("preset", ctx.ui.theme.fg("accent", `preset:${name}`))
    ctx.ui.notify(`Preset "${name}" activated`, "info")
  }

  // Restore state on session events
  function restoreState(ctx: ExtensionContext) {
    presets = loadPresets(ctx.cwd)  // Load from JSON files

    // Check CLI flag first
    const flagPreset = api.getFlag("preset")
    if (typeof flagPreset === "string" && presets[flagPreset]) {
      applyPreset(flagPreset, ctx)
      return
    }

    // Restore from session
    const entries = ctx.sessionManager.getBranch()
    const stateEntry = entries
      .filter(e => e.type === "custom" && e.customType === "preset-state")
      .pop()

    if (stateEntry?.data?.activePreset) {
      activePreset = stateEntry.data.activePreset
      ctx.ui.setStatus("preset", ctx.ui.theme.fg("accent", `preset:${activePreset}`))
    }
  }

  api.on("session_start", (e, ctx) => restoreState(ctx))
  api.on("session_tree", (e, ctx) => restoreState(ctx))
  api.on("session_switch", (e, ctx) => restoreState(ctx))

  // Inject instructions into system prompt
  api.on("before_agent_start", (event) => {
    const preset = activePreset ? presets[activePreset] : undefined
    if (preset?.instructions) {
      return {
        systemPrompt: `${event.systemPrompt}\n\n${preset.instructions}`
      }
    }
  })
}
```

---

## Appendix: Type Definitions Summary

```typescript
// Core types
type ExtensionFactory = (api: ExtensionAPI) => void | Promise<void>
type ExtensionHandler<E, R> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh"

// Event union
type ExtensionEvent =
  | SessionStartEvent | SessionBeforeSwitchEvent | SessionSwitchEvent
  | SessionBeforeForkEvent | SessionForkEvent
  | SessionBeforeCompactEvent | SessionCompactEvent
  | SessionBeforeTreeEvent | SessionTreeEvent | SessionShutdownEvent
  | InputEvent | BeforeAgentStartEvent | AgentStartEvent | AgentEndEvent
  | ContextEvent | TurnStartEvent | TurnEndEvent
  | ToolCallEvent | ToolResultEvent | ModelSelectEvent | UserBashEvent

// Session union
type SessionEvent =
  | SessionStartEvent | SessionBeforeSwitchEvent | SessionSwitchEvent
  | SessionBeforeForkEvent | SessionForkEvent
  | SessionBeforeCompactEvent | SessionCompactEvent
  | SessionBeforeTreeEvent | SessionTreeEvent | SessionShutdownEvent

// Content types
interface TextContent { type: "text"; text: string }
interface ImageContent { type: "image"; data: string; mediaType: string }

// Tool result
interface AgentToolResult<TDetails = unknown> {
  content: (TextContent | ImageContent)[]
  details?: TDetails
  isError?: boolean
}

// Render options
interface ToolRenderResultOptions {
  expanded: boolean
  isPartial: boolean
}

interface MessageRenderOptions {
  expanded: boolean
}
```
