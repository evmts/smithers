# Smithers

[![npm version](https://img.shields.io/npm/v/smithers-orchestrator.svg)](https://www.npmjs.com/package/smithers-orchestrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black.svg)](https://bun.sh/)

**Let your agent write agents.**

React-style orchestration your coding agent can generate, then run safely as durable Ralph loops.

<!-- TODO: Add GIF demo -->

![Smithers Demo](https://via.placeholder.com/800x400?text=Demo+GIF+Coming+Soon)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  React tree  ──▶  Smithers executor  ──▶  Tools + Claude  ──▶  SQLite DB   │
│                                                                             │
│  "React syntax, non-UI renderer"                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Agent-native syntax** - Easy for Claude Code to generate, easy for humans to review
- **Sophisticated loops** - Multi-phase, parallel agents, conditional branches
- **Composable** - Build complex workflows from simple React components

---

## Table of Contents

- [Why Smithers](#why-smithers)
- [Getting Started](#getting-started)
- [Starter Workflows](#starter-workflows)
- [Features](#features)
  - [Claude Component](#claude-component)
  - [Sophisticated Ralph Loops](#sophisticated-ralph-loops)
  - [Structured Output with Zod](#structured-output-with-zod)
  - [MCP Tool Integration](#mcp-tool-integration)
  - [Smithers Subagent](#smithers-subagent)
  - [Git/JJ VCS Integration](#gitjj-vcs-integration)
  - [PhaseRegistry & Step](#phaseregistry--step)
  - [Parallel Execution](#parallel-execution)
  - [Database Persistence](#database-persistence)
- [FAQ](#faq)
- [Contributing](#contributing)

---

## Why Smithers

### The Problem

Simple Ralph loops work great for basic iteration. But as workflows grow complex:
- Multi-phase orchestration becomes hard to manage
- Parallel agents need coordination
- Plans live in prompts, not reviewable code
- Manual orchestration doesn't scale

### The Solution

Smithers uses React's component model + markup-like syntax to define execution plans. This isn't UI - it renders to **execution**.

**One syntax both humans and agents can work with:**
- You can read and review it
- Claude Code can generate it reliably
- Git can version it

**Sophisticated Ralph loops that stay reliable:**
- Multi-phase workflows with parallel agents
- Conditional branches, phases, steps
- Composable components you can reuse
- Persist state and audit history when you need it

---

## Getting Started

### Prerequisites

- **[Bun](https://bun.sh/)** v1.0+ (JavaScript runtime)
- **[Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code)** - `bun install -g @anthropic-ai/claude-code`

### Install

```bash
bun add smithers-orchestrator
```

### Let Claude Write It

**You don't have to write Smithers yourself.** Describe what you want:

```
User: "Create a workflow that monitors my CI, fixes failures automatically,
       and escalates after 3 failed attempts"

Claude: *generates ci-recovery.tsx*
```

### Run It

```bash
bun my-workflow.tsx
```

### Inspect History

```bash
smithers db executions                      # View execution history
smithers db state --execution-id abc123     # Inspect specific run
```

---

## Starter Workflows

### 1. Night Shift: Run Until Tests Pass

Goal: Keep iterating until all tests pass, with incremental commits.

```tsx
#!/usr/bin/env bun
import { createSmithersRoot, createSmithersDB, SmithersProvider, Claude } from "smithers-orchestrator";

const db = await createSmithersDB({ path: ".smithers/night-shift" });
const executionId = await db.execution.start("Night Shift", "night-shift.tsx");

function NightShift() {
  return (
    <SmithersProvider db={db} executionId={executionId} maxIterations={50}>
      <Claude
        model="sonnet"
        onFinished={(result) => {
          if (result.output.includes("All tests pass")) {
            db.state.set("complete", "true");
          }
        }}
      >
        Run tests. If any fail, fix them and commit the fix. Repeat until all tests pass.
      </Claude>
    </SmithersProvider>
  );
}

const root = createSmithersRoot();
await root.mount(NightShift);
await db.close();
```

```bash
bun night-shift.tsx
```

### 2. PRD to Implementation

Goal: Plan, implement, test, produce PR summary.

```tsx
#!/usr/bin/env bun
import { createSmithersRoot, createSmithersDB, SmithersProvider, Phase, Step, Claude } from "smithers-orchestrator";

const db = await createSmithersDB({ path: ".smithers/prd-impl" });
const executionId = await db.execution.start("PRD Implementation", "prd-impl.tsx");

function PRDToImplementation() {
  return (
    <SmithersProvider db={db} executionId={executionId} maxIterations={20}>
      <Phase name="Plan">
        <Step name="analyze-prd">
          <Claude model="sonnet">
            Read PRD.md. Create implementation plan with acceptance criteria.
          </Claude>
        </Step>
      </Phase>

      <Phase name="Implement">
        <Step name="write-code">
          <Claude model="sonnet">
            Implement the plan. Commit after each logical unit of work.
          </Claude>
        </Step>
        <Step name="write-tests">
          <Claude model="sonnet">
            Write tests for the implementation. Ensure all pass.
          </Claude>
        </Step>
      </Phase>

      <Phase name="Summary">
        <Step name="pr-summary">
          <Claude model="sonnet">
            Generate PR summary with what changed and why.
          </Claude>
        </Step>
      </Phase>
    </SmithersProvider>
  );
}

const root = createSmithersRoot();
await root.mount(PRDToImplementation);
await db.close();
```

### 3. Refactor with Checkpoints

Goal: Staged refactoring with checkpoints and rollback capability.

```tsx
#!/usr/bin/env bun
import { createSmithersRoot, createSmithersDB, SmithersProvider, Phase, Step, Claude, Worktree } from "smithers-orchestrator";

const db = await createSmithersDB({ path: ".smithers/refactor" });
const executionId = await db.execution.start("Refactor", "refactor.tsx");

function RefactorWorkflow() {
  return (
    <SmithersProvider db={db} executionId={executionId} maxIterations={30}>
      <Worktree branch="smithers/refactor" cleanup>
        <Phase name="Analyze">
          <Step name="identify-targets">
            <Claude model="sonnet">
              Identify code that needs refactoring. Create a prioritized list.
            </Claude>
          </Step>
        </Phase>

        <Phase name="Refactor">
          <Step name="refactor-code" snapshotBefore commitAfter>
            <Claude model="sonnet">
              Refactor each item. Run tests after each change. Commit if green.
            </Claude>
          </Step>
        </Phase>

        <Phase name="Verify">
          <Step name="final-check">
            <Claude model="sonnet">
              Run full test suite. Document all changes made.
            </Claude>
          </Step>
        </Phase>
      </Worktree>
    </SmithersProvider>
  );
}

const root = createSmithersRoot();
await root.mount(RefactorWorkflow);
await db.close();
```

---

## Features

### Claude Component

The core agent component that executes Claude with full tool access:

```tsx
<Claude
  model="sonnet" // opus | sonnet | haiku
  maxTurns={10} // Limit agentic loops
  permissionMode="acceptEdits" // Auto-accept file edits
  systemPrompt="You are a senior engineer..."
  allowedTools={["Read", "Edit", "Bash"]}
  stopConditions={[
    { type: "token_limit", value: 50000 },
    { type: "pattern", value: /DONE/i },
  ]}
  onProgress={(msg) => console.log(msg)}
  onFinished={(result) => handleResult(result)}
  onError={(err) => handleError(err)}
>
  Your prompt here
</Claude>
```

### Sophisticated Ralph Loops

Ralphing = continuous agent iteration with verification gates. Smithers lets you build **complex** Ralph loops with structure:

```tsx
<SmithersProvider db={db} executionId={executionId} maxIterations={50}>
  <Phase name="Implement">
    <Parallel>
      <Claude model="sonnet">Fix auth module</Claude>
      <Claude model="sonnet">Fix database module</Claude>
    </Parallel>
  </Phase>

  <Phase name="Verify">
    <Claude
      model="sonnet"
      onFinished={(result) => {
        if (result.output.includes("All tests pass")) {
          db.state.set("complete", "true");
        }
      }}
    >
      Run tests. If failures, iterate.
    </Claude>
  </Phase>
</SmithersProvider>
```

**What Smithers adds:**
- Multi-phase workflows with conditional transitions
- Parallel agent execution with coordination
- Composable, reusable components
- Optional persistence for long-running workflows

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

### AI SDK Tool Format

Define tools with Zod schemas and pass them to Claude:

```tsx
import { z } from "zod";
import { createSmithersTool } from "smithers-orchestrator/tools";

const reportTool = createSmithersTool({
  name: "report",
  description: "Report progress to the orchestrator",
  inputSchema: z.object({
    message: z.string(),
    severity: z.enum(["info", "warning", "error"]).optional(),
  }),
  execute: async ({ message, severity }, { db }) => {
    await db.vcs.addReport({
      type: "progress",
      title: "Agent Report",
      content: message,
      severity: severity ?? "info",
    });
    return { success: true };
  },
});

<Claude tools={[reportTool]}>
  Report progress as you go.
</Claude>
```

### Smithers Subagent

Spawn a new Smithers instance to plan and execute complex subtasks:

```tsx
<Smithers
  plannerModel="opus" // Model for planning the script
  executionModel="sonnet" // Model for agents in the script
  timeout={600000} // 10 minute timeout
  keepScript // Save the generated script for debugging
>
  Create a new REST API endpoint with full CRUD operations, database migrations,
  and comprehensive test coverage.
</Smithers>
```

### Worktree

Run agents in isolated git worktrees:

```tsx
<Worktree branch="feature-auth" cleanup>
  <Claude>Implement user authentication</Claude>
</Worktree>
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

### Orchestration Lifecycle

Global timeout and completion logic for workflows:

```tsx
<Orchestration
  globalTimeout={3600000} // 1 hour max
  onComplete={() => console.log("Workflow finished")}
  onTimeout={() => console.log("Workflow timed out")}
>
  {/* Your workflow components */}
</Orchestration>
```

### PhaseRegistry & Step

Manage multi-phase sequential execution:

```tsx
<PhaseRegistry>
  <Phase name="implement">
    <Step name="write-code" snapshotBefore commitAfter commitMessage="feat: Implementation">
      <Claude>Implement the feature</Claude>
    </Step>
    <Step name="write-tests">
      <Claude>Write tests for the implementation</Claude>
    </Step>
  </Phase>
  <Phase name="review">
    <Review target={{ type: "diff", ref: "main" }} />
  </Phase>
</PhaseRegistry>
```

### Parallel Execution

Run multiple agents concurrently within a step:

```tsx
<Parallel>
  <Claude model="haiku">Quick task 1</Claude>
  <Claude model="haiku">Quick task 2</Claude>
  <Claude model="haiku">Quick task 3</Claude>
</Parallel>
```

### Database Persistence

Every run is a "flight recorder" - all state persists in SQLite:

```tsx
// Set state (survives restarts)
await db.state.set("phase", "review");

// Get state
const phase = await db.state.get("phase");

// Query history - see how state evolved
const history = await db.state.getHistory("phase");

// Resume incomplete executions
const incomplete = await db.execution.findIncomplete();
if (incomplete) {
  // Pick up exactly where you left off
  executionId = incomplete.id;
}
```

```bash
# Inspect from CLI
smithers db executions                    # List all runs
smithers db state --execution-id abc123   # See state for a run
smithers db stats                         # Database statistics
```

---

## FAQ

### Is this actually React? Do I need to run a UI?

No UI. React is a component model + markup-like syntax. People already use it to render to non-DOM targets (CLI, PDFs, native). Smithers renders to **execution**, not DOM.

### Why not YAML/JSON for workflows?

Because you want:
- Composition and reuse
- Version control diffs that make sense
- Something your coding agent can generate AND you can review like normal code

### How does this relate to Ralphing?

Ralphing is the outer loop (iterate until verification passes). Smithers gives it structure, persistence, and inspectability. Think: "Smithers productionizes Ralph loops."

### What's a Ralph loop?

From [vercel-labs/ralph-loop-agent](https://github.com/vercel-labs/ralph-loop-agent): continuous autonomy where the agent loops until the task is actually done, with verification gates (tests/linters). Smithers makes these loops durable.

---

## Contributing

We accept **vibe-coded contributions** as long as you include your original prompt in a git note:

```bash
git notes add -m "User prompt: <your prompt here>"
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

**Let your agent write agents. Built with React, powered by Claude.**
