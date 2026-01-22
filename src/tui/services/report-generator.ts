import Anthropic from '@anthropic-ai/sdk'
import type { SmithersDB } from '../../db/index.js'

export interface Report {
  id: string
  execution_id: string
  type: string
  title: string
  content: string
  data: string | null
  severity: string
  created_at: string
}

interface ExecutionMetrics {
  totalPhases: number
  completedPhases: number
  runningPhases: number
  failedPhases: number
  totalAgents: number
  completedAgents: number
  runningAgents: number
  failedAgents: number
  totalToolCalls: number
  completedToolCalls: number
  failedToolCalls: number
  totalTokensInput: number
  totalTokensOutput: number
  avgAgentDuration: number
  avgToolDuration: number
  pendingHumanRequests: number
  recentErrors: string[]
}

interface PhaseRow { status: string }
interface AgentRow { status: string; tokens_input: number | null; tokens_output: number | null; duration_ms: number | null; error: string | null }
interface ToolRow { status: string; duration_ms: number | null; error: string | null }

function gatherMetrics(db: SmithersDB): ExecutionMetrics {
  const execution = db.execution.current()
  if (!execution) {
    return {
      totalPhases: 0, completedPhases: 0, runningPhases: 0, failedPhases: 0,
      totalAgents: 0, completedAgents: 0, runningAgents: 0, failedAgents: 0,
      totalToolCalls: 0, completedToolCalls: 0, failedToolCalls: 0,
      totalTokensInput: 0, totalTokensOutput: 0,
      avgAgentDuration: 0, avgToolDuration: 0,
      pendingHumanRequests: 0, recentErrors: []
    }
  }

  const phases = db.query<PhaseRow>('SELECT status FROM phases WHERE execution_id = ?', [execution.id])
  const agents = db.query<AgentRow>('SELECT status, tokens_input, tokens_output, duration_ms, error FROM agents WHERE execution_id = ?', [execution.id])
  const toolCalls = db.query<ToolRow>('SELECT status, duration_ms, error FROM tool_calls WHERE execution_id = ?', [execution.id])
  const humanRequests = db.query<{ id: string }>("SELECT * FROM human_interactions WHERE execution_id = ? AND status = 'pending'", [execution.id])

  const recentErrors: string[] = []
  agents.filter((a) => a.error).forEach((a) => recentErrors.push(`Agent: ${a.error}`))
  toolCalls.filter((t) => t.error).forEach((t) => recentErrors.push(`Tool: ${t.error}`))

  const completedAgents = agents.filter((a) => a.status === 'completed')
  const completedTools = toolCalls.filter((t) => t.status === 'completed')

  return {
    totalPhases: phases.length,
    completedPhases: phases.filter((p) => p.status === 'completed').length,
    runningPhases: phases.filter((p) => p.status === 'running').length,
    failedPhases: phases.filter((p) => p.status === 'failed').length,
    totalAgents: agents.length,
    completedAgents: completedAgents.length,
    runningAgents: agents.filter((a) => a.status === 'running').length,
    failedAgents: agents.filter((a) => a.status === 'failed').length,
    totalToolCalls: toolCalls.length,
    completedToolCalls: completedTools.length,
    failedToolCalls: toolCalls.filter((t) => t.status === 'failed').length,
    totalTokensInput: agents.reduce((sum, a) => sum + (a.tokens_input || 0), 0),
    totalTokensOutput: agents.reduce((sum, a) => sum + (a.tokens_output || 0), 0),
    avgAgentDuration: completedAgents.length > 0
      ? completedAgents.reduce((sum, a) => sum + (a.duration_ms || 0), 0) / completedAgents.length
      : 0,
    avgToolDuration: completedTools.length > 0
      ? completedTools.reduce((sum, t) => sum + (t.duration_ms || 0), 0) / completedTools.length
      : 0,
    pendingHumanRequests: humanRequests.length,
    recentErrors: recentErrors.slice(-5)
  }
}

function formatMetricsReport(metrics: ExecutionMetrics): string {
  return `
## Execution Summary

### Phases
- Total: ${metrics.totalPhases}
- Completed: ${metrics.completedPhases}
- Running: ${metrics.runningPhases}
- Failed: ${metrics.failedPhases}

### Agents
- Total: ${metrics.totalAgents}
- Completed: ${metrics.completedAgents}
- Running: ${metrics.runningAgents}
- Failed: ${metrics.failedAgents}
- Avg Duration: ${Math.round(metrics.avgAgentDuration)}ms

### Tool Calls
- Total: ${metrics.totalToolCalls}
- Completed: ${metrics.completedToolCalls}
- Failed: ${metrics.failedToolCalls}
- Avg Duration: ${Math.round(metrics.avgToolDuration)}ms

### Tokens
- Input: ${metrics.totalTokensInput.toLocaleString()}
- Output: ${metrics.totalTokensOutput.toLocaleString()}

### Human Interactions
- Pending: ${metrics.pendingHumanRequests}

${metrics.recentErrors.length > 0 ? `### Recent Errors\n${metrics.recentErrors.map(e => `- ${e}`).join('\n')}` : ''}
`.trim()
}

async function getClaudeAnalysis(metrics: ExecutionMetrics): Promise<string | null> {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) return null

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: 'You are an observability analyst. Analyze the following execution metrics and provide a brief 2-3 sentence summary of the health and progress of the orchestration. Highlight any concerns.',
      messages: [{
        role: 'user',
        content: JSON.stringify(metrics, null, 2)
      }]
    })

    const textBlock = response.content.find(block => block.type === 'text')
    return textBlock?.type === 'text' ? textBlock.text : null
  } catch {
    return null
  }
}

export async function generateReport(db: SmithersDB): Promise<Report | null> {
  const execution = db.execution.current()
  if (!execution) return null

  const metrics = gatherMetrics(db)
  const metricsReport = formatMetricsReport(metrics)

  const analysis = await getClaudeAnalysis(metrics)

  const content = analysis
    ? `${metricsReport}\n\n### AI Analysis\n${analysis}`
    : metricsReport

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.db.run(
    `INSERT INTO reports (id, execution_id, type, title, content, data, severity, created_at)
     VALUES (?, ?, 'auto_summary', ?, ?, ?, ?, ?)`,
    [
      id,
      execution.id,
      `10-Minute Summary - ${new Date().toLocaleTimeString()}`,
      content,
      JSON.stringify(metrics),
      metrics.failedAgents > 0 || metrics.failedToolCalls > 0 ? 'warning' : 'info',
      now
    ]
  )

  return {
    id,
    execution_id: execution.id,
    type: 'auto_summary',
    title: `10-Minute Summary - ${new Date().toLocaleTimeString()}`,
    content,
    data: JSON.stringify(metrics),
    severity: metrics.failedAgents > 0 || metrics.failedToolCalls > 0 ? 'warning' : 'info',
    created_at: now
  }
}
