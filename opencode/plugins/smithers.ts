import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

const plugin: Plugin = async (ctx) => {
  const { createControlPlane } = await import("smithers-orchestrator")
  const controlPlane = createControlPlane({ cwd: ctx.worktree })

  return {
    tool: {
      smithers_discover: tool({
        description: "Find Smithers workflow scripts in the repository",
        args: {},
        async execute() {
          const scripts = await controlPlane.discoverScripts()
          if (scripts.length === 0) {
            return "No Smithers workflows found. Use smithers_create to create one."
          }
          return scripts
            .map(
              (s) =>
                `${s.name}: ${s.path}${s.hasIncomplete ? " (has incomplete execution)" : ""}`
            )
            .join("\n")
        },
      }),

      smithers_create: tool({
        description:
          "Create a new Smithers workflow file. Validates TypeScript before writing.",
        args: {
          name: tool.schema
            .string()
            .describe("Workflow name (will be saved as .smithers/<name>.tsx)"),
          content: tool.schema
            .string()
            .describe("Full TypeScript/TSX content of the workflow"),
          overwrite: tool.schema.boolean().optional().describe("Overwrite if exists"),
        },
        async execute(args) {
          const result = await controlPlane.createWorkflow({
            name: args.name,
            content: args.content,
            overwrite: args.overwrite,
          })
          if (result.errors?.length) {
            return `TypeScript errors:\n${result.errors.join("\n")}`
          }
          return `Created workflow at ${result.path}`
        },
      }),

      smithers_run: tool({
        description: "Start a new Smithers workflow execution",
        args: {
          script: tool.schema.string().describe("Path to the workflow script"),
          name: tool.schema.string().optional().describe("Execution name"),
        },
        async execute(args) {
          const result = await controlPlane.run({
            script: args.script,
            name: args.name,
          })
          return `Started execution ${result.executionId}\nDatabase: ${result.dbPath}\nPID: ${result.pid}`
        },
      }),

      smithers_resume: tool({
        description: "Resume an incomplete Smithers execution",
        args: {
          executionId: tool.schema
            .string()
            .optional()
            .describe("Specific execution ID to resume (default: latest incomplete)"),
        },
        async execute(args) {
          const result = await controlPlane.resume({
            executionId: args.executionId,
          })
          return `Resumed execution ${result.executionId}\nPID: ${result.pid}`
        },
      }),

      smithers_status: tool({
        description: "Get current status of a Smithers execution",
        args: {
          executionId: tool.schema.string().describe("Execution ID to check"),
        },
        async execute(args) {
          const status = await controlPlane.status(args.executionId)
          const tree = status.tree.phases
            .map(
              (p) =>
                `${p.status === "complete" ? "✓" : p.status === "running" ? "▶" : "○"} ${p.name}\n` +
                p.children
                  .map(
                    (s) =>
                      `  ${s.status === "complete" ? "✓" : s.status === "running" ? "▶" : "○"} ${s.name}`
                  )
                  .join("\n")
            )
            .join("\n")
          return `Execution: ${status.executionId}
State: ${status.state}
Iteration: ${status.iteration}
${status.error ? `Error: ${status.error}\n` : ""}
Phase Tree:
${tree}`
        },
      }),

      smithers_frames: tool({
        description: "Get execution frames for monitoring progress",
        args: {
          executionId: tool.schema.string().describe("Execution ID"),
          since: tool.schema.number().optional().describe("Cursor to fetch frames after"),
          limit: tool.schema
            .number()
            .optional()
            .describe("Max frames to return (default: 20)"),
        },
        async execute(args) {
          const { frames, cursor } = await controlPlane.frames(args.executionId, {
            since: args.since,
            limit: args.limit ?? 20,
          })
          if (frames.length === 0) {
            return "No new frames"
          }
          const output = frames
            .map(
              (f) =>
                `[${new Date(f.timestamp).toISOString()}] ${f.type}: ${JSON.stringify(f.data)}`
            )
            .join("\n")
          return `${output}\n\nNext cursor: ${cursor}`
        },
      }),

      smithers_cancel: tool({
        description: "Cancel a running Smithers execution",
        args: {
          executionId: tool.schema.string().describe("Execution ID to cancel"),
        },
        async execute(args) {
          await controlPlane.cancel(args.executionId)
          return `Cancelled execution ${args.executionId}`
        },
      }),
    },
  }
}

export default plugin
