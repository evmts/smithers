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

## Example Days

| Day | Challenge | Tests |
|-----|-----------|-------|
| 01 | Basic navigation | Arrow keys, j/k, selection |
| 02 | Input handling | Text entry, backspace, enter |
| 03 | View switching | Tab, mode switching |
| 04 | Scrolling | Page up/down, scroll wheel |
| 05 | Mouse interaction | Click, drag selection |
| 06 | Search/filter | Fuzzy finding, filtering |
| 07 | Error states | Error display, recovery |
| 08 | Resize handling | Terminal resize events |
| 09 | Keyboard shortcuts | Ctrl+*, Alt+*, Meta+* |
| 10 | Multi-pane layout | Focus switching, pane resize |

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
