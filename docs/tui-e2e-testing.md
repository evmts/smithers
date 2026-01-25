# TUI E2E Testing Framework (AoC-Style)

> Advent-of-Code style E2E evals for terminal UI using microsoft/tui-test

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     TUI E2E Test Runner                         │
├─────────────────────────────────────────────────────────────────┤
│ test/e2e/                                                       │
│ ├── day-01/                    # Day/challenge structure        │
│ │   ├── input.txt              # Scenario description           │
│ │   ├── __snapshots__/         # Expected screen snapshots      │
│ │   └── solution.test.ts       # Test implementation            │
│ ├── day-02/                                                     │
│ │   └── ...                                                     │
│ ├── helpers/                   # Shared test utilities          │
│ │   └── smithers.ts            # Smithers-specific helpers      │
│ └── tui-test.config.ts         # Test configuration             │
└─────────────────────────────────────────────────────────────────┘
```

## Why microsoft/tui-test

| Feature | Benefit |
|---------|---------|
| xterm.js backend | Same terminal emulator as VS Code |
| Cross-platform | macOS, Linux, Windows |
| No tmux dependency | Just Node.js |
| Rich tracing | Replay terminal sessions |
| Playwright-style API | Familiar `expect().toBeVisible()` |
| Multi-shell | bash, zsh, fish, powershell, cmd |

## Core APIs

### Terminal Fixture

```typescript
import { test, expect, Shell } from '@microsoft/tui-test';

// Configure for our TUI binary
test.use({ 
  program: { file: './zig-out/bin/smithers-tui' },
  rows: 40,
  columns: 120 
});

test('startup shows logo', async ({ terminal }) => {
  await expect(terminal.getByText('Smithers')).toBeVisible();
});
```

### Key Operations

| Operation | API | Example |
|-----------|-----|---------|
| Write text | `terminal.write('hello')` | Type without submit |
| Submit text | `terminal.submit('hello')` | Type + Enter |
| Arrow up | `terminal.keyUp(n)` | Press ↑ n times |
| Arrow down | `terminal.keyDown(n)` | Press ↓ n times |
| Escape | `terminal.keyEscape()` | Press Esc |
| Backspace | `terminal.keyBackspace(n)` | Delete n chars |
| Ctrl+C | `terminal.keyCtrlC()` | Interrupt |
| Ctrl+D | `terminal.keyCtrlD()` | EOF |
| Resize | `terminal.resize(cols, rows)` | Change size |

### Assertions

```typescript
// Text visible anywhere in terminal
await expect(terminal.getByText('Welcome')).toBeVisible();

// Regex pattern matching
await expect(terminal.getByText(/Session: \d+/)).toBeVisible();

// Not visible
await expect(terminal.getByText('error')).not.toBeVisible();

// Full buffer search (not just visible area)
await expect(terminal.getByText('old message', { full: true })).toBeVisible();

// Cursor position
expect(terminal.getCursor().x).toBe(5);
expect(terminal.getCursor().y).toBe(0);

// Snapshot
await expect(terminal).toMatchSnapshot();
```

### Helper Functions

```typescript
// test/e2e/helpers/smithers.ts

import { Terminal } from '@microsoft/tui-test';

export async function waitForReady(terminal: Terminal) {
  await terminal.getByText('❯').toBeVisible();
}

export async function sendSlashCommand(terminal: Terminal, cmd: string) {
  terminal.submit(`/${cmd}`);
}

export async function ctrlB(terminal: Terminal, key: string) {
  terminal.write('\x02'); // Ctrl+B
  await new Promise(r => setTimeout(r, 100));
  terminal.write(key);
}

export async function sendCtrlKey(terminal: Terminal, key: string) {
  const code = key.charCodeAt(0) - 96; // 'a' -> 1, 'b' -> 2, etc.
  terminal.write(String.fromCharCode(code));
}
```

## Configuration

```typescript
// test/e2e/tui-test.config.ts
import { defineConfig } from '@microsoft/tui-test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30000,
  retries: 2,
  trace: process.env.CI ? true : false,
  
  // Default terminal options
  use: {
    program: { file: './zig-out/bin/smithers-tui' },
    rows: 40,
    columns: 120,
  },
});
```

## Day Structure

### day-01/solution.test.ts
```typescript
import { test, expect } from '@microsoft/tui-test';

test.use({ program: { file: './zig-out/bin/smithers-tui' } });

test.describe('Day 01: Startup', () => {
  test('renders logo and input', async ({ terminal }) => {
    // Wait for TUI to initialize
    await expect(terminal.getByText('Smithers')).toBeVisible();
    await expect(terminal.getByText('❯')).toBeVisible();
    
    // Take snapshot
    await expect(terminal).toMatchSnapshot();
  });
});
```

### day-05/solution.test.ts
```typescript
import { test, expect } from '@microsoft/tui-test';

test.use({ program: { file: './zig-out/bin/smithers-tui' } });

test.describe('Day 05: Submit message', () => {
  test('message appears in chat after enter', async ({ terminal }) => {
    await expect(terminal.getByText('❯')).toBeVisible();
    
    terminal.write('hello world');
    await expect(terminal.getByText('hello world')).toBeVisible();
    
    terminal.submit();
    await expect(terminal.getByText(/user.*hello world/i)).toBeVisible();
  });
});
```

### day-34/solution.test.ts
```typescript
import { test, expect } from '@microsoft/tui-test';

test.use({ program: { file: './zig-out/bin/smithers-tui' } });

test.describe('Day 34: Session prefix mode', () => {
  test('Ctrl+B shows prefix hints', async ({ terminal }) => {
    await expect(terminal.getByText('❯')).toBeVisible();
    
    // Send Ctrl+B
    terminal.write('\x02');
    
    await expect(terminal.getByText('[Ctrl+B]')).toBeVisible();
    await expect(terminal.getByText('c:new')).toBeVisible();
    await expect(terminal.getByText('n:next')).toBeVisible();
  });
  
  test('Ctrl+B c creates new session', async ({ terminal }) => {
    await expect(terminal.getByText('❯')).toBeVisible();
    
    terminal.write('\x02'); // Ctrl+B
    await expect(terminal.getByText('[Ctrl+B]')).toBeVisible();
    
    terminal.write('c');
    // New session should have empty chat
    await expect(terminal.getByText('tab-')).toBeVisible();
  });
});
```

## Running Tests

```bash
# Install tui-test
bun add -D @microsoft/tui-test

# Build TUI first
zig build

# Run all E2E tests
npx tui-test

# Run specific day
npx tui-test test/e2e/day-01/

# Update snapshots
npx tui-test --update-snapshots

# Enable traces for debugging
npx tui-test --trace

# View trace after failure
npx tui-test show-trace tui-traces/<trace-file>
```

## CI/CD Integration

```yaml
# .github/workflows/e2e.yml
name: TUI E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: goto-bus-stop/setup-zig@v2
        with:
          version: 0.14.0
          
      - uses: oven-sh/setup-bun@v2
      
      - name: Build TUI
        run: zig build -Doptimize=ReleaseFast
        
      - name: Install dependencies
        run: bun install
        
      - name: Run E2E tests
        run: npx tui-test --trace
        
      - name: Upload traces on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: tui-traces-${{ matrix.os }}
          path: tui-traces/
```

## Complete Test Matrix (100% Feature Coverage)

### Category 1: Application Lifecycle (Days 01-03)

| Day | Feature | Test |
|-----|---------|------|
| 01 | **Startup** | Logo renders, input ready, status bar shows |
| 02 | **Exit - /exit** | `terminal.submit('/exit')` → process exits |
| 03 | **Exit - Ctrl+D** | `terminal.keyCtrlD()` → exits when input empty |
| 03b | **Exit - Double Ctrl+C** | Two `keyCtrlC()` → exits |
| 03c | **Suspend - Ctrl+Z** | `write('\x1a')` → SIGTSTP |

### Category 2: Input Field (Days 04-12)

| Day | Feature | Test |
|-----|---------|------|
| 04 | **Text entry** | `write('hello')` → visible |
| 05 | **Submit message** | `submit('test')` → in chat |
| 06 | **Clear input - Ctrl+C** | `write('x'), keyCtrlC()` → input cleared |
| 07 | **Line start - Ctrl+A** | `write('end'), write('\x01'), write('start')` → "startend" |
| 08 | **Kill line - Ctrl+K** | `write('keep'), write('\x01'), keyRight(4), write('\x0b')` → "keep" |
| 09 | **Kill all - Ctrl+U** | `write('delete'), write('\x15')` → empty |
| 10 | **Word nav - Alt+B** | `write('one two'), write('\x1bb')` → cursor at "two" |
| 11 | **Word delete - Ctrl+W** | `write('keep delete'), write('\x17')` → "keep " |
| 12 | **Undo - Ctrl+Z** | `write('hi'), write('\x15'), write('\x1a')` → "hi" restored |

### Category 3: Command Autocomplete (Days 13-16)

| Day | Feature | Test |
|-----|---------|------|
| 13 | **Autocomplete trigger** | `write('/')` → popup visible |
| 14 | **Autocomplete tab** | `write('/h'), write('\t')` → "/help" |
| 15 | **Autocomplete submit** | `write('/he'), submit()` → help displays |
| 16 | **Popup dismiss** | `write('/'), keyEscape()` → popup gone |

### Category 4: Slash Commands (Days 17-26)

| Day | Feature | Test |
|-----|---------|------|
| 17 | **/help** | `submit('/help')` → help text visible |
| 18 | **/clear** | `submit('msg'), submit('/clear')` → chat empty |
| 19 | **/new** | `submit('/new')` → "new conversation" |
| 20 | **/model** | `submit('/model')` → model name visible |
| 21 | **/status** | `submit('/status')` → session info visible |
| 22 | **/diff** | `submit('/diff')` → git diff or "no changes" |
| 23 | **/exit** | `submit('/exit')` → process exits |
| 24 | **? help** | `submit('?')` → inline help (empty input) |
| 25 | **/compact** | `submit('/compact')` → compacts conversation |
| 26 | **/init** | `submit('/init')` → project init |

### Category 5: Chat Navigation (Days 27-33)

| Day | Feature | Test |
|-----|---------|------|
| 27 | **Scroll up** | `keyUp()` → scroll offset changes |
| 28 | **Scroll down** | `keyUp(), keyDown()` → returns |
| 29 | **Page up** | `write('\x1b[5~')` → scroll 20 lines |
| 30 | **Page down** | `write('\x1b[6~')` → reverse |
| 31 | **Home** | `write('\x1b[H')` → oldest message |
| 32 | **End** | `write('\x1b[F')` → newest message |
| 33 | **Auto-scroll** | New message → scrolls to bottom |

### Category 6: Session Management (Days 34-42)

| Day | Feature | Test |
|-----|---------|------|
| 34 | **Prefix mode** | `write('\x02')` → "[Ctrl+B]" visible |
| 35 | **New session** | `write('\x02'), write('c')` → new tab |
| 36 | **Next session** | `write('\x02'), write('n')` → cycles |
| 37 | **Prev session** | `write('\x02'), write('p')` → cycles back |
| 38 | **Switch tab 1** | `write('\x02'), write('1')` → tab 1 |
| 39 | **Switch tab 2** | `write('\x02'), write('2')` → tab 2 |
| 40 | **Prefix timeout** | `write('\x02'), sleep(2000)` → exits prefix |
| 41 | **Prefix cancel** | `write('\x02'), write('q')` → no action |
| 42 | **Session persist** | Create, restart, verify session exists |

### Category 7: AI Interaction (Days 43-50)

| Day | Feature | Test |
|-----|---------|------|
| 43 | **Send to AI** | `submit('hello')` → loading, response |
| 44 | **Cancel AI** | `submit('task'), keyEscape()` → "Interrupted" |
| 45 | **Queue while busy** | Submit during loading → queued (gray) |
| 46 | **Streaming** | Response streams incrementally |
| 47 | **Tool call** | `submit('read file')` → tool shown |
| 48 | **Error handling** | API error → error message |
| 49 | **Demo mode** | No API key → demo response |
| 50 | **Long response** | Auto-scrolls during stream |

### Category 8: External Editor (Days 51-53)

| Day | Feature | Test |
|-----|---------|------|
| 51 | **Open editor** | `write('\x05')` (Ctrl+E) → editor opens |
| 52 | **Submit from editor** | Save multi-line → message sent |
| 53 | **Cancel editor** | Exit without save → no message |

### Category 9: Screen Management (Days 54-58)

| Day | Feature | Test |
|-----|---------|------|
| 54 | **Redraw** | `write('\x0c')` (Ctrl+L) → clean redraw |
| 55 | **Resize** | `terminal.resize(80, 20)` → adapts |
| 56 | **Min size** | `resize(40, 10)` → graceful |
| 57 | **Large size** | `resize(200, 60)` → uses space |
| 58 | **Unicode** | `submit('こんにちは 🎉')` → renders |

### Category 10: Mouse Interaction (Days 59-65)

| Day | Feature | Test |
|-----|---------|------|
| 59-65 | Mouse tests | (Mouse not yet supported in tui-test) |

### Category 11: Markdown Rendering (Days 66-72)

| Day | Feature | Snapshot Test |
|-----|---------|---------------|
| 66 | **Code blocks** | Bordered, highlighted |
| 67 | **Inline code** | Background color |
| 68 | **Headings** | Bold, colored |
| 69 | **Lists** | Bullets, indentation |
| 70 | **Links** | Underlined |
| 71 | **Bold/italic** | Styled |
| 72 | **Blockquotes** | Quoted style |

### Category 12: Status Bar & Header (Days 73-78)

| Day | Feature | Test |
|-----|---------|------|
| 73 | **Header** | Logo, session name visible |
| 74 | **Status hints** | Key shortcuts visible |
| 75 | **Loading** | Spinner during AI call |
| 76 | **Model name** | Current model shown |
| 77 | **Token count** | Usage after response |
| 78 | **Error status** | Error state shown |

### Category 13: Help Overlay (Days 79-82)

| Day | Feature | Test |
|-----|---------|------|
| 79 | **Show help** | `?` (empty input) → help visible |
| 80 | **Dismiss help** | `keyEscape()` → help gone |
| 81 | **Help content** | All shortcuts listed |
| 82 | **Scroll help** | `keyDown()` → scrolls |

### Category 14: Command Popup (Days 83-88)

| Day | Feature | Test |
|-----|---------|------|
| 83 | **Popup appears** | `write('/')` → popup |
| 84 | **Filter** | `write('/ex')` → only /exit |
| 85 | **Navigate down** | `keyDown()` → selection moves |
| 86 | **Navigate up** | `keyUp()` → selection moves |
| 87 | **Select** | `keyDown(), submit()` → executed |
| 88 | **Close** | `keyEscape()` → popup closes |

### Category 15: Input History (Days 89-92)

| Day | Feature | Test |
|-----|---------|------|
| 89 | **History up** | `submit('a'), submit('b'), keyUp()` → "b" |
| 90 | **History down** | `keyUp(), keyUp(), keyDown()` → "a" |
| 91 | **History wrap** | Many `keyUp()` → stops at oldest |
| 92 | **History edit** | `keyUp(), write('x')` → edited |

### Category 16: Edge Cases (Days 93-100)

| Day | Feature | Test |
|-----|---------|------|
| 93 | **Empty submit** | `submit()` → nothing |
| 94 | **Long input** | 10KB text → handles |
| 95 | **Rapid keys** | 100 keys fast → no crash |
| 96 | **Concurrent** | Resize during scroll → stable |
| 97 | **Memory** | 1000 messages → no leak |
| 98 | **Special chars** | `\x00\x1b` → sanitized |
| 99 | **ANSI in input** | Escaped properly |
| 100 | **Full lifecycle** | Start → use → exit → clean |

---

## Priority Tiers

### P0 - Critical Path (Must Pass)
Days: 01, 02, 03, 04, 05, 17, 27, 43, 100

### P1 - Core Features
Days: 06-16, 18-26, 28-42, 44-50

### P2 - Enhanced UX  
Days: 51-58, 79-92 (skip 59-65 until mouse support)

### P3 - Edge Cases
Days: 66-78, 93-99

## Traces

Enable traces for debugging test failures:

```bash
npx tui-test --trace
npx tui-test show-trace tui-traces/test-name-xxxxx/
```

Traces contain:
- Full terminal buffer history
- Timing information
- All input/output events
- Can replay in browser

## References

- [microsoft/tui-test](https://github.com/microsoft/tui-test) - Testing framework (108 ⭐)
- Reference library: `reference/tui-test/`
- [xterm.js](https://xtermjs.org/) - Terminal emulator backend
