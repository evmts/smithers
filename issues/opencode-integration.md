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

**What**: Make `bunx smithers-orchestrator` (or globally installed `smithers`) launch OpenCode TUI preconfigured as a "Smithers planning mode" where the LLM only has access to Smithers MCP tools.

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
│  - Loads smithers MCP server (optional, for tool access)    │
│  - All built-in tools disabled except smithers_* + read     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Smithers MCP / Plugin Tools                    │
│  smithers_discover   - Find .tsx workflows in repo          │
│  smithers_run        - Start new execution                  │
│  smithers_resume     - Resume incomplete execution          │
│  smithers_status     - Get execution tree/state             │
│  smithers_frames     - Tail execution frames                │
│  smithers_cancel     - Cancel running execution             │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Plugin vs MCP Server**: Use OpenCode plugin (not MCP) for simpler integration
   - **Rationale**: Plugin adds tools directly; no separate server process
   - **Alternative**: MCP server works but adds complexity

2. **Minimal Tools via Config**: Disable bash/write/edit/patch in config + agent definition
   - **Rationale**: OpenCode natively supports tool disabling—no hooks needed
   - **Method**: `OPENCODE_CONFIG_CONTENT` + agent frontmatter `tools:` section
   - **Exception**: Keep `read` for codebase exploration, `glob` for file discovery

3. **Embedded Config Directory**: Ship `opencode/` folder inside package
   - **Rationale**: `OPENCODE_CONFIG_DIR` loads agents/plugins from custom path
   - **Alternative**: Generate config at runtime (more complex, less predictable)

4. **Control Plane API**: Abstract SQLite details behind stable API
   - **Rationale**: Plugin should call `controlPlane.run()`, not raw SQL
   - **Benefit**: Can change internal storage without breaking plugin

### Directory Structure

```
smithers-orchestrator/
├── bin/
│   └── cli.ts                    # Entry point - launches OpenCode or runs subcommands
├── opencode/                     # Embedded OpenCode config directory
│   ├── agents/
│   │   └── smithers.md           # Primary Smithers agent definition
│   ├── plugins/
│   │   └── smithers.ts           # Plugin with Smithers tools
│   └── tools/
│       └── (empty - tools via plugin)
├── src/
│   ├── control-plane/
│   │   ├── index.ts              # SmithersControlPlane interface
│   │   ├── discover.ts           # Find .tsx workflows
│   │   ├── runner.ts             # Start/resume executions
│   │   └── status.ts             # Query execution state
│   └── ...existing src...
└── package.json                  # Add opencode-ai as dependency
```

### API Design

**Control Plane Interface:**

```ts
// src/control-plane/index.ts
export interface SmithersControlPlane {
  discoverScripts(opts?: { cwd?: string }): Promise<ScriptInfo[]>

  run(opts: {
    script: string
    name?: string
    maxIterations?: number
    dbPath?: string
  }): Promise<{ executionId: string; dbPath: string }>

  resume(opts?: {
    executionId?: string
    dbPath?: string
  }): Promise<{ executionId: string; dbPath: string }>

  status(executionId: string, dbPath?: string): Promise<ExecutionStatus>

  frames(
    executionId: string,
    opts?: { since?: number; limit?: number; dbPath?: string }
  ): Promise<{ frames: Frame[]; cursor: number }>

  cancel(executionId: string, dbPath?: string): Promise<void>
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

**OpenCode Agent:**

```md
---
description: Orchestrates Smithers JSX workflows - write, run, resume, and monitor multi-agent executions
mode: primary
tools:
  smithers_*: true
  read: true
  glob: true
  
  bash: false
  write: false
  edit: false
  patch: false
  webfetch: false
---

You are the Smithers Orchestrator.

Your role is to help users create and manage multi-agent AI workflows using Smithers.
When a user describes a task, you:

1. Design a Smithers workflow (React TSX with Phase/Step/Claude components)
2. Use smithers_run to execute it
3. Monitor progress with smithers_status and smithers_frames
4. If it fails, analyze and offer to resume with smithers_resume

You CANNOT modify files directly. You can only:
- Read files to understand the codebase
- Write and execute Smithers workflows
- Monitor execution progress

When creating workflows, follow Smithers conventions:
- Use SmithersProvider with db and executionId
- Structure work as Phase > Step > Claude
- Include db.execution.findIncomplete() for resumability
```

**OpenCode Plugin:**

```ts
// opencode/plugins/smithers.ts
import { tool } from "@opencode-ai/plugin"

export default function smithersPlugin(ctx) {
  const { createControlPlane } = await import("smithers-orchestrator/control-plane")
  const cp = createControlPlane({ root: ctx.worktree ?? ctx.directory })

  return {
    // Tools only - blocking handled by config + agent definition
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
      default_agent: "smithers",
      tools: {
        bash: false,
        write: false,
        edit: false,
        patch: false,
        webfetch: false
      },
      permission: {
        bash: "deny",
        edit: "deny"
      }
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

- [ ] **AC1**: `bunx smithers-orchestrator` launches OpenCode TUI with Smithers agent active
- [ ] **AC2**: Smithers agent can only use `smithers_*`, `read`, `glob` tools (others blocked)
- [ ] **AC3**: `smithers_discover` finds `.tsx` workflows in repo
- [ ] **AC4**: `smithers_run` starts execution and returns executionId
- [ ] **AC5**: `smithers_status` returns phase tree and current state
- [ ] **AC6**: `smithers_resume` resumes incomplete executions
- [ ] **AC7**: Existing CLI subcommands (`run`, `db`, `init`) still work
- [ ] **AC8**: Documentation updated to lead with new experience
- [ ] **AC9**: `bun add -g smithers-orchestrator && smithers` works end-to-end

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

  it("config disables non-smithers tools", async () => {
    // Verify OPENCODE_CONFIG_CONTENT has tools disabled
    const config = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT!)
    expect(config.tools.bash).toBe(false)
    expect(config.tools.write).toBe(false)
  })
})
```

### Manual Testing

1. **Fresh repo**: `bunx smithers-orchestrator` in empty repo → agent offers to create workflow
2. **Existing workflow**: Repo with `.smithers/main.tsx` → agent discovers and offers to run
3. **Incomplete execution**: Kill mid-run, reopen → agent offers to resume
4. **Tool blocking**: Ask agent to "run `ls`" → refuses, suggests Smithers approach

## Files Summary

| Action | File Path | Description |
|--------|-----------|-------------|
| CREATE | `opencode/agents/smithers.md` | Primary agent definition |
| CREATE | `opencode/plugins/smithers.ts` | Plugin with Smithers tools |
| CREATE | `src/control-plane/index.ts` | Control plane interface |
| CREATE | `src/control-plane/discover.ts` | Script discovery |
| CREATE | `src/control-plane/runner.ts` | Execution runner |
| CREATE | `src/control-plane/status.ts` | Status queries |
| MODIFY | `bin/cli.ts` | Add default OpenCode launch |
| MODIFY | `package.json` | Add opencode-ai dependency |
| MODIFY | `.gitmodules` | Add opencode reference (DONE) |
| MODIFY | `docs/introduction.mdx` | Update for new UX |
| MODIFY | `docs/quickstart.mdx` | Simplify to global install |

## Open Questions

- [ ] **Q1**: Should we bundle OpenCode or require separate install?
  - **Current Plan**: Bundle as dependency
  - **Alternative**: Require global install, detect with `which opencode`
  - **Resolution**: Try bundling first, fallback detection if package size issues

- [ ] **Q2**: How do we handle workflow file creation?
  - **Impact**: Agent needs to write .tsx files but we disabled `write` tool
  - **Resolution**: Add `smithers_create_workflow` tool that validates and writes only Smithers files

- [ ] **Q3**: Should the runner spawn bun subprocess or run inline?
  - **Inline**: Faster, but blocks OpenCode
  - **Subprocess**: Independent, can monitor, but more complex
  - **Resolution**: Subprocess with PTY for proper output handling

## References

- [OpenCode Plugins Docs](https://opencode.ai/docs/plugins)
- [OpenCode Agents Docs](https://opencode.ai/docs/agents)
- [OpenCode Config Docs](https://opencode.ai/docs/config)
- [OpenCode MCP Servers](https://opencode.ai/docs/mcp-servers)
- [Existing Smithers Quickstart](../docs/quickstart.mdx)
- [OpenCode Reference Submodule](../reference/opencode/)
