import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { createControlPlane } from "smithers-orchestrator"

const SMITHERS_SYSTEM_CONTEXT = `
## Smithers Context

You are operating as the Smithers orchestration agent. You create and manage multi-agent AI workflows.

### Core Workflow
Human Request → Plan → Smithers Script (.tsx) → Claude Agents → Code Changes

### Key Principles
1. **Never write application code directly** - Create .smithers/*.tsx workflows that orchestrate Claude agents
2. **Each task = Step** - Claude agents do the actual coding within steps
3. **Phases group related steps** - Analysis → Implementation → Testing
4. **Everything persists** - Plans, executions, state survive restarts in SQLite

### Available Tools
- smithers_discover - Find workflow scripts in .smithers/
- smithers_create - Create new workflow files (validates before writing)
- smithers_run - Start workflow execution
- smithers_resume - Resume incomplete execution
- smithers_status - Get execution phase/step tree
- smithers_frames - Get execution output/logs
- smithers_cancel - Cancel running execution
- smithers_glob - Find files by pattern
- smithers_grep - Search file contents

### Workflow File Structure
\`\`\`tsx
// .smithers/my-feature.tsx
<SmithersProvider>
  <Phase name="analysis">
    <Step name="understand-codebase">
      <Claude prompt="Analyze current implementation..." />
    </Step>
  </Phase>
  <Phase name="implementation">
    <Step name="create-components">...</Step>
  </Phase>
</SmithersProvider>
\`\`\`

### Persistence
- Scripts: .smithers/*.tsx
- Executions: .smithers/data/<script-name>.db (SQLite per workflow)
- All phases, steps, agent outputs tracked and resumable
`

export const smithers: Plugin = async (ctx) => {
  const cp = createControlPlane({ cwd: ctx.directory })

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      output.system.push(SMITHERS_SYSTEM_CONTEXT.trim())
    },

    tool: {
      smithers_discover: tool({
        description: "Discover Smithers workflow scripts (.tsx files with SmithersProvider) in the repository. Returns list of scripts with their paths, names, and whether they have incomplete executions.",
        args: {},
        async execute() {
          const scripts = await cp.discoverScripts()
          if (scripts.length === 0) {
            return "No Smithers workflows found. Create one in .smithers/ directory."
          }
          const lines = scripts.map(s => {
            const status = s.hasIncomplete ? " [INCOMPLETE]" : ""
            return `- ${s.name}: ${s.path}${status}`
          })
          return `Found ${scripts.length} workflow(s):\n${lines.join("\n")}`
        }
      }),

      smithers_create: tool({
        description: "Create a new Smithers workflow file in .smithers/. Validates syntax before writing. Returns errors if validation fails.",
        args: {
          name: tool.schema.string().describe("Workflow name (becomes filename without .tsx extension)"),
          content: tool.schema.string().describe("Full TSX content of the workflow"),
          overwrite: tool.schema.boolean().optional().describe("Overwrite if file already exists")
        },
        async execute(args) {
          const result = await cp.createWorkflow({
            name: args.name,
            content: args.content,
            overwrite: args.overwrite
          })
          
          if (result.created) {
            return `Created workflow: ${result.path}`
          } else {
            const errors = result.errors?.join("\n") ?? "Unknown error"
            return `Failed to create workflow:\n${errors}`
          }
        }
      }),

      smithers_run: tool({
        description: "Start a new Smithers workflow execution. Returns execution ID for tracking.",
        args: {
          script: tool.schema.string().describe("Path to the workflow script (.tsx file)"),
          name: tool.schema.string().optional().describe("Optional execution name")
        },
        async execute(args) {
          const result = await cp.run({
            script: args.script,
            name: args.name
          })
          return `Started execution:\n- ID: ${result.executionId}\n- DB: ${result.dbPath}\n- PID: ${result.pid}`
        }
      }),

      smithers_resume: tool({
        description: "Resume an incomplete Smithers execution. If no ID provided, resumes the most recent incomplete execution.",
        args: {
          executionId: tool.schema.string().optional().describe("Specific execution ID to resume")
        },
        async execute(args) {
          try {
            const result = await cp.resume({ executionId: args.executionId })
            return `Resumed execution:\n- ID: ${result.executionId}\n- DB: ${result.dbPath}\n- PID: ${result.pid}`
          } catch (err) {
            return `Failed to resume: ${err instanceof Error ? err.message : String(err)}`
          }
        }
      }),

      smithers_status: tool({
        description: "Get the current status of a Smithers execution including phase tree and state.",
        args: {
          executionId: tool.schema.string().describe("Execution ID to check")
        },
        async execute(args) {
          try {
            const status = await cp.status(args.executionId)
            
            const phaseLines = status.tree.phases.map(p => {
              const stepLines = p.children.map(s => `    - ${s.name}: ${s.status}`).join("\n")
              return `  ${p.name}: ${p.status}\n${stepLines}`
            }).join("\n")
            
            let output = `Execution: ${status.executionId}\n`
            output += `State: ${status.state}\n`
            output += `Iteration: ${status.iteration}\n`
            output += `Script: ${status.script}\n\n`
            output += `Phases:\n${phaseLines}`
            
            if (status.error) {
              output += `\n\nError: ${status.error}`
            }
            
            return output
          } catch (err) {
            return `Failed to get status: ${err instanceof Error ? err.message : String(err)}`
          }
        }
      }),

      smithers_frames: tool({
        description: "Get execution output frames for monitoring progress. Returns frames since cursor position.",
        args: {
          executionId: tool.schema.string().describe("Execution ID"),
          since: tool.schema.number().optional().describe("Cursor position to get frames after"),
          limit: tool.schema.number().optional().describe("Maximum frames to return (default: 100)")
        },
        async execute(args) {
          try {
            const result = await cp.frames(args.executionId, {
              since: args.since,
              limit: args.limit
            })
            
            if (result.frames.length === 0) {
              return `No new frames (cursor: ${result.cursor})`
            }
            
            const frameLines = result.frames.map(f => {
              const data = typeof f.data === 'string' ? f.data : JSON.stringify(f.data)
              return `[${new Date(f.timestamp).toISOString()}] ${data}`
            }).join("\n\n")
            
            return `Frames (${result.frames.length}, cursor: ${result.cursor}):\n\n${frameLines}`
          } catch (err) {
            return `Failed to get frames: ${err instanceof Error ? err.message : String(err)}`
          }
        }
      }),

      smithers_cancel: tool({
        description: "Cancel a running Smithers execution.",
        args: {
          executionId: tool.schema.string().describe("Execution ID to cancel")
        },
        async execute(args) {
          try {
            await cp.cancel(args.executionId)
            return `Cancelled execution: ${args.executionId}`
          } catch (err) {
            return `Failed to cancel: ${err instanceof Error ? err.message : String(err)}`
          }
        }
      }),

      smithers_glob: tool({
        description: "Find files by glob pattern. Safe file discovery without enabling built-in glob tool.",
        args: {
          pattern: tool.schema.string().describe("Glob pattern (e.g., '**/*.ts', 'src/**/*.tsx')"),
          limit: tool.schema.number().optional().describe("Maximum results (default: 100)")
        },
        async execute(args) {
          const results = await cp.glob({
            pattern: args.pattern,
            limit: args.limit ?? 100
          })
          
          if (results.length === 0) {
            return `No files match pattern: ${args.pattern}`
          }
          
          return `Found ${results.length} file(s):\n${results.join("\n")}`
        }
      }),

      smithers_grep: tool({
        description: "Search file contents with regex pattern. Safe text search without enabling built-in grep tool.",
        args: {
          pattern: tool.schema.string().describe("Regex pattern to search for"),
          path: tool.schema.string().optional().describe("Directory or file path to search in"),
          glob: tool.schema.string().optional().describe("Glob pattern to filter files"),
          caseSensitive: tool.schema.boolean().optional().describe("Case-sensitive search (default: false)")
        },
        async execute(args) {
          const results = await cp.grep({
            pattern: args.pattern,
            path: args.path,
            glob: args.glob,
            caseSensitive: args.caseSensitive
          })
          
          if (results.length === 0) {
            return `No matches for pattern: ${args.pattern}`
          }
          
          const lines = results.map(r => `${r.file}:${r.line}: ${r.content}`).join("\n")
          return `Found ${results.length} match(es):\n${lines}`
        }
      })
    }
  }
}
