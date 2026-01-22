import Anthropic from '@anthropic-ai/sdk'
import type { SmithersDB } from '../../db/index.js'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const SYSTEM_PROMPT = `You are an observability assistant for Smithers orchestrator.
You have read-only access to:
- The SQLite database (executions, phases, agents, tool_calls, etc.)
- Render frame history (SmithersNode trees)
- Execution logs

Your job is to help users understand:
- What is currently happening in the orchestration
- Why certain decisions were made
- Status of phases, agents, tool calls
- Any errors or warnings

You CANNOT modify any data - only read and explain.

When answering questions, be concise and factual. Reference specific data from the database when possible.
Format numbers and timestamps for readability.`

export interface ClaudeAssistant {
  chat: (messages: ChatMessage[]) => Promise<string>
  isAvailable: () => boolean
}

export function createClaudeAssistant(db: SmithersDB): ClaudeAssistant {
  const apiKey = process.env['ANTHROPIC_API_KEY']
  const client = apiKey ? new Anthropic({ apiKey }) : null

  const getContextSummary = (): string => {
    try {
      const execution = db.execution.current()
      const executionId = execution?.id ?? null
      const phases = executionId
        ? db.query<{ name: string; status: string }>(
          'SELECT name, status FROM phases WHERE execution_id = ? ORDER BY created_at DESC LIMIT 5',
          [executionId]
        )
        : []
      const agents = executionId
        ? db.query<{ model: string; status: string; tokens_input: number | null; tokens_output: number | null }>(
          'SELECT model, status, tokens_input, tokens_output FROM agents WHERE execution_id = ? ORDER BY created_at DESC LIMIT 5',
          [executionId]
        )
        : []
      const toolCalls = executionId
        ? db.query<{ tool_name: string; status: string }>(
          'SELECT tool_name, status FROM tool_calls WHERE execution_id = ? ORDER BY created_at DESC LIMIT 10',
          [executionId]
        )
        : []
      const recentFrames = executionId
        ? db.query<{ id: string }>(
          'SELECT id FROM render_frames WHERE execution_id = ? ORDER BY created_at DESC LIMIT 3',
          [executionId]
        )
        : []

      return `
Current Context:
- Execution: ${execution?.name ?? 'None'} (${execution?.status ?? 'N/A'})
- Total agents: ${execution?.total_agents ?? 0}
- Total tool calls: ${execution?.total_tool_calls ?? 0}

Recent Phases:
${phases.map((p) => `  - ${p.name}: ${p.status}`).join('\n')}

Recent Agents:
${agents.map((a) => `  - ${a.model}: ${a.status} (${a.tokens_input ?? 0}/${a.tokens_output ?? 0} tokens)`).join('\n')}

Recent Tool Calls:
${toolCalls.map((t) => `  - ${t.tool_name}: ${t.status}`).join('\n')}

Render Frames: ${recentFrames.length} recent frames available
`
    } catch (err) {
      console.debug('[claude-assistant] Context fetch error:', err)
      return 'Unable to fetch context data.'
    }
  }

  return {
    isAvailable: () => !!client,

    chat: async (messages: ChatMessage[]): Promise<string> => {
      if (!client) {
        throw new Error('Claude API not available. Set ANTHROPIC_API_KEY.')
      }

      const contextSummary = getContextSummary()
      const systemWithContext = `${SYSTEM_PROMPT}\n\n${contextSummary}`

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemWithContext,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      })

      const textBlock = response.content.find(block => block.type === 'text')
      return textBlock?.type === 'text' ? textBlock.text : 'No response generated.'
    }
  }
}
