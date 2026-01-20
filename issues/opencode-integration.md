# OpenCode Integration - Smithers as OpenCode Planning Mode

<metadata>
  <priority>P0</priority>
  <category>infrastructure</category>
  <status>proposed</status>
  <dependencies>
    - [bunx-smithers-demo](./bunx-smithers-demo.md)
  </dependencies>
  <blocked-by></blocked-by>
  <docs>["docs/introduction.mdx", "docs/quickstart.mdx", "docs/harness-integration.mdx"]</docs>
</metadata>

## Executive Summary

**What**: Make `bunx smithers-orchestrator` (or globally installed `smithers`) launch OpenCode TUI preconfigured with Smithers agent and plugin tools.

**Why**: Users currently need to set up Smithers scripts manually. By wrapping OpenCode with a Smithers-focused configuration, we provide a zero-config experience where users run one command and get an AI that can write/execute Smithers orchestrations.

**Impact**: `bunx smithers-orchestrator` becomes a first-class AI coding experience—users talk to an agent that writes and runs Smithers workflows, not raw code.

## Problem Statement

Current Smithers usage requires:
1. Install the package
2. Write a `.tsx` workflow file with boilerplate (createSmithersDB, createSmithersRoot, etc.)
3. Run with `bun workflow.tsx`

This friction prevents adoption. Users want to describe what they want, not write React boilerplate.

### Current Behavior

```bash
# User must write workflow.tsx first
bun add smithers-orchestrator
# Write boilerplate...
bun workflow.tsx
```

### Expected Behavior

```bash
# Zero config
bunx smithers-orchestrator
# or
bun add -g smithers-orchestrator && smithers

# OpenCode TUI opens, agent writes Smithers workflows for you
```

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User runs: smithers                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               bin/cli.ts (default command)                   │
│  - Sets OPENCODE_CONFIG_DIR to embedded opencode/ dir       │
│  - Sets OPENCODE_CONFIG_CONTENT with minimal tool config    │
│  - Spawns: opencode --agent smithers                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     OpenCode TUI                             │
│  - Loads smithers agent (primary)                           │
│  - Loads smithers plugin (custom tools)                     │
│  - Enforces Smithers Planning Mode via permissions          │
│  - All actions denied by default                            │
│  - Allow-list: smithers_*, read, smithers_glob/grep         │
│  - Subagent spawning (task) disabled                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Smithers Plugin Tools                          │
│  smithers_discover   - Find .tsx workflows in repo          │
│  smithers_create     - Create workflow (typechecks first)   │
│  smithers_run        - Start new execution                  │
│  smithers_resume     - Resume incomplete execution          │
│  smithers_status     - Get execution tree/state             │
│  smithers_frames     - Tail execution frames                │
│  smithers_cancel     - Cancel running execution             │
│  smithers_glob       - Safe file discovery (wraps glob)     │
│  smithers_grep       - Safe text search (wraps grep)        │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Plugin (not MCP)**: Tools added directly via OpenCode plugin
   - **Rationale**: Plugin adds tools inline, no separate server process
   - **Benefit**: Simpler than MCP, tools have direct access to control plane
   - **Note**: MCP server support deferred to future iteration

2. **Permission-Based Tool Enforcement**: Restrict tools via OpenCode permission system
   - **Rationale**: OpenCode deprecated boolean `tools` gating; permission is the authoritative mechanism
   - **Critical**: Must explicitly deny `task` to prevent subagent spawning
   - **Method**: Default deny all (`"*": "deny"`), explicit allow-list for safe tools
   - **Note**: Plugin hooks (`tool.execute.before`) are NOT sufficient—they don't intercept subagent execution

3. **Smithers Planning Mode**: Limited tool access for orchestration focus
   - **Allowed**: `smithers_*` tools, `read`, `smithers_glob`, `smithers_grep`
   - **Denied**: `task`, `edit`, `write`, `bash`, `websearch`, `webfetch`, `codesearch`, `glob`, `grep`, `list`
   - **Tradeoff**: Agent cannot directly modify files—must create Smithers workflows to do so
   - **Rationale**: Forces users through Smithers orchestration, prevents ad-hoc coding

4. **Embedded Config Directory**: Ship `opencode/` folder inside package
   - **Rationale**: `OPENCODE_CONFIG_DIR` loads agents/plugins from custom path
   - **Contents**: `agents/*.md` + `plugins/smithers.ts` + `opencode.json`

5. **Control Plane API**: Abstract SQLite details behind stable API
   - **Rationale**: Plugin calls `controlPlane.run()`, not raw SQL
   - **Benefit**: Can change internal storage without breaking plugin

6. **Multi-Agent Architecture**: Specialized agents for different tasks
   - **Rationale**: Following oh-my-opencode patterns, different tasks need different models/prompts
   - **Agents**: Orchestrator (primary), Planner, Explorer, Librarian, Oracle, Monitor
   - **Key Principle**: All plans are written via Smithers—no ad-hoc coding

### Agent Architecture

Smithers provides 6 specialized agents, each with distinct roles and tool permissions.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Smithers Agent System                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │
│  │  Planner    │───▶│ Orchestrator│───▶│   Monitor   │                      │
│  │ (human plan)│    │(writes .tsx)│    │(watches run)│                      │
│  └─────────────┘    └──────┬──────┘    └─────────────┘                      │
│                            │                                                 │
│              ┌─────────────┼─────────────┐                                  │
│              ▼             ▼             ▼                                  │
│       ┌──────────┐  ┌──────────┐  ┌──────────┐                              │
│       │ Explorer │  │ Librarian│  │  Oracle  │                              │
│       │(codebase)│  │  (docs)  │  │(reasoning)│                              │
│       └──────────┘  └──────────┘  └──────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Agent Definitions

| Agent | Model | Role | Tool Access |
|-------|-------|------|-------------|
| **Orchestrator** | `claude-sonnet-4` | Primary agent. Takes plans and writes `.tsx` Smithers scripts. Delegates to specialists. | Full smithers_* tools |
| **Planner** | `claude-sonnet-4` | Creates human-readable plans from user requests. Interviews user, outputs structured plan. | Read-only. Cannot write code. |
| **Explorer** | `gemini-3-flash` | Fast codebase exploration. Knows Smithers SQLite schema. Contextual grep for internal code. | Read-only: smithers_glob, smithers_grep, read |
| **Librarian** | `claude-sonnet-4` | Documentation lookup. Smithers API reference. External implementation examples. | Read-only. Web search allowed. |
| **Oracle** | `gpt-5.2` | Architecture decisions, debugging, code review. Deep reasoning for complex problems. | Read-only. Cannot modify. |
| **Monitor** | `gemini-3-flash` | Watches running executions. Reports progress, detects issues, suggests interventions. | smithers_status, smithers_frames only |

#### Agent Workflow

```
User describes task
        │
        ▼
┌───────────────────┐
│     Planner       │  "Create a plan to refactor the auth system"
│  (interviews user)│
└────────┬──────────┘
         │ outputs: human-readable plan in .smithers/plans/
         ▼
┌───────────────────┐
│   Orchestrator    │  Translates plan → Smithers .tsx script
│ (writes Smithers) │  Delegates exploration to Explorer/Librarian
└────────┬──────────┘
         │ creates: .smithers/main.tsx
         ▼
┌───────────────────┐
│  smithers_run     │  Executes the workflow
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│     Monitor       │  Watches execution, reports progress
│ (observes agents) │  Surfaces errors, suggests next steps
└───────────────────┘
```

#### Core Principle: Plans via Smithers Only

**All agents share this fundamental constraint:**

> Plans are written as Smithers scripts. No agent directly modifies user code. 
> All code changes flow through Smithers workflows executed by Claude subagents.

This means:
- Planner outputs human-readable plans (markdown)
- Orchestrator translates plans to Smithers `.tsx` code
- Smithers executes the plan via Claude agents that DO have write access
- Monitor observes and reports on execution

#### Agent Prompts (Core Sections)

Each agent prompt includes:

1. **Identity**: Who they are, what they do
2. **Smithers Context**: Schema knowledge, API reference
3. **Tool Restrictions**: What they can/cannot do
4. **Delegation Rules**: When to hand off to other agents
5. **Anti-Patterns**: What they must never do

**Example: Orchestrator Core Prompt**

```markdown
You are the Smithers Orchestrator—the primary agent for multi-agent AI workflows.

## Your Role
You translate human-readable plans into executable Smithers scripts (.tsx files).
You DO NOT write application code directly. You write Smithers orchestrations that
delegate work to Claude agents.

## Smithers Context
- Scripts live in `.smithers/` directory
- Use SmithersProvider, Phase, Step, Claude components
- Database at `.smithers/data/smithers.db`

## Workflow
1. Check for existing plan: `.smithers/plans/`
2. If no plan exists, invoke @planner first
3. Translate plan sections → Phase components
4. Each task → Step with Claude agent
5. Run with smithers_run, monitor with @monitor

## Anti-Patterns
- NEVER write application code directly
- NEVER skip the planning phase
- NEVER ignore existing plans
```

#### Explorer: SQLite Schema Knowledge

Explorer has embedded knowledge of the Smithers database schema:

```sql
-- Tables Explorer knows about:

CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  script TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE phases (
  id TEXT PRIMARY KEY,
  execution_id TEXT,
  name TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER
);

CREATE TABLE steps (
  id TEXT PRIMARY KEY,
  phase_id TEXT,
  name TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  step_id TEXT,
  model TEXT,
  status TEXT DEFAULT 'pending',
  result TEXT,
  error TEXT
);

CREATE TABLE frames (
  id INTEGER PRIMARY KEY,
  execution_id TEXT,
  type TEXT,
  data TEXT,
  created_at INTEGER
);
```

This allows Explorer to answer questions like:
- "What phases are in execution X?"
- "Show me all failed agents"
- "What was the last error?"

### Permission Configuration

Tool restrictions are enforced at the OpenCode permission layer, not via plugin hooks.

```json
{
  "permission": {
    "*": "deny",
    
    "read": "allow",
    
    "smithers_discover": "allow",
    "smithers_create": "allow",
    "smithers_run": "allow",
    "smithers_resume": "allow",
    "smithers_status": "allow",
    "smithers_frames": "allow",
    "smithers_cancel": "allow",
    "smithers_glob": "allow",
    "smithers_grep": "allow",
    
    "task": "deny",
    "edit": "deny",
    "write": "deny",
    "bash": "deny",
    "websearch": "deny",
    "webfetch": "deny",
    "codesearch": "deny",
    "glob": "deny",
    "grep": "deny",
    "list": "deny"
  }
}

### Directory Structure

```
smithers-orchestrator/
├── bin/
│   └── cli.ts                    # Entry point - launches OpenCode or runs subcommands
├── opencode/                     # Embedded OpenCode config directory
│   ├── opencode.json             # Permission config (deny-by-default)
│   ├── agents/
│   │   ├── orchestrator.md       # Primary agent - writes Smithers scripts
│   │   ├── planner.md            # Creates human-readable plans
│   │   ├── explorer.md           # Fast codebase exploration
│   │   ├── librarian.md          # Documentation lookup
│   │   ├── oracle.md             # Architecture/debugging reasoning
│   │   └── monitor.md            # Watches running executions
│   └── plugins/
│       └── smithers.ts           # Plugin with Smithers tools
├── src/
│   ├── control-plane/
│   │   ├── index.ts              # SmithersControlPlane interface
│   │   ├── discover.ts           # Find .tsx workflows
│   │   ├── runner.ts             # Start/resume executions
│   │   └── status.ts             # Query execution state
│   └── ...existing src...
└── package.json                  # Add opencode-ai as dependency
```

### Control Plane API

```ts
// src/control-plane/index.ts
export interface SmithersControlPlane {
  discoverScripts(opts?: { cwd?: string }): Promise<ScriptInfo[]>

  createWorkflow(opts: {
    name: string
    content: string
    overwrite?: boolean
  }): Promise<{ 
    path: string
    created: boolean 
    errors?: string[]  // Typecheck errors if validation fails
  }>

  run(opts: {
    script: string
    name?: string
    maxIterations?: number
  }): Promise<{ executionId: string; dbPath: string }>

  resume(opts?: {
    executionId?: string
  }): Promise<{ executionId: string; dbPath: string }>

  status(executionId: string): Promise<ExecutionStatus>

  frames(
    executionId: string,
    opts?: { since?: number; limit?: number }
  ): Promise<{ frames: Frame[]; cursor: number }>

  cancel(executionId: string): Promise<void>

  // Safe discovery tools (wrappers for glob/grep)
  glob(opts: { pattern: string; cwd?: string }): Promise<string[]>
  
  grep(opts: { 
    pattern: string
    path?: string
    cwd?: string 
  }): Promise<{ file: string; line: number; text: string }[]>
}

export interface ScriptInfo {
  path: string
  name: string
  dbPath: string
  hasIncomplete: boolean
}

export interface ExecutionStatus {
  executionId: string
  script: string
  state: 'pending' | 'running' | 'complete' | 'failed'
  iteration: number
  tree: PhaseTree
  lastOutput?: string
  error?: string
}
```

### CLI Commands (for reference)

**Existing commands:**
```bash
# Run a workflow file
smithers run [file]              # Default: .smithers/main.tsx

# Monitor with LLM-friendly output
smithers monitor [file]          # Recommended for agent use

# Database inspection
smithers db executions           # List all executions
smithers db state --execution-id X  # View execution state
smithers db stats                # Statistics

# Initialize new project
smithers init                    # Create .smithers/ with template
```

**New commands to add:**
```bash
# Discover workflows in repo
smithers discover                # List .tsx files with SmithersProvider

# Resume incomplete execution
smithers resume [execution-id]   # Resume latest or specific execution

# Execution status (JSON output for agent parsing)
smithers status [execution-id]   # Current state, phase tree, iteration

# Create workflow from template
smithers new <name> [--template <type>]  # Generate .smithers/<name>.tsx
```

**OpenCode Agents:**

See [Agent Architecture](#agent-architecture) for full details. Agent markdown files are in `opencode/agents/`.

**Orchestrator (Primary)** - `opencode/agents/orchestrator.md`:
```md
---
description: Primary Smithers agent - translates plans into executable .tsx scripts
color: "#7c3aed"
mode: primary
model: anthropic/claude-sonnet-4
---

You are the Smithers Orchestrator—the primary agent for multi-agent AI workflows.

## Your Role
You translate human-readable plans into executable Smithers scripts (.tsx files).
You DO NOT write application code directly. You write Smithers orchestrations that
delegate work to Claude agents.

## Core Principle
ALL PLANS ARE WRITTEN VIA SMITHERS. No ad-hoc coding. No direct file edits.
When you need something done, you write a Smithers script that delegates to Claude.

## Available Tools
- Full `smithers_*` tools (discover, create, run, resume, status, frames, cancel)
- `read`, `smithers_glob`, `smithers_grep` for exploration
- Delegate to @explorer, @librarian, @oracle for specialist tasks

## Workflow
1. Check for existing plan in `.smithers/plans/` - if none, invoke @planner
2. Translate plan sections → Phase components
3. Each task → Step with Claude agent
4. Create script with `smithers_create`
5. Run with `smithers_run`
6. Hand off to @monitor

## Anti-Patterns
- NEVER write application code directly
- NEVER skip the planning phase for complex tasks
- NEVER ignore existing plans in `.smithers/plans/`
```

**Planner** - `opencode/agents/planner.md`:
```md
---
description: Creates human-readable plans from user requests via interview
color: "#10b981"
mode: subagent
model: anthropic/claude-sonnet-4
permission:
  edit: deny
  bash: deny
---

You are the Smithers Planner—you create human-readable plans through interviews.

## Your Role
Interview the user to understand their request. Output structured plans in markdown.
You CANNOT write code. You CANNOT edit files. You output plans that the Orchestrator
will translate into Smithers scripts.

## Output Format
Save plans to `.smithers/plans/{name}.md` with this structure:

\`\`\`markdown
# Plan: {Name}

## Objective
What we're trying to accomplish.

## Context
- Relevant files discovered
- Dependencies identified
- Constraints noted

## Phases

### Phase 1: {Name}
- [ ] Task 1.1: Description
- [ ] Task 1.2: Description

### Phase 2: {Name}
- [ ] Task 2.1: Description

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
\`\`\`

## Interview Questions
Before creating a plan, ask clarifying questions:
- What is the desired end state?
- Are there constraints I should know about?
- Which files/areas are in scope?
```

**Explorer** - `opencode/agents/explorer.md`:
```md
---
description: Fast codebase exploration with Smithers schema knowledge
color: "#f59e0b"
mode: subagent
model: google/gemini-3-flash
permission:
  edit: deny
  bash: deny
---

You are the Smithers Explorer—fast codebase exploration with database knowledge.

## Your Role
Quickly find relevant code, patterns, and data. You know the Smithers SQLite schema.
You CANNOT modify files. You return findings to the Orchestrator.

## Smithers Database Schema
\`\`\`sql
-- You can query these tables via smithers_status and smithers_frames

executions (id, script, status, created_at, updated_at)
phases (id, execution_id, name, status, created_at)
steps (id, phase_id, name, status, created_at)
agents (id, step_id, model, status, result, error)
frames (id, execution_id, type, data, created_at)
\`\`\`

## Available Tools
- `smithers_glob` - Find files by pattern
- `smithers_grep` - Search file contents
- `read` - Read file contents
- `smithers_status` - Query execution state

## Usage Pattern
Orchestrator asks: "Find all auth-related files"
You: Use smithers_glob and smithers_grep, return summarized findings
```

**Monitor** - `opencode/agents/monitor.md`:
```md
---
description: Watches running Smithers executions and reports progress
color: "#ef4444"
mode: subagent
model: google/gemini-3-flash
permission:
  edit: deny
  bash: deny
---

You are the Smithers Monitor—you watch running executions and report progress.

## Your Role
Observe execution status. Report progress. Detect failures. Suggest interventions.
You CANNOT modify anything. You observe and report.

## Available Tools
- `smithers_status` - Get execution state and phase tree
- `smithers_frames` - Get execution frames (logs, outputs)

## Monitoring Pattern
1. Poll `smithers_status` for overall state
2. Use `smithers_frames` to get recent activity
3. Report: "Phase X complete. Step Y in progress. No errors."
4. If error detected: "Step Y failed with: {error}. Suggest: {intervention}"
```

**OpenCode Plugin:**

```ts
// opencode/plugins/smithers.ts
import { tool } from "@opencode-ai/plugin"

export default function smithersPlugin(ctx) {
  const { createControlPlane } = await import("smithers-orchestrator/control-plane")
  const cp = createControlPlane({ root: ctx.worktree ?? ctx.directory })

  return {
    tool: {
      smithers_discover: tool({
        description: "Find Smithers workflow scripts (.tsx files with SmithersProvider)",
        args: {},
        async execute() {
          return await cp.discoverScripts()
        }
      }),

      smithers_run: tool({
        description: "Start a new Smithers workflow execution",
        args: {
          script: tool.schema.string().describe("Path to workflow .tsx file"),
          name: tool.schema.string().optional().describe("Execution name"),
          maxIterations: tool.schema.number().optional()
        },
        async execute(args) {
          return await cp.run(args)
        }
      }),

      smithers_resume: tool({
        description: "Resume an incomplete execution",
        args: {
          executionId: tool.schema.string().optional()
        },
        async execute(args) {
          return await cp.resume(args)
        }
      }),

      smithers_status: tool({
        description: "Get current status of an execution (phase tree, iteration, state)",
        args: {
          executionId: tool.schema.string()
        },
        async execute(args) {
          return await cp.status(args.executionId)
        }
      }),

      smithers_frames: tool({
        description: "Get execution frames (tail new frames since cursor)",
        args: {
          executionId: tool.schema.string(),
          since: tool.schema.number().optional()
        },
        async execute(args) {
          return await cp.frames(args.executionId, { since: args.since })
        }
      }),

      smithers_cancel: tool({
        description: "Cancel a running execution",
        args: {
          executionId: tool.schema.string()
        },
        async execute(args) {
          await cp.cancel(args.executionId)
          return { cancelled: true }
        }
      }),

      smithers_create: tool({
        description: "Create a Smithers workflow file in .smithers/. Typechecks before writing.",
        args: {
          name: tool.schema.string().describe("Workflow name (becomes filename)"),
          content: tool.schema.string().describe("Full TSX content of the workflow"),
          overwrite: tool.schema.boolean().optional().describe("Overwrite if exists")
        },
        async execute(args) {
          // Validates imports, typechecks with bun, then writes
          return await cp.createWorkflow(args)
        }
      })
    }
  }
}
```

## Implementation Plan

### Phase 1: Add OpenCode Reference & Dependency

**Goal**: Set up OpenCode integration infrastructure

**Files to Create:**
- None

**Files to Modify:**
- `.gitmodules` - Add opencode submodule (DONE)
- `package.json` - Add `opencode-ai` as dependency

```json
{
  "dependencies": {
    "opencode-ai": "^1.0.0"
  }
}
```

### Phase 2: Implement Control Plane API

**Goal**: Abstract Smithers operations behind stable interface

**Files to Create:**
- `src/control-plane/index.ts`
- `src/control-plane/discover.ts`
- `src/control-plane/runner.ts`
- `src/control-plane/status.ts`

**Key Implementation:**

```ts
// src/control-plane/discover.ts
export async function discoverScripts(opts: { cwd?: string }): Promise<ScriptInfo[]> {
  const cwd = opts.cwd ?? process.cwd()
  const smithersDir = path.join(cwd, ".smithers")
  const scripts: ScriptInfo[] = []

  // Check .smithers/*.tsx
  if (await Bun.file(smithersDir).exists()) {
    const files = await glob("**/*.tsx", { cwd: smithersDir })
    for (const file of files) {
      const content = await Bun.file(path.join(smithersDir, file)).text()
      if (content.includes("SmithersProvider")) {
        const dbPath = path.join(smithersDir, file.replace(".tsx", ".db"))
        scripts.push({
          path: path.join(smithersDir, file),
          name: file.replace(".tsx", ""),
          dbPath,
          hasIncomplete: await checkIncomplete(dbPath)
        })
      }
    }
  }

  // Also check root for *.tsx with SmithersProvider
  const rootFiles = await glob("*.tsx", { cwd })
  for (const file of rootFiles) {
    const content = await Bun.file(path.join(cwd, file)).text()
    if (content.includes("SmithersProvider")) {
      scripts.push({
        path: path.join(cwd, file),
        name: file.replace(".tsx", ""),
        dbPath: path.join(smithersDir, "data", `${file.replace(".tsx", "")}.db`),
        hasIncomplete: false
      })
    }
  }

  return scripts
}
```

### Phase 3: Create OpenCode Agent & Plugin

**Goal**: Ship embedded OpenCode configuration

**Files to Create:**
- `opencode/agents/smithers.md`
- `opencode/plugins/smithers.ts`

**Files to Modify:**
- `package.json` - Add `opencode/` to files array

### Phase 4: Update CLI Launcher

**Goal**: Make `smithers` (no args) launch OpenCode

**Files to Modify:**
- `bin/cli.ts`

```ts
#!/usr/bin/env bun
import { Command } from "commander"
import { spawn } from "bun"
import path from "path"

const program = new Command()

program
  .name("smithers")
  .description("AI orchestration framework - launches OpenCode with Smithers tools")
  .version(pkg.version)

// Default action: launch OpenCode
program
  .action(async () => {
    const configDir = path.join(import.meta.dirname, "..", "opencode")
    
    const configContent = JSON.stringify({
      default_agent: "smithers"
    })

    const proc = spawn({
      cmd: ["opencode", "--agent", "smithers"],
      env: {
        ...process.env,
        OPENCODE_CONFIG_DIR: configDir,
        OPENCODE_CONFIG_CONTENT: configContent
      },
      stdio: ["inherit", "inherit", "inherit"]
    })

    await proc.exited
  })

// Existing subcommands remain
program.command("run [file]")...
program.command("db [subcommand]")...
// etc.

program.parse()
```

### Phase 5: Update Documentation

**Goal**: Docs reflect new "just run smithers" experience

**Files to Modify:**
- `docs/introduction.mdx` - Lead with `smithers` command
- `docs/quickstart.mdx` - Simplify to global install + run
- `docs/harness-integration.mdx` - Add OpenCode section, clarify this is advanced

**New Introduction Flow:**

```mdx
# Smithers

Install globally:
\`\`\`bash
bun add -g smithers-orchestrator
\`\`\`

Run:
\`\`\`bash
smithers
\`\`\`

This opens an AI agent that writes and runs Smithers workflows.
Describe what you want to automate—the agent handles the rest.
```

## Acceptance Criteria

### Core Functionality
- [ ] **AC1**: `bunx smithers-orchestrator` launches OpenCode TUI with Smithers agent active
- [ ] **AC2**: Smithers plugin provides smithers_* tools via control plane API
- [ ] **AC3**: `smithers_discover` finds `.tsx` workflows in repo
- [ ] **AC4**: `smithers_run` starts execution and returns executionId
- [ ] **AC5**: `smithers_status` returns phase tree and current state
- [ ] **AC6**: `smithers_resume` resumes incomplete executions
- [ ] **AC7**: Existing CLI subcommands (`run`, `db`, `init`) still work
- [ ] **AC8**: Documentation updated to lead with new experience
- [ ] **AC9**: `bun add -g smithers-orchestrator && smithers` works end-to-end

### Security & Permissions
- [ ] **AC10**: Permission config denies all tools by default (`"*": "deny"`)
- [ ] **AC11**: `task` tool explicitly denied—no subagent spawning possible
- [ ] **AC12**: Only allowed tools: `read`, `smithers_*`
- [ ] **AC13**: Built-in `edit`, `write`, `bash`, `glob`, `grep` are denied

### Safe Discovery
- [ ] **AC14**: `smithers_glob` provides file discovery without enabling built-in glob
- [ ] **AC15**: `smithers_grep` provides text search without enabling built-in grep

### Agent System
- [ ] **AC16**: Orchestrator agent is primary—writes Smithers `.tsx` scripts
- [ ] **AC17**: Planner agent creates human-readable plans in `.smithers/plans/`
- [ ] **AC18**: Explorer agent has SQLite schema knowledge, can query execution data
- [ ] **AC19**: Librarian agent provides Smithers API documentation
- [ ] **AC20**: Oracle agent provides architecture/debugging reasoning
- [ ] **AC21**: Monitor agent watches executions via `smithers_status`/`smithers_frames`
- [ ] **AC22**: All agents enforce "plans via Smithers only" principle
- [ ] **AC23**: Agent tool restrictions enforced per-agent (Explorer read-only, etc.)

## Testing Strategy

### Unit Tests

```ts
// test/control-plane/discover.test.ts
describe("discoverScripts", () => {
  it("finds .tsx files with SmithersProvider in .smithers/", async () => {
    // Setup temp dir with test workflow
    const scripts = await discoverScripts({ cwd: tempDir })
    expect(scripts).toHaveLength(1)
    expect(scripts[0].path).toContain(".smithers/workflow.tsx")
  })

  it("detects incomplete executions", async () => {
    // Setup with db containing incomplete execution
    const scripts = await discoverScripts({ cwd: tempDir })
    expect(scripts[0].hasIncomplete).toBe(true)
  })
})
```

### Integration Tests

```ts
// test/opencode-integration.test.ts
describe("OpenCode Integration", () => {
  it("launches OpenCode with correct config", async () => {
    const proc = spawn({
      cmd: ["bunx", "smithers-orchestrator"],
      env: { ...process.env, CI: "1" }, // Force non-interactive
      stdio: ["pipe", "pipe", "pipe"]
    })
    
    // Should start without error
    await proc.exited
    expect(proc.exitCode).toBe(0)
  })

  it("loads smithers plugin with tools", async () => {
    // Verify plugin is loaded from OPENCODE_CONFIG_DIR
    // Plugin should register smithers_* tools
  })
})
```

### Permission Tests

```ts
// test/opencode-integration.test.ts
describe("Permission Enforcement", () => {
  it("denies task tool to prevent subagent spawning", async () => {
    // Verify task tool returns permission denied
  })

  it("denies edit/write/bash tools", async () => {
    // Verify direct file modification tools are blocked
  })

  it("allows smithers_* tools", async () => {
    // Verify all smithers tools are accessible
  })

  it("allows read tool", async () => {
    // Verify read-only file access works
  })

  it("denies switching to other agents", async () => {
    // Verify @general, @build, etc. are blocked
  })
})
```

### Manual Testing

1. **Fresh repo**: `bunx smithers-orchestrator` in empty repo → agent offers to create workflow
2. **Existing workflow**: Repo with `.smithers/main.tsx` → agent discovers and offers to run
3. **Incomplete execution**: Kill mid-run, reopen → agent offers to resume
4. **Tool blocking**: Ask agent to "run `ls`" → refuses, explains it cannot use bash
5. **Subagent blocking**: Ask agent to "@general do something" → blocked by permission
6. **Safe search**: Agent uses `smithers_glob` and `smithers_grep` to explore codebase

## Files Summary

| Action | File Path | Description |
|--------|-----------|-------------|
| CREATE | `opencode/opencode.json` | Permission config (deny-by-default) |
| CREATE | `opencode/agents/orchestrator.md` | Primary agent - writes Smithers scripts |
| CREATE | `opencode/agents/planner.md` | Creates human-readable plans |
| CREATE | `opencode/agents/explorer.md` | Fast codebase exploration with schema knowledge |
| CREATE | `opencode/agents/librarian.md` | Documentation lookup, Smithers API reference |
| CREATE | `opencode/agents/oracle.md` | Architecture decisions, debugging |
| CREATE | `opencode/agents/monitor.md` | Watches running executions |
| CREATE | `opencode/plugins/smithers.ts` | Plugin with Smithers tools |
| CREATE | `src/control-plane/index.ts` | Control plane interface |
| CREATE | `src/control-plane/discover.ts` | Script discovery |
| CREATE | `src/control-plane/runner.ts` | Execution runner |
| CREATE | `src/control-plane/status.ts` | Status queries |
| CREATE | `src/control-plane/glob.ts` | Safe file discovery wrapper |
| CREATE | `src/control-plane/grep.ts` | Safe text search wrapper |
| MODIFY | `bin/cli.ts` | Add default OpenCode launch |
| MODIFY | `package.json` | Add opencode-ai dependency |
| MODIFY | `.gitmodules` | Add opencode reference (DONE) |
| MODIFY | `docs/introduction.mdx` | Update for new UX |
| MODIFY | `docs/quickstart.mdx` | Simplify to global install |

## Open Questions

- [x] **Q1**: Should we bundle OpenCode or require separate install?
  - **Current Plan**: Bundle as dependency
  - **Alternative**: Require global install, detect with `which opencode`
  - **Resolution**: Try bundling first, fallback detection if package size issues

- [x] **Q2**: How do we handle workflow file creation?
  - **Resolution**: Agent uses `smithers_create` tool which typechecks before writing

- [x] **Q3**: Should the runner spawn bun subprocess or run inline?
  - **Inline**: Faster, but blocks OpenCode
  - **Subprocess**: Independent, can monitor, but more complex
  - **Resolution**: Subprocess with PTY for proper output handling

- [x] **Q4**: Plugin vs MCP server—which approach?
  - **Resolution**: Plugin-only for P0; MCP server support deferred to future iteration

- [x] **Q5**: How to enforce tool restrictions?
  - **Resolution**: OpenCode permission system with `"*": "deny"` baseline
  - **Critical**: Must deny `task` to prevent subagent spawning
  - **Note**: Plugin hooks are insufficient—permission layer is authoritative

- [x] **Q6**: Should we allow glob/grep for codebase exploration?
  - **Tradeoff**: Without them, agent cannot search files effectively
  - **Resolution**: Add `smithers_glob` and `smithers_grep` as safe wrappers
  - **Benefit**: Agent can explore codebase while built-in glob/grep remain denied

## References

- [OpenCode Plugins Docs](https://opencode.ai/docs/plugins)
- [OpenCode Agents Docs](https://opencode.ai/docs/agents)
- [OpenCode Config Docs](https://opencode.ai/docs/config)
- [Existing Smithers Quickstart](../docs/quickstart.mdx)
- [OpenCode Reference Submodule](../reference/opencode/)
- [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) - Reference implementation

## Patterns from oh-my-opencode

Analysis of oh-my-opencode revealed patterns we're adopting for Smithers:

### Patterns We're Using

| Pattern | oh-my-opencode | Smithers Adaptation |
|---------|----------------|---------------------|
| **Multi-agent architecture** | Sisyphus, Oracle, Librarian, Explore | Orchestrator, Planner, Explorer, Librarian, Oracle, Monitor |
| **Permission-based restrictions** | Per-agent `permission` objects | Same approach, deny-by-default |
| **Specialized models per agent** | Different models for different tasks | Explorer=gemini-flash, Oracle=gpt-5.2 |
| **Planning/execution separation** | Prometheus (plan) → Sisyphus (execute) | Planner (plan) → Orchestrator (write Smithers) |
| **Read-only exploration agents** | explore/librarian cannot write | Explorer/Librarian/Oracle read-only |
| **Background task management** | `delegate_task` with `run_in_background` | Similar via smithers_run with monitoring |
| **Skill system** | SKILL.md files with MCP embedding | Deferred to P1 |
| **Disabled lists** | `disabled_hooks`, `disabled_agents` | Adopt for user customization |

### Patterns We're NOT Using

| Pattern | Reason |
|---------|--------|
| **Prometheus/Sisyphus naming** | Too abstract. We use descriptive names: Planner, Orchestrator |
| **Junior agent delegation** | Smithers handles delegation via Claude components |
| **Ralph Loop** | Smithers has its own iteration/retry logic |
| **Todo continuation enforcer** | Smithers tracks state in SQLite, not todos |

### Key Differences from oh-my-opencode

1. **Smithers-first**: All plans become Smithers scripts. oh-my-opencode agents write code directly.
2. **Database-backed state**: Smithers uses SQLite for execution tracking, not session state.
3. **React-based orchestration**: Smithers scripts are JSX, not imperative delegation.
4. **Explicit monitoring**: Monitor agent is a first-class citizen, not just hooks.

### Implementation Reference

When implementing, reference these oh-my-opencode files:

```
/tmp/oh-my-opencode/
├── src/
│   ├── index.ts                    # Plugin entry point pattern
│   ├── agents/
│   │   ├── sisyphus.ts             # Complex agent prompt construction
│   │   ├── oracle.ts               # Read-only reasoning agent
│   │   └── explore.ts              # Fast exploration agent
│   ├── tools/
│   │   └── delegate-task/tools.ts  # Tool definition patterns
│   └── config/
│       └── schema.ts               # Zod schemas for config validation
├── docs/
│   ├── features.md                 # Feature documentation style
│   └── orchestration-guide.md      # Workflow documentation
└── opencode/                       # (doesn't exist, but shows intent)
```
