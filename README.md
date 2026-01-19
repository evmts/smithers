# Smithers

[![npm version](https://img.shields.io/npm/v/smithers-orchestrator.svg)](https://www.npmjs.com/package/smithers-orchestrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black.svg)](https://bun.sh/)

**JSX workflow engine for coding agents—phases, parallelism, and persistent state for long-running repo automation.**

Run CI recovery, PR finalization, stacked merges, release smoketests, and review processing as resumable workflows—not fragile scripts.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Smithers Workflow Engine                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   JSX Orchestration  ──▶  Claude Agents  ──▶  SQLite State                 │
│                                                                             │
│   ┌─────────────┐        ┌─────────────┐      ┌─────────────┐              │
│   │   Phases    │───────▶│  Parallel   │─────▶│  Resumable  │              │
│   │   & Steps   │        │   Agents    │      │   History   │              │
│   └─────────────┘        └─────────────┘      └─────────────┘              │
│                                                                             │
│   Worktrees • CI Polling • PR Merging • Review Handling • Reports          │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Declarative workflow composition** - JSX syntax readable by humans, writable by Claude
- **Resumable and observable** - SQLite-backed state, execution history, XML output
- **Real engineering primitives** - Phases, steps, worktrees, PR tooling, CI polling

---

## Table of Contents

- [Quickstart](#quickstart)
- [Hero Workflows](#hero-workflows)
- [Why Smithers](#why-smithers)
- [Features](#features)
- [Safety](#safety)
- [FAQ](#faq)
- [Contributing](#contributing)

---

## Quickstart

```bash
# Install
bun add smithers-orchestrator

# Run the PR finalize workflow (status mode - safe, read-only)
bun examples/worktree-pr-finalize/index.tsx --worktree my-branch

# Or run the stacked PR merge (status only)
bun examples/stacked-pr-merge/index.tsx --status
```

**Prerequisites:** [Bun](https://bun.sh/) v1.0+ and [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code)

**Let Claude write your workflows.** Describe what you want:

```
User: "Create a workflow that monitors CI, fixes failures, escalates after 3 attempts"
Claude: *generates ci-recovery.tsx*
```

---

## Hero Workflows

### PR Finalize Autopilot

Get all your worktree PRs into a mergeable state and merged—parallel or sequential.

```bash
# Finalize all worktrees in parallel
bun examples/worktree-pr-finalize/index.tsx

# Finalize single worktree
bun examples/worktree-pr-finalize/index.tsx --worktree fix-auth-bug

# Sequential mode with merge commits
bun examples/worktree-pr-finalize/index.tsx --sequential --merge-method merge
```

**Phases:** StackCheck → Rebase → Review → Push → Poll CI → Merge

```
┌────────────────────────────────────────────────────────────────────────┐
│  PR Finalize Autopilot                                                 │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Worktree 1 ─┬─▶ [Stack?] ─▶ [Rebase] ─▶ [Review] ─▶ [Push] ─▶ [CI] ─▶ [Merge]
│              │                                                         │
│  Worktree 2 ─┤   (Parallel execution with coordination)               │
│              │                                                         │
│  Worktree N ─┘                                                         │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Stacked PR Merge

Merge worktree PRs into clean linear history on main.

```bash
# Status only (safe, shows merge candidates)
bun examples/stacked-pr-merge/index.tsx --status

# Full merge with rebase
bun examples/stacked-pr-merge/index.tsx

# Skip rebase, cherry-pick directly
bun examples/stacked-pr-merge/index.tsx --skip-rebase
```

**Phases:** Status → Order (Claude validates) → Rebase Stack → Cherry-pick Merge

```
┌────────────────────────────────────────────────────────────────────────┐
│  Stacked PR Merge                                                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Worktrees ──▶ [Status] ──▶ [Order] ──▶ [Rebase] ──▶ [Cherry-pick]    │
│                               │                                        │
│                    Claude validates merge order                        │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### More Examples

| Workflow | Description | Command |
|----------|-------------|---------|
| Review Processor | Parallel processing of review backlogs | `bun examples/review-processor/index.tsx` |
| Task Audit | Audit task management across codebase | `bun examples/task-management-audit/index.tsx` |

---

## Why Smithers

### The Problem

Agent scripts don't survive contact with reality:
- **No state** - Can't resume after restart
- **No observability** - Hard to trust what happened
- **Poor concurrency** - Parallel chaos
- **Brittle sequencing** - Steps run out of order

### The Solution

Smithers uses React's component model to define execution plans as **reviewable code**.

- **You can read it** - JSX is familiar, composable, diffable
- **Claude can generate it** - Agent-native syntax
- **Git can version it** - Workflows are code, not prompts

---

## Features

<details>
<summary><strong>Click to expand full feature list</strong></summary>

### Starter Workflows

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

</details>

---

## Safety

Smithers workflows can perform destructive operations. Built-in safeguards:

### Status-Only Mode

Most examples support `--status` flag for safe, read-only inspection:

```bash
bun examples/stacked-pr-merge/index.tsx --status  # See what would happen
```

### Destructive Operations

These operations require explicit flags or are gated:

| Operation | Protection |
|-----------|------------|
| Force push | Worktree isolation |
| Rebase | `--skip-rebase` to disable |
| PR close | `--no-close` to disable |
| Branch delete | `--no-delete` to disable |
| Merge | Requires CI pass + review |

### Worktree Isolation

Operations run in git worktrees, not your main checkout:

```tsx
<Worktree branch="feature" cleanup>
  {/* All changes happen in isolated worktree */}
  <Claude>Implement feature</Claude>
</Worktree>
```

### Audit Trail

Every execution is logged in SQLite with full history:

```bash
smithers db executions                    # What ran
smithers db state --execution-id abc123   # State at each point
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
