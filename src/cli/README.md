# Smithers CLI

Command-line interface for running Smithers agents. Supports TSX, JSX, and MDX agent files.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Smithers CLI                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          Entry Point                                 │    │
│  │                          index.ts                                    │    │
│  │                                                                      │    │
│  │   smithers run <file>   ───▶  Run agent with approval workflow      │    │
│  │   smithers plan <file>  ───▶  Preview XML plan only                 │    │
│  │   smithers init <dir>   ───▶  Scaffold new project                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                     │                                        │
│              ┌──────────────────────┼──────────────────────┐                │
│              ▼                      ▼                      ▼                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   loader.ts      │  │   config.ts      │  │   display.ts     │          │
│  │                  │  │                  │  │                  │          │
│  │  Load .tsx/.mdx  │  │  Load config     │  │  Rich terminal   │          │
│  │  agent files     │  │  from files      │  │  output          │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          commands/                                   │    │
│  │                                                                      │    │
│  │  run.ts   ───▶  Load agent, display plan, execute, show results     │    │
│  │  plan.ts  ───▶  Load agent, display plan (no execution)             │    │
│  │  init.ts  ───▶  Create project scaffolding                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Files

- **`index.ts`** - CLI entry point with Commander.js setup
- **`loader.ts`** - File loading for TSX/JSX/MDX agent files
- **`config.ts`** - Configuration file loading and validation
- **`display.ts`** - Terminal display utilities
- **`prompt.ts`** - User prompting utilities
- **`commands/`** - Individual command implementations

## Commands

### `smithers run <file>`

Load and execute an agent file.

```bash
smithers run agent.tsx
smithers run agent.mdx --props '{"topic": "AI"}'
smithers run agent.tsx --yes                      # Auto-approve
smithers run agent.tsx --verbose                  # Debug output
```

**Options:**
| Flag | Description |
|------|-------------|
| `-p, --props <json>` | Props to pass to the component |
| `-y, --yes` | Auto-approve execution |
| `-v, --verbose` | Show detailed execution logs |
| `--max-frames <n>` | Maximum execution iterations |
| `--timeout <ms>` | Execution timeout |
| `-o, --output <file>` | Write final output to file |

### `smithers plan <file>`

Preview the execution plan without running it.

```bash
smithers plan agent.tsx
smithers plan agent.mdx -o plan.xml
```

### `smithers init [directory]`

Scaffold a new Smithers project.

```bash
smithers init my-agent
smithers init . --template research
```

## File Loading

The loader supports multiple file formats:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           File Loading Flow                                  │
│                                                                              │
│   Input File                  Loader                    Output               │
│                                                                              │
│   agent.tsx    ───▶  loadTsxFile()   ───▶  ReactElement                     │
│   agent.jsx    ───▶  (Bun import)                                           │
│   agent.ts                                                                   │
│   agent.js                                                                   │
│                                                                              │
│   agent.mdx    ───▶  loadMdxFile()   ───▶  ReactElement                     │
│                      (@mdx-js/mdx)                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### TSX/JSX Loading

Uses Bun's native import to load TypeScript/JavaScript files:

```typescript
// agent.tsx
export default (
  <Claude>
    Hello, world!
  </Claude>
)

// or as a component
export default function Agent() {
  return <Claude>Hello, world!</Claude>
}
```

### MDX Loading

Uses `@mdx-js/mdx` to evaluate MDX files with Smithers components:

```mdx
---
name: My Agent
---

import { webSearch } from './tools'

# Research Agent

<Claude tools={[webSearch]}>
  <Phase name="research">
    Research the topic: {props.topic}
  </Phase>
</Claude>
```

### Error Handling

Rich error messages with code frames and suggestions:

```
Syntax error in TSX/JSX file: Unexpected token

  Location: agent.tsx:10:5

  >  8 | function Agent() {
  >  9 |   return (
  > 10 |     <Claude>
     |     ^
  > 11 |       {incomplete
  > 12 |     </Claude>

  Suggestions:
    - Check for missing or extra brackets, parentheses, or semicolons
    - Ensure JSX syntax is correct (closing tags, proper nesting)
```

## Configuration

### Config File Discovery

Searches for config files in order:

1. `.smithersrc`
2. `.smithersrc.json`
3. `smithers.config.js`
4. `smithers.config.mjs`
5. `smithers.config.ts`

### Config Options

```typescript
interface SmithersConfig {
  model?: string          // Claude model to use
  maxTokens?: number      // Max tokens per response
  maxFrames?: number      // Max execution iterations
  timeout?: number        // Timeout per frame (seconds)
  autoApprove?: boolean   // Skip approval prompts
  mockMode?: boolean      // Enable mock mode (no API calls)
  verbose?: boolean       // Enable verbose logging
}
```

### Example Configs

**JSON (`.smithersrc`):**
```json
{
  "model": "claude-sonnet-4-20250514",
  "maxTokens": 4096,
  "autoApprove": false
}
```

**TypeScript (`smithers.config.ts`):**
```typescript
import { defineConfig } from 'smithers'

export default defineConfig({
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  verbose: true
})
```

### Option Precedence

```
CLI flags  >  Config file  >  Defaults
```

## Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        smithers run agent.tsx                                │
│                                                                              │
│   1. Load config file (if exists)                                           │
│   2. Parse CLI options                                                       │
│   3. Merge options (CLI > config > defaults)                                │
│   4. Load agent file                                                        │
│      ├─ .tsx/.jsx: Bun import                                               │
│      └─ .mdx: MDX evaluate                                                  │
│   5. Extract React element                                                   │
│   6. Render to XML plan                                                      │
│   7. Display plan in terminal                                               │
│   8. Prompt for approval (unless --yes)                                     │
│   9. Execute plan (Ralph Wiggum loop)                                       │
│  10. Display results                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Programmatic API

The loader and config modules can be used programmatically:

```typescript
import { loadAgentFile, loadConfig, mergeOptions } from 'smithers'

// Load an agent file
const element = await loadAgentFile('./agent.tsx')

// Load config
const config = await loadConfig()

// Merge with custom options
const options = mergeOptions({ verbose: true }, config)
```
