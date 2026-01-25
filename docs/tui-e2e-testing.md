# TUI E2E Testing Framework (AoC-Style)

> Advent-of-Code style E2E evals for terminal UI using tui-tester (tmux-backed)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     TUI E2E Test Runner                         │
├─────────────────────────────────────────────────────────────────┤
│ test/e2e/                                                       │
│ ├── day-01/                    # Day/challenge structure        │
│ │   ├── input.txt              # Scenario description           │
│ │   ├── expected.snap          # Expected screen snapshot       │
│ │   ├── keystrokes.txt         # Input sequence                 │
│ │   └── solution.ts            # Test implementation            │
│ ├── day-02/                                                     │
│ │   └── ...                                                     │
│ ├── helpers/                   # Shared test utilities          │
│ │   ├── tui-tester-wrapper.ts  # Bun/tmux adapter               │
│ │   └── assertions.ts          # Custom matchers                │
│ └── runner.ts                  # Main test orchestrator         │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### 1. Challenge-Based Structure (like AoC)

Each test is a "day" with:
- **Input**: Initial state or scenario setup
- **Expected Output**: Snapshot or assertions
- **Solution**: Test code that exercises the TUI

### 2. tui-tester Integration

```typescript
import { createTester } from 'tui-tester'

const tester = createTester('zig build run -- --interactive', {
  cols: 120,
  rows: 40,
  debug: process.env.TUI_DEBUG === 'true',
  snapshotDir: './test/e2e/__snapshots__'
})
```

### 3. Core APIs for TUI Testing

| Operation | API | Example |
|-----------|-----|---------|
| Start app | `tester.start()` | Boot TUI binary |
| Send keys | `tester.sendKey('j')` | Navigate down |
| Send text | `tester.typeText('hello')` | Type in input |
| Wait text | `tester.waitForText('Ready')` | Wait for render |
| Snapshot | `tester.takeSnapshot('main-view')` | Capture state |
| Assert | `tester.assertScreenContains('✓')` | Verify content |
| Mouse | `tester.click(10, 5)` | Click at position |

## Day Structure

### day-01/input.txt
```
# Navigation Test
Start the TUI and verify arrow keys work.
Expected: pressing 'j' moves selection down.
```

### day-01/keystrokes.txt
```
wait:Ready
key:j
key:j
key:j
snapshot:after-navigation
assert:3 selected
```

### day-01/solution.ts
```typescript
import { describe, test, expect, afterEach } from 'bun:test'
import { createTestRunner } from '../helpers/tui-tester-wrapper'

describe('Day 01: Navigation', () => {
  const runner = createTestRunner()

  afterEach(() => runner.cleanup())

  test('j key moves selection down', async () => {
    await runner.start()
    await runner.waitForText('Ready')
    
    await runner.sendKey('j')
    await runner.sendKey('j')
    await runner.sendKey('j')
    
    await runner.assertScreenContains('▶ Item 4') // cursor on 4th item
    await runner.matchSnapshot('navigation-down')
  })
})
```

## Keystrokes DSL

A declarative format for test scenarios:

```
# Comments start with #
wait:text               # Wait for text to appear
key:enter               # Send single key
keys:j,j,j,k            # Send multiple keys
type:Hello World        # Type text character by character
click:10,5              # Mouse click at x,y
scroll:up,5             # Scroll up 5 lines
snapshot:name           # Take named snapshot
assert:text             # Assert text exists
assert-not:text         # Assert text does NOT exist
sleep:500               # Wait 500ms
clear                   # Clear screen
resize:120,40           # Resize terminal
```

## Test Helpers

### tui-tester-wrapper.ts
```typescript
import { TmuxTester, createTester } from 'tui-tester'

export interface TestRunnerOptions {
  binary?: string
  args?: string[]
  cols?: number
  rows?: number
  debug?: boolean
}

const DEFAULT_BINARY = 'zig-out/bin/smithers-tui'

export function createTestRunner(options: TestRunnerOptions = {}) {
  const cmd = [options.binary ?? DEFAULT_BINARY, ...(options.args ?? [])]
  
  const tester = createTester(cmd.join(' '), {
    cols: options.cols ?? 120,
    rows: options.rows ?? 40,
    debug: options.debug ?? process.env.TUI_DEBUG === 'true',
    snapshotDir: './test/e2e/__snapshots__'
  })

  return {
    start: () => tester.start(),
    stop: () => tester.stop(),
    cleanup: () => tester.stop(),
    
    // Input
    sendKey: (key: string) => tester.sendKey(key),
    sendKeys: (keys: string[]) => tester.sendKeys(keys),
    typeText: (text: string) => tester.typeText(text),
    click: (x: number, y: number) => tester.click(x, y),
    
    // Assertions
    waitForText: (text: string, timeout = 5000) => 
      tester.waitForText(text, { timeout }),
    assertScreenContains: (text: string) => 
      tester.assertScreenContains(text),
    assertScreenMatches: (pattern: RegExp) => 
      tester.assertScreenMatches(pattern),
    
    // Snapshots
    matchSnapshot: async (name: string) => {
      const snapshot = await tester.takeSnapshot(name)
      return tester.compareSnapshot(snapshot)
    },
    
    // Screen
    getScreen: () => tester.getScreenText(),
    getLines: () => tester.getScreenLines(),
    captureScreen: () => tester.captureScreen(),
    
    // Debug
    debug: (msg: string) => tester.debug(msg),
    sleep: (ms: number) => tester.sleep(ms),
  }
}
```

### Keystrokes Parser
```typescript
export interface Instruction {
  type: 'wait' | 'key' | 'keys' | 'type' | 'click' | 'scroll' | 
        'snapshot' | 'assert' | 'assert-not' | 'sleep' | 'clear' | 'resize'
  value?: string
  args?: string[]
}

export function parseKeystrokes(content: string): Instruction[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const [cmd, ...rest] = line.split(':')
      const value = rest.join(':').trim()
      
      switch (cmd) {
        case 'keys':
          return { type: 'keys', args: value.split(',').map(k => k.trim()) }
        case 'click':
        case 'resize':
          const [a, b] = value.split(',').map(n => parseInt(n.trim()))
          return { type: cmd, args: [String(a), String(b)] }
        case 'scroll':
          const [dir, lines] = value.split(',').map(s => s.trim())
          return { type: 'scroll', args: [dir, lines || '1'] }
        default:
          return { type: cmd as Instruction['type'], value }
      }
    })
}

export async function executeInstructions(
  runner: ReturnType<typeof createTestRunner>,
  instructions: Instruction[]
) {
  for (const inst of instructions) {
    switch (inst.type) {
      case 'wait':
        await runner.waitForText(inst.value!)
        break
      case 'key':
        await runner.sendKey(inst.value!)
        break
      case 'keys':
        await runner.sendKeys(inst.args!)
        break
      case 'type':
        await runner.typeText(inst.value!)
        break
      case 'click':
        await runner.click(parseInt(inst.args![0]), parseInt(inst.args![1]))
        break
      case 'snapshot':
        await runner.matchSnapshot(inst.value!)
        break
      case 'assert':
        await runner.assertScreenContains(inst.value!)
        break
      case 'assert-not':
        const screen = await runner.getScreen()
        if (screen.includes(inst.value!)) {
          throw new Error(`Screen should NOT contain: ${inst.value}`)
        }
        break
      case 'sleep':
        await runner.sleep(parseInt(inst.value!))
        break
      case 'clear':
        // Send Ctrl+L or similar
        await runner.sendKey('l', { ctrl: true })
        break
    }
  }
}
```

## Running Tests

```bash
# Run all E2E tests
bun test test/e2e/

# Run specific day
bun test test/e2e/day-01/

# Update snapshots
UPDATE_SNAPSHOTS=true bun test test/e2e/

# Debug mode (verbose tmux output)
TUI_DEBUG=true bun test test/e2e/day-01/
```

## CI/CD Integration

```yaml
# .github/workflows/e2e.yml
name: TUI E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install tmux
        run: sudo apt-get install -y tmux
        
      - uses: oven-sh/setup-bun@v2
        
      - name: Build TUI
        run: zig build -Doptimize=ReleaseFast
        
      - name: Run E2E tests
        run: bun test test/e2e/
        env:
          CI: true
```

## Complete Test Matrix (100% Feature Coverage)

### Category 1: Application Lifecycle (Days 01-03)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 01 | **Startup** | - | Logo renders, input ready, status bar shows |
| 02 | **Exit - /exit** | type:/exit, key:enter | App exits cleanly |
| 03 | **Exit - Ctrl+D** | key:ctrl+d | App exits when input empty |
| 03b | **Exit - Double Ctrl+C** | key:ctrl+c, sleep:500, key:ctrl+c | App exits on double Ctrl+C |
| 03c | **Suspend - Ctrl+Z** | key:ctrl+z | App suspends (SIGTSTP) |

### Category 2: Input Field (Days 04-12)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 04 | **Text entry** | type:hello world | Input shows "hello world" |
| 05 | **Submit message** | type:test, key:enter | Message appears in chat, input clears |
| 06 | **Clear input - Ctrl+C** | type:discard, key:ctrl+c | Input clears, stays in app |
| 07 | **Line editing - Ctrl+A** | type:end, key:ctrl+a, type:start | Shows "startend" |
| 08 | **Line editing - Ctrl+K** | type:keep this, key:ctrl+a, keys:right,right,right,right, key:ctrl+k | Shows "keep" |
| 09 | **Line editing - Ctrl+U** | type:delete me, key:ctrl+u | Input empty |
| 10 | **Word nav - Alt+B/F** | type:one two three, key:alt+b, key:alt+b | Cursor at "two" |
| 11 | **Word delete - Ctrl+W** | type:keep delete, key:ctrl+w | Shows "keep " |
| 12 | **Undo - Ctrl+Z** | type:hello, key:ctrl+u, key:ctrl+z | Shows "hello" restored |

### Category 3: Command Autocomplete (Days 13-16)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 13 | **Autocomplete trigger** | type:/ | Autocomplete popup appears |
| 14 | **Autocomplete navigate** | type:/h, key:tab | Input shows "/help" |
| 15 | **Autocomplete submit** | type:/he, key:enter | Help message displays |
| 16 | **Popup dismiss** | type:/, key:escape | Popup closes, input has "/" |

### Category 4: Slash Commands (Days 17-26)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 17 | **/help** | type:/help, key:enter | Help text displays in chat |
| 18 | **/clear** | type:msg1, key:enter, type:/clear, key:enter | Chat history empty |
| 19 | **/new** | type:/new, key:enter | New conversation message |
| 20 | **/model** | type:/model, key:enter | Shows current model name |
| 21 | **/status** | type:/status, key:enter | Shows session ID, message count |
| 22 | **/diff** | type:/diff, key:enter | Shows git diff or "no changes" |
| 23 | **/exit** | type:/exit, key:enter | App exits |
| 24 | **? help shortcut** | type:?, key:enter | Shows inline help (input empty) |
| 25 | **/compact** | type:/compact, key:enter | Compacts conversation |
| 26 | **/init** | type:/init, key:enter | Project initialization |

### Category 5: Chat History Navigation (Days 27-33)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 27 | **Scroll up - Arrow** | key:up | Chat scrolls up 5 lines |
| 28 | **Scroll down - Arrow** | key:up, key:up, key:down | Scroll position changes |
| 29 | **Page up** | key:page_up | Chat scrolls up 20 lines |
| 30 | **Page down** | key:page_up, key:page_down | Returns to previous position |
| 31 | **Home - scroll top** | key:home | Scrolls to oldest message |
| 32 | **End - scroll bottom** | key:home, key:end | Scrolls to newest message |
| 33 | **Auto-scroll on new msg** | key:home, type:new msg, key:enter | Scrolls to show new message |

### Category 6: Session Management (Days 34-42)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 34 | **Prefix mode enter** | key:ctrl+b | Status shows "[Ctrl+B] c:new n:next..." |
| 35 | **New session** | key:ctrl+b, key:c | New tab created, chat empty |
| 36 | **Next session** | key:ctrl+b, key:c, key:ctrl+b, key:n | Cycles to next tab |
| 37 | **Previous session** | key:ctrl+b, key:c, key:ctrl+b, key:p | Cycles to previous tab |
| 38 | **Switch by number 1** | key:ctrl+b, key:1 | Switches to tab 1 |
| 39 | **Switch by number 2** | key:ctrl+b, key:c, key:ctrl+b, key:2 | Switches to tab 2 |
| 40 | **Prefix timeout** | key:ctrl+b, sleep:2000 | Prefix mode exits |
| 41 | **Prefix cancel** | key:ctrl+b, key:q | Prefix exits, no action |
| 42 | **Session persistence** | create session, restart app | Session still exists |

### Category 7: AI Interaction (Days 43-50)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 43 | **Send to AI** | type:say hello, key:enter | Loading indicator, AI responds |
| 44 | **Cancel AI - Escape** | type:long task, key:enter, key:escape | "Interrupted" message |
| 45 | **Queue while busy** | type:q1, key:enter, type:q2, key:enter | q2 queued (gray), processed after q1 |
| 46 | **Streaming display** | type:count to 5, key:enter | Tokens stream in incrementally |
| 47 | **Tool call display** | type:read package.json, key:enter | Tool call shown, result appears |
| 48 | **Error handling** | (trigger API error) | Error message displays |
| 49 | **Demo mode** | (no API key) | "Demo mode" response |
| 50 | **Long response scroll** | type:write essay, key:enter | Auto-scrolls as text streams |

### Category 8: External Editor (Days 51-53)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 51 | **Open editor** | key:ctrl+e | External editor opens |
| 52 | **Submit from editor** | key:ctrl+e, (save "multi\nline") | Multi-line message sent |
| 53 | **Cancel editor** | key:ctrl+e, (exit without save) | No message sent |

### Category 9: Screen Management (Days 54-58)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 54 | **Redraw - Ctrl+L** | key:ctrl+l | Screen redraws cleanly |
| 55 | **Terminal resize** | (resize terminal) | Layout adapts |
| 56 | **Minimum size** | (resize to 40x10) | Graceful degradation |
| 57 | **Large terminal** | (resize to 200x60) | Uses space appropriately |
| 58 | **Unicode rendering** | type:こんにちは 🎉, key:enter | Renders correctly |

### Category 10: Mouse Interaction (Days 59-65)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 59 | **Click in input** | click:5,bottom-2 | Cursor positions in input |
| 60 | **Scroll wheel up** | scroll:up,5 | Chat scrolls up |
| 61 | **Scroll wheel down** | scroll:down,5 | Chat scrolls down |
| 62 | **Text selection start** | drag:10,5,30,5 | Text highlighted |
| 63 | **Copy selection** | drag:10,5,30,5, key:ctrl+c | Text in clipboard |
| 64 | **Click URL** | (click on URL in chat) | URL opens (or copies) |
| 65 | **Double-click word** | doubleclick:15,10 | Word selected |

### Category 11: Markdown Rendering (Days 66-72)

| Day | Feature | Expected Display |
|-----|---------|------------------|
| 66 | **Code blocks** | Syntax highlighted, bordered |
| 67 | **Inline code** | Highlighted background |
| 68 | **Headings** | Bold, colored |
| 69 | **Lists** | Proper indentation, bullets |
| 70 | **Links** | Underlined, colored |
| 71 | **Bold/italic** | Styled appropriately |
| 72 | **Blockquotes** | Indented, quoted style |

### Category 12: Status Bar & Header (Days 73-78)

| Day | Feature | Expected |
|-----|---------|----------|
| 73 | **Header display** | Shows logo, session name |
| 74 | **Status bar shortcuts** | Shows key hints |
| 75 | **Loading indicator** | Spinner during AI call |
| 76 | **Model indicator** | Shows current model |
| 77 | **Token count** | Shows usage after response |
| 78 | **Error status** | Shows error state |

### Category 13: Help Overlay (Days 79-82)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 79 | **Show help** | key:? (empty input) | Help overlay appears |
| 80 | **Dismiss help** | key:?, key:escape | Help closes |
| 81 | **Help content** | key:? | All shortcuts listed |
| 82 | **Scroll help** | key:?, key:down | Help content scrolls |

### Category 14: Command Popup (Days 83-88)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 83 | **Popup appears** | type:/ | Popup with commands |
| 84 | **Filter commands** | type:/ex | Shows only /exit |
| 85 | **Navigate down** | type:/, key:down | Selection moves |
| 86 | **Navigate up** | type:/, key:down, key:up | Selection moves back |
| 87 | **Select with enter** | type:/, key:down, key:enter | Command executed |
| 88 | **Close with escape** | type:/, key:escape | Popup closes |

### Category 15: Input History (Days 89-92)

| Day | Feature | Keystrokes | Expected |
|-----|---------|------------|----------|
| 89 | **History up** | type:first, key:enter, type:second, key:enter, key:up | Shows "second" |
| 90 | **History down** | key:up, key:up, key:down | Shows "first" |
| 91 | **History wrap** | key:up (many times) | Stops at oldest |
| 92 | **History edit** | key:up, type: edited | Shows edited version |

### Category 16: Edge Cases & Robustness (Days 93-100)

| Day | Feature | Test |
|-----|---------|------|
| 93 | **Empty submit** | key:enter (empty input) | Nothing happens |
| 94 | **Very long input** | type:(10KB text), key:enter | Handles gracefully |
| 95 | **Rapid key spam** | (100 keys fast) | No crash, handles all |
| 96 | **Concurrent events** | (resize during scroll) | No race conditions |
| 97 | **Memory stability** | (1000 messages) | No memory leak |
| 98 | **Special chars** | type:\x00\x1b[0m | Sanitized/escaped |
| 99 | **ANSI in input** | type:^[[31mred | Rendered or escaped |
| 100 | **Full lifecycle** | Start, use features, exit | Clean session |

---

## Snapshot Categories

Each day produces snapshots for visual regression:

```
__snapshots__/
├── day-01-startup.snap
├── day-05-message-sent.snap
├── day-17-help-displayed.snap
├── day-34-prefix-mode.snap
├── day-43-ai-loading.snap
├── day-66-code-block.snap
└── ...
```

## Priority Tiers

### P0 - Critical Path (Must Pass)
Days: 01, 02, 03, 04, 05, 17, 27, 43, 100

### P1 - Core Features
Days: 06-16, 18-26, 28-42, 44-50

### P2 - Enhanced UX  
Days: 51-65, 79-92

### P3 - Edge Cases
Days: 66-78, 93-99

## Snapshot Format

Snapshots stored as `.snap` files with optional ANSI codes:

```
# __snapshots__/navigation-down.snap
┌──────────────────────────────────────┐
│  Agent Status                        │
├──────────────────────────────────────┤
│  ○ Item 1                            │
│  ○ Item 2                            │
│  ○ Item 3                            │
│  ▶ Item 4  ← selected                │
│  ○ Item 5                            │
└──────────────────────────────────────┘
```

## Trade-offs

| Aspect | Benefit | Cost |
|--------|---------|------|
| Real terminal | True E2E, catches rendering bugs | Requires tmux on CI |
| Snapshots | Visual regression detection | Snapshot maintenance |
| AoC structure | Clear organization, easy onboarding | More files per test |
| Keystrokes DSL | Declarative, readable | Extra parsing layer |

## Dependencies

Required in CI:
- `tmux` (system package)
- `tui-tester` (npm/bun package)
- Zig build of TUI binary

## References

- [tui-tester](https://github.com/luxquant/tui-tester) - tmux-backed testing
- [microsoft/tui-test](https://github.com/microsoft/tui-test) - xterm.js approach
- Reference library: `reference/tui-tester/`
