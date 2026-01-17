# Smithers

[![npm version](https://img.shields.io/npm/v/smithers.svg)](https://www.npmjs.com/package/smithers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black.svg)](https://bun.sh/)

**Declarative JSX framework for building AI agent orchestration workflows.**

I use Smithers for both long-term (weeks) agentic work, as well as one-off scripts.

<!-- TODO: Add GIF demo -->
![Smithers Demo](https://via.placeholder.com/800x400?text=Demo+GIF+Coming+Soon)

---

## Table of Contents

- [Why](#why)
- [Installation](#installation)
- [Dependencies](#dependencies)
- [Usage](#usage)
- [Recipes](#recipes)
- [Features](#features)
  - [Claude Component](#claude-component)
  - [Ralph Loop Controller](#ralph-loop-controller)
  - [Structured Output with Zod](#structured-output-with-zod)
  - [MCP Tool Integration](#mcp-tool-integration)
  - [Smithers Subagent](#smithers-subagent)
  - [Git/JJ VCS Integration](#gitjj-vcs-integration)
  - [Database State Management](#database-state-management)
- [Contributing](#contributing)

---

## Why

I wanted a tool that allows me to:

- **Write agent workflows as JSX** - because declarative composition is easier to reason about than imperative chains
- **Let Claude Code write the orchestration for me** - I describe what I want, and my agent builds the workflow
- **Persist state across sessions** - pick up where I left off, even days later
- **Mix short scripts with long-running workflows** - same syntax for a quick task or a week-long project
- **See what my agents are doing** - full observability with database logging and reports
- **Use reactive primitives** - Solid.js signals mean my workflows respond to state changes automatically
- **Compose complex behaviors from simple components** - loops, phases, steps, and validation all snap together
- **Keep everything in version control** - workflows are just TypeScript files

---

## Installation

### With Claude Code (Recommended)

Add to your project's `CLAUDE.md`:

```markdown
This project uses Smithers for AI orchestration.
When the user asks for agentic workflows, generate Smithers scripts.

See the Smithers documentation at: ./node_modules/smithers/README.md
```

Then install:

```bash
bun add smithers
```

### npm / yarn / pnpm

```bash
npm install smithers
# or
yarn add smithers
# or
pnpm add smithers
```

### From Source

```bash
git clone https://github.com/yourusername/smithers.git
cd smithers
bun install
```

---

## Dependencies

### Required

- **[Bun](https://bun.sh/)** - JavaScript runtime (v1.0+)
- **[Claude Code](https://claude.ai/code)** - CLI for Claude (`npm install -g @anthropic-ai/claude-code`)

### Optional

- **[Gemini CLI](https://github.com/google/generative-ai-cli)** - For Gemini model support (coming soon)
- **[Codex CLI](https://github.com/openai/codex)** - For OpenAI model support (coming soon)
- **[jj (Jujutsu)](https://github.com/martinvonz/jj)** - Alternative VCS with better snapshot support

---

## Usage

### Let Your Agent Write Smithers

**You don't have to write Smithers yourself.** Tell your agent what you want, and it generates the workflow:

```
User: "Create a workflow that monitors my CI, fixes failures automatically, and escalates after 3 failed attempts"

Claude: *generates ci-recovery.tsx*
```

Your agent understands the component model and generates correct, working orchestration scripts.

### State Persistence

All Smithers state is saved in a **PGlite database** on your system that can be easily inspected:

```bash
# View execution history
smithers-orchestrator db executions

# View state for a specific execution
smithers-orchestrator db state --execution-id abc123

# Query the database directly
smithers-orchestrator db query "SELECT * FROM agents ORDER BY started_at DESC LIMIT 10"
```

### Basic Example

```tsx
#!/usr/bin/env bun

import { createSmithersRoot } from 'smithers'
import { createSmithersDB } from 'smithers/smithers-orchestrator/src/db'
import { SmithersProvider } from 'smithers/smithers-orchestrator/src/components/SmithersProvider'
import { Claude } from 'smithers/smithers-orchestrator/src/components/Claude'

const db = await createSmithersDB({ path: '.smithers/my-task' })
const executionId = await db.execution.start('My Task', 'scripts/my-task.tsx')

async function MyWorkflow() {
  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Claude
        model="sonnet"
        maxTurns={10}
        onFinished={(result) => console.log('Done:', result.output)}
      >
        Analyze this codebase and suggest three improvements.
      </Claude>
    </SmithersProvider>
  )
}

const root = createSmithersRoot()
await root.mount(MyWorkflow)
await db.close()
```

Run it:

```bash
bun my-workflow.tsx
```

---

## Recipes

### Multi-Phase Review Workflow

```tsx
async function ReviewWorkflow() {
  const phase = await db.state.get('phase') ?? 'implement'

  return (
    <SmithersProvider db={db} executionId={executionId}>
      <Orchestration globalTimeout={3600000}>
        <Ralph maxIterations={10}>
          {phase === 'implement' && (
            <Phase name="Implementation">
              <Claude
                model="sonnet"
                onFinished={() => db.state.set('phase', 'review')}
              >
                Implement the user authentication feature.
              </Claude>
            </Phase>
          )}

          {phase === 'review' && (
            <Phase name="Code Review">
              <Review
                target={{ type: 'diff', ref: 'main' }}
                criteria={[
                  'No security vulnerabilities',
                  'Tests cover edge cases',
                  'Types are properly defined',
                ]}
                onFinished={(review) => {
                  if (review.approved) {
                    db.state.set('phase', 'complete')
                  } else {
                    db.state.set('phase', 'implement')
                  }
                }}
              />
            </Phase>
          )}
        </Ralph>
      </Orchestration>
    </SmithersProvider>
  )
}
```

### Structured Output with Validation

```tsx
import { z } from 'zod'

const AnalysisSchema = z.object({
  summary: z.string(),
  issues: z.array(z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    file: z.string(),
    description: z.string(),
  })),
  recommendations: z.array(z.string()),
})

<Claude
  model="sonnet"
  schema={AnalysisSchema}
  schemaRetries={2}
  onFinished={(result) => {
    // result.structured is typed!
    for (const issue of result.structured.issues) {
      console.log(`[${issue.severity}] ${issue.file}: ${issue.description}`)
    }
  }}
>
  Analyze this codebase for security issues.
</Claude>
```

### Database Access with MCP

```tsx
<Claude model="sonnet" maxTurns={5}>
  <Sqlite path="./analytics.db">
    The database contains user_events and sessions tables.
    Use this to answer questions about user behavior.
  </Sqlite>

  What are the top 10 most common user actions this week?
</Claude>
```

### Spawning Subagent Workflows

```tsx
<Smithers
  plannerModel="opus"
  executionModel="sonnet"
  onFinished={(result) => console.log(result.output)}
>
  Create a comprehensive test suite for the authentication module.
  Include unit tests, integration tests, and edge cases.
  Set up proper mocking for external dependencies.
</Smithers>
```

---

## Features

### Claude Component

The core agent component that executes Claude with full tool access:

```tsx
<Claude
  model="sonnet"           // opus | sonnet | haiku
  maxTurns={10}            // Limit agentic loops
  permissionMode="acceptEdits"  // Auto-accept file edits
  systemPrompt="You are a senior engineer..."
  allowedTools={['Read', 'Edit', 'Bash']}
  stopConditions={[
    { type: 'token_limit', value: 50000 },
    { type: 'pattern', value: /DONE/i },
  ]}
  onProgress={(msg) => console.log(msg)}
  onFinished={(result) => handleResult(result)}
  onError={(err) => handleError(err)}
>
  Your prompt here
</Claude>
```

### Ralph Loop Controller

Named after Ralph Wiggum's "I'm in danger" catchphrase - controls iterative loops that could run away:

```tsx
<Ralph maxIterations={10} onMaxIterations={() => console.log("I'm in danger!")}>
  {/* Children re-render on each iteration */}
  <Claude onFinished={() => {/* state change triggers next iteration */}}>
    Keep improving until tests pass.
  </Claude>
</Ralph>
```

### Structured Output with Zod

Get typed, validated responses with automatic retry:

```tsx
const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
})

<Claude schema={UserSchema} schemaRetries={2}>
  Extract user info from: John Doe (john@example.com)
</Claude>
// result.structured: { name: string, email: string }
```

### MCP Tool Integration

Give Claude access to external tools via Model Context Protocol:

```tsx
<Claude>
  <Sqlite path="./data.db" readOnly>
    Database schema: users(id, name, email), orders(id, user_id, total)
  </Sqlite>

  Generate a report of top customers by order value.
</Claude>
```

### Smithers Subagent

Spawn a new Smithers instance to plan and execute complex subtasks:

```tsx
<Smithers
  plannerModel="opus"      // Model for planning the script
  executionModel="sonnet"  // Model for agents in the script
  timeout={600000}         // 10 minute timeout
  keepScript               // Save the generated script for debugging
>
  Create a new REST API endpoint with full CRUD operations,
  database migrations, and comprehensive test coverage.
</Smithers>
```

### Git/JJ VCS Integration

First-class version control support:

```tsx
// Git
<Commit message="feat: Add user auth" notes={{ smithers: true }} />

// Jujutsu (jj)
<Snapshot description="Before refactoring" />
<Commit autoDescribe />
```

### Database State Management

Persistent state that survives restarts:

```tsx
// Set state
await db.state.set('phase', 'review', 'code_complete')

// Get state
const phase = await db.state.get('phase')

// Query history
const history = await db.state.getHistory('phase')

// View all state
const all = await db.state.getAll()
```

---

## Contributing

We accept **vibe-coded contributions** as long as you include your original prompt.

### How to Contribute

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes (AI-assisted or not)
4. **Add a git note with your original prompt:**
   ```bash
   git notes add -m "User prompt: Add support for streaming responses"
   ```
5. Commit your changes following our commit format
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Commit Message Format

```
feat: Add streaming response support

Detailed description of changes.

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Development Setup

```bash
git clone https://github.com/yourusername/smithers.git
cd smithers
bun install
bun test
```

---

**Built with Solid.js, powered by Claude.**
