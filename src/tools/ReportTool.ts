// Report Tool - Allows agents to write structured reports to the database

import type { Tool, ToolContext, JSONSchema } from './registry.jsx'

/**
 * Report tool input schema
 */
const reportInputSchema: JSONSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['progress', 'finding', 'warning', 'error', 'metric', 'decision'],
      description: 'Type of report',
    },
    title: {
      type: 'string',
      description: 'Brief title for the report',
    },
    content: {
      type: 'string',
      description: 'Detailed content of the report',
    },
    data: {
      type: 'object',
      description: 'Optional structured data to include',
    },
    severity: {
      type: 'string',
      enum: ['info', 'warning', 'critical'],
      description: 'Severity level (default: info)',
    },
  },
  required: ['type', 'title', 'content'],
}

/**
 * Create a Report tool instance for an agent
 *
 * The Report tool allows agents to communicate structured information
 * back to the orchestration system. Reports are stored in the database
 * and can trigger stop conditions if severity is critical.
 *
 * Usage in agent prompt:
 * ```
 * Use the Report tool to communicate important findings:
 * - progress: Report progress on the task
 * - finding: Document a discovery or observation
 * - warning: Flag a potential issue
 * - error: Report an error condition
 * - metric: Record a measurement or statistic
 * - decision: Document a decision made
 * ```
 */
export function createReportTool(context: ToolContext): Tool {
  return {
    name: 'Report',
    description: `Report progress, findings, or status to the orchestration system.
Use this to communicate important information back to the orchestrator.
Reports are stored in the database and visible to monitoring.

Types:
- progress: Report progress on the current task
- finding: Document an important discovery
- warning: Flag a potential issue (severity: warning)
- error: Report an error condition (severity: critical)
- metric: Record a measurement or statistic
- decision: Document a decision that was made

Severity levels:
- info: Informational (default)
- warning: Potential issue that needs attention
- critical: Serious issue that may stop orchestration`,

    inputSchema: reportInputSchema,

    execute: async (input: {
      type: 'progress' | 'finding' | 'warning' | 'error' | 'metric' | 'decision'
      title: string
      content: string
      data?: Record<string, any>
      severity?: 'info' | 'warning' | 'critical'
    }) => {
      // Default severity based on type
      let severity = input.severity
      if (!severity) {
        switch (input.type) {
          case 'error':
            severity = 'critical'
            break
          case 'warning':
            severity = 'warning'
            break
          default:
            severity = 'info'
        }
      }

      // Add report to database
      const reportData = {
        type: input.type,
        title: input.title,
        content: input.content,
        severity,
        agent_id: context.agentId,
      }
      const reportId = await context.db.vcs.addReport({
        ...reportData,
        ...(input.data && { data: input.data }),
      })

      console.log(`[Report] ${severity.toUpperCase()}: ${input.title}`)

      return {
        success: true,
        reportId,
        message: `Report logged successfully: ${input.title}`,
      }
    },
  }
}

/**
 * Generate the Report tool description for inclusion in system prompts
 */
export function getReportToolDescription(): string {
  return `
## Report Tool

You have access to a Report tool that lets you communicate important information
back to the orchestration system. Use it to:

- Report progress on your task
- Document findings and discoveries
- Flag warnings or errors
- Record metrics and decisions

Example usage:
\`\`\`json
{
  "type": "finding",
  "title": "Security vulnerability detected",
  "content": "Found SQL injection vulnerability in user input handling...",
  "severity": "critical",
  "data": {
    "file": "src/api/users.ts",
    "line": 42
  }
}
\`\`\`

Reports with severity "critical" may trigger orchestration to stop.
`.trim()
}
