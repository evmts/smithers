# Interactive CLI Commands

This document describes the interactive slash commands available during Smithers execution, similar to Claude Code's real-time control interface.

## Overview

Interactive commands allow users to control the Ralph Wiggum loop execution in real-time:
- Pause/resume execution
- Inspect current state
- Navigate the SmithersNode tree
- Skip or inject context into agents
- Abort execution gracefully

## Command Reference

### `/pause`

**Description:** Pauses the Ralph Wiggum loop after the current frame completes.

**Usage:**
```
/pause
```

**Behavior:**
- Execution completes the current frame (any running Claude/ClaudeApi nodes)
- Loop pauses before starting the next frame
- TUI remains active and responsive
- Status shown: "Paused at frame N"

**Use Cases:**
- Inspect intermediate results before continuing
- Review plan before executing next phase
- Debug unexpected behavior

---

### `/resume`

**Description:** Resumes execution from a paused state.

**Usage:**
```
/resume
```

**Behavior:**
- Continues Ralph loop from next pending frame
- Same behavior as if execution was never paused

**Use Cases:**
- Continue after inspection
- Resume after manual intervention

---

### `/status`

**Description:** Shows current execution state without modifying behavior.

**Usage:**
```
/status
```

**Output Example:**
```
Execution Status:
  Frame: 5
  Elapsed: 12.3s
  Pending Nodes: 3
    - claude[1] (phase: "implementation")
    - claude[2] (phase: "testing")
    - claude[3] (phase: "documentation")
  Completed Nodes: 8
  Failed Nodes: 0
  State: running
```

**Use Cases:**
- Quick overview without navigating TUI
- Check progress in non-TUI mode
- Verify which nodes are pending

---

### `/tree`

**Description:** Prints the current SmithersNode tree in a compact format.

**Usage:**
```
/tree [--full]
```

**Options:**
- `--full`: Include all props and execution state details
- (default): Show structure only

**Output Example (default):**
```
ROOT
├─ phase[0] name="planning"
│  └─ claude[0] status=complete
├─ phase[1] name="implementation"
│  ├─ claude[1] status=running
│  └─ claude[2] status=pending
└─ phase[2] name="review"
   └─ claude[3] status=pending
```

**Output Example (--full):**
```
ROOT
├─ phase[0] name="planning"
│  props: { name: "planning" }
│  execution: { status: "complete" }
│  └─ claude[0]
│     props: { system: "You are a planning agent" }
│     execution: { status: "complete", result: "..." }
...
```

**Use Cases:**
- Visualize tree structure without TUI
- Debug tree building issues
- Export tree for analysis

---

### `/focus <path>`

**Description:** In TUI mode, focuses on a specific node by path.

**Usage:**
```
/focus ROOT/phase[1]/claude[1]
```

**Behavior:**
- Navigates TUI tree to specified node
- Expands parent nodes as needed
- Switches to detail view if node is Claude/ClaudeApi
- Shows error if path not found

**Path Format:**
- Same as TUI paths: `ROOT/type[index]/type[index]`
- Example: `ROOT/subagent[0]/claude[2]`

**Use Cases:**
- Jump to specific node quickly
- Navigate to error location
- Follow execution flow

---

### `/skip`

**Description:** Marks the current pending node as skipped, continues to next.

**Usage:**
```
/skip [<path>]
```

**Arguments:**
- `<path>` (optional): Path to specific node to skip
- (no args): Skips the first pending node

**Behavior:**
- Node execution state set to `skipped`
- onFinished NOT called for skipped node
- Loop continues to next pending node

**Use Cases:**
- Skip failing node temporarily
- Test later phases without earlier work
- Debug specific workflow branches

---

### `/inject <prompt>`

**Description:** Injects additional context into the next Claude node execution.

**Usage:**
```
/inject <prompt>
```

**Example:**
```
/inject The user clarifies: use TypeScript strict mode
```

**Behavior:**
- Next Claude/ClaudeApi node gets injected text appended to its prompt
- Injection is one-time (not persisted to tree)
- Shown in TUI as `(+injected)` indicator

**Use Cases:**
- Provide clarification without modifying source
- Add runtime context
- Override agent assumptions

---

### `/abort`

**Description:** Immediately stops execution and exits gracefully.

**Usage:**
```
/abort [<reason>]
```

**Arguments:**
- `<reason>` (optional): Reason for aborting (logged)

**Behavior:**
- Stops Ralph loop immediately (doesn't wait for frame)
- Running nodes are interrupted (no results stored)
- onError callback called with AbortError
- TUI exits cleanly

**Use Cases:**
- Stop runaway execution
- Exit after discovering issue
- Emergency stop

---

### `/help`

**Description:** Shows available commands and usage.

**Usage:**
```
/help [<command>]
```

**Arguments:**
- `<command>` (optional): Show detailed help for specific command

**Output Example (no args):**
```
Available Commands:
  /pause          Pause execution
  /resume         Resume execution
  /status         Show execution status
  /tree           Show node tree
  /focus <path>   Focus on node
  /skip [<path>]  Skip pending node
  /inject <text>  Inject context
  /abort [reason] Abort execution
  /help [cmd]     Show this help

Type /help <command> for detailed usage.
```

---

## Implementation Architecture

### Input Handling

```typescript
interface CommandInput {
  command: string       // e.g., "pause", "skip"
  args: string[]        // Parsed arguments
  rawInput: string      // Full input text
}
```

**Input Sources:**
1. **Stdin (readline)**: Non-TUI mode, blocks for input
2. **TUI Keyboard**: TUI mode, command palette triggered by `:` key
3. **IPC/Signal**: External control (future)

### Command Execution Flow

```
User Input
  ↓
Parse Command
  ↓
Validate Arguments
  ↓
Update ExecutionController State
  ↓
Ralph Loop Reacts to State
  ↓
Respond to User
```

### ExecutionController State

```typescript
interface ExecutionController {
  paused: boolean
  skipNextNode: boolean
  skipNodePath?: string
  injectedPrompt?: string
  aborted: boolean
  abortReason?: string

  // Methods
  pause(): void
  resume(): void
  skip(nodePath?: string): void
  inject(prompt: string): void
  abort(reason?: string): void
  getStatus(): ExecutionStatus
}
```

**Integration with executePlan():**
- ExecutionController passed as option to `executePlan()`
- Ralph loop checks controller state before each frame
- Paused: sleep/wait until resumed
- Skipped: mark node as skipped, continue
- Injected: append to next Claude prompt
- Aborted: throw AbortError, exit loop

### Readline Integration (Non-TUI)

```typescript
// Pseudo-code
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'smithers> '
})

rl.on('line', (input) => {
  if (input.startsWith('/')) {
    const parsed = parseCommand(input)
    handleCommand(parsed, controller)
  }
})

// Run in parallel with executePlan
Promise.all([
  executePlan(element, { controller }),
  handleReadlineInput(rl, controller)
])
```

### TUI Integration

**Command Palette:**
- Press `:` to open command input at bottom of screen
- Type command + args
- Enter to execute, Escape to cancel

**Command Feedback:**
- Show command result in status bar
- Update tree view immediately if state changes
- Error messages shown inline

**Example Flow:**
1. User presses `:`
2. Status bar becomes input field: `:_`
3. User types `pause`
4. Press Enter
5. Status bar shows: `✓ Paused at frame 5`
6. Tree view shows "(Paused)" indicator

---

## Error Handling

### Invalid Command
```
❌ Unknown command: /foo
Type /help for available commands.
```

### Missing Required Argument
```
❌ /focus requires a node path
Usage: /focus <path>
```

### Invalid Node Path
```
❌ Node not found: ROOT/phase[99]
Use /tree to see available paths.
```

### Invalid State Transition
```
❌ Cannot resume: not paused
```

---

## Examples

### Pause and Inspect

```bash
# Execution running...
/pause
# ✓ Paused at frame 3

/status
# Execution Status:
#   Frame: 3
#   State: paused
#   ...

/tree
# ROOT
# ├─ phase[0] ✓
# ├─ phase[1] ⏸
# └─ phase[2] ⏳

/resume
# ✓ Resumed execution
```

### Skip Failing Node

```bash
# Node failing repeatedly...
/status
# Pending Nodes: 1
#   - claude[5] (phase: "api-integration")

/skip ROOT/phase[2]/claude[5]
# ✓ Skipped claude[5]
# Continuing to next node...
```

### Inject Context

```bash
/inject The API endpoint changed to /v2/users
# ✓ Context will be injected into next Claude node

# Next node executes with:
# Original prompt: "Call the user API"
# Injected prompt: "Call the user API\n\nThe API endpoint changed to /v2/users"
```

### Abort on Error

```bash
# Something goes wrong...
/abort Found critical security issue
# ✓ Aborting execution: Found critical security issue
# Execution stopped at frame 7
```

---

## Configuration

### Enable/Disable Commands

In `smithers.config.ts`:
```typescript
export default defineConfig({
  interactive: {
    enabled: true,                    // Enable interactive commands
    allowedCommands: ['pause', 'resume', 'status'],  // Whitelist
    disallowedCommands: ['abort'],   // Blacklist
    requireConfirmation: ['skip', 'abort'],  // Prompt Y/N
  }
})
```

### Command Aliases

```typescript
export default defineConfig({
  interactive: {
    aliases: {
      's': 'status',
      'p': 'pause',
      'r': 'resume',
    }
  }
})
```

---

## Testing Interactive Commands

### Unit Tests

Test command parsing and validation:
```typescript
test('parseCommand handles /pause', () => {
  const cmd = parseCommand('/pause')
  expect(cmd.command).toBe('pause')
  expect(cmd.args).toEqual([])
})

test('parseCommand handles /focus with path', () => {
  const cmd = parseCommand('/focus ROOT/claude[0]')
  expect(cmd.command).toBe('focus')
  expect(cmd.args).toEqual(['ROOT/claude[0]'])
})
```

### Integration Tests

Test ExecutionController state changes:
```typescript
test('pause stops execution after current frame', async () => {
  const controller = new ExecutionController()
  const promise = executePlan(<Agent />, { controller })

  // Let first frame complete
  await sleep(100)
  controller.pause()

  // Should pause after frame
  await sleep(100)
  expect(controller.paused).toBe(true)

  controller.resume()
  await promise
})
```

---

## Future Enhancements

1. **History:** Command history with up/down arrows
2. **Tab Completion:** Auto-complete commands and paths
3. **Scripting:** Run commands from script file
4. **Remote Control:** Control via HTTP API or WebSocket
5. **Breakpoints:** Pause at specific nodes automatically
6. **Watchpoints:** Pause when state conditions met
7. **Replay:** Record/replay command sequences
8. **Multiplayer:** Multiple users controlling same execution (collaborative debugging)
