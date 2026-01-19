// Agent tracking module for Smithers DB

import type { ReactiveDatabase } from '../reactive-sqlite/index.js'
import type { Agent, AgentStreamEvent, StreamSummary } from './types.js'
import { uuid, now, parseJson } from './utils.js'
import type { SmithersStreamPart } from '../streaming/types.js'

export interface AgentsModule {
  start: (prompt: string, model?: string, systemPrompt?: string, logPath?: string) => string
  complete: (id: string, result: string, structuredResult?: Record<string, any>, tokens?: { input: number; output: number }) => void
  fail: (id: string, error: string) => void
  setStreamSummary: (id: string, summary: StreamSummary) => void
  recordStreamEvent: (agentId: string, part: SmithersStreamPart) => void
  getStreamEvents: (agentId: string, options?: { types?: string[]; limit?: number }) => AgentStreamEvent[]
  current: () => Agent | null
  list: (executionId: string) => Agent[]
}

export interface AgentsModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
  getCurrentPhaseId: () => string | null
  getCurrentAgentId: () => string | null
  setCurrentAgentId: (id: string | null) => void
}

interface AgentRow {
  id: string
  execution_id: string
  phase_id: string | null
  model: string
  system_prompt: string | null
  prompt: string
  status: string
  result: string | null
  result_structured: string | null
  error: string | null
  tokens_input: number | null
  tokens_output: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  duration_ms: number | null
  log_path: string | null
  tool_calls_count: number
  stream_summary: string | null
}

const mapAgent = (row: AgentRow | null): Agent | null => {
  if (!row) return null
  const agent: Agent = {
    id: row.id,
    execution_id: row.execution_id,
    phase_id: row.phase_id ?? undefined,
    model: row.model,
    system_prompt: row.system_prompt ?? undefined,
    prompt: row.prompt,
    status: row.status as Agent['status'],
    result: row.result ?? undefined,
    result_structured: row.result_structured ? parseJson(row.result_structured, undefined) : undefined,
    log_path: row.log_path ?? undefined,
    error: row.error ?? undefined,
    started_at: row.started_at ? new Date(row.started_at) : undefined,
    completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
    created_at: new Date(row.created_at),
    duration_ms: row.duration_ms ?? undefined,
    tokens_input: row.tokens_input ?? undefined,
    tokens_output: row.tokens_output ?? undefined,
    tool_calls_count: row.tool_calls_count,
  }
  if (row.stream_summary) {
    const parsed = parseJson<StreamSummary | null>(row.stream_summary, null)
    if (parsed) {
      agent.stream_summary = parsed
    }
  }
  return agent
}

export function createAgentsModule(ctx: AgentsModuleContext): AgentsModule {
  const { rdb, getCurrentExecutionId, getCurrentPhaseId, getCurrentAgentId, setCurrentAgentId } = ctx

  const agents: AgentsModule = {
    start: (prompt: string, model: string = 'sonnet', systemPrompt?: string, logPath?: string): string => {
      if (rdb.isClosed) {
        return uuid()
      }
      const currentExecutionId = getCurrentExecutionId()
      const currentPhaseId = getCurrentPhaseId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO agents (id, execution_id, phase_id, model, system_prompt, prompt, status, started_at, created_at, log_path)
         VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)`,
        [id, currentExecutionId, currentPhaseId, model, systemPrompt ?? null, prompt, now(), now(), logPath ?? null]
      )
      rdb.run('UPDATE executions SET total_agents = total_agents + 1 WHERE id = ?', [currentExecutionId])
      setCurrentAgentId(id)
      return id
    },

    complete: (id: string, result: string, structuredResult?: Record<string, any>, tokens?: { input: number; output: number }) => {
      if (rdb.isClosed) return
      const startRow = rdb.queryOne<{ started_at: string; execution_id: string }>('SELECT started_at, execution_id FROM agents WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
      rdb.run(
        `UPDATE agents SET status = 'completed', result = ?, result_structured = ?, tokens_input = ?, tokens_output = ?, completed_at = ?, duration_ms = ? WHERE id = ?`,
        [result, structuredResult ? JSON.stringify(structuredResult) : null, tokens?.input ?? null, tokens?.output ?? null, now(), durationMs, id]
      )
      if (tokens && startRow) {
        rdb.run('UPDATE executions SET total_tokens_used = total_tokens_used + ? WHERE id = ?',
          [(tokens.input ?? 0) + (tokens.output ?? 0), startRow.execution_id])
      }
      if (getCurrentAgentId() === id) setCurrentAgentId(null)
    },

    fail: (id: string, error: string) => {
      if (rdb.isClosed) return
      rdb.run(`UPDATE agents SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`, [error, now(), id])
      if (getCurrentAgentId() === id) setCurrentAgentId(null)
    },

    setStreamSummary: (id: string, summary: StreamSummary) => {
      if (rdb.isClosed) {
        return
      }
      rdb.run(`UPDATE agents SET stream_summary = ? WHERE id = ?`, [JSON.stringify(summary), id])
    },

    recordStreamEvent: (agentId: string, part: SmithersStreamPart) => {
      if (rdb.isClosed) {
        return
      }
      const eventId =
        "id" in part ? part.id :
        "toolCallId" in part ? part.toolCallId :
        undefined
      const toolName =
        "toolName" in part ? part.toolName :
        undefined

      rdb.run(
        `INSERT INTO agent_stream_events (id, agent_id, event_type, event_id, tool_name, content, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          agentId,
          part.type,
          eventId ?? null,
          toolName ?? null,
          JSON.stringify(part),
          Date.now(),
          now(),
        ]
      )
    },

    getStreamEvents: (agentId: string, options?: { types?: string[]; limit?: number }): AgentStreamEvent[] => {
      if (rdb.isClosed) {
        return []
      }
      const types = options?.types ?? []
      const limit = options?.limit ?? 1000
      if (types.length > 0) {
        const placeholders = types.map(() => '?').join(', ')
        return rdb.query<AgentStreamEvent>(
          `SELECT * FROM agent_stream_events WHERE agent_id = ? AND event_type IN (${placeholders}) ORDER BY timestamp DESC LIMIT ?`,
          [agentId, ...types, limit]
        )
      }
      return rdb.query<AgentStreamEvent>(
        `SELECT * FROM agent_stream_events WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?`,
        [agentId, limit]
      )
    },

    current: (): Agent | null => {
      if (rdb.isClosed) return null
      const currentAgentId = getCurrentAgentId()
      if (!currentAgentId) return null
      return mapAgent(rdb.queryOne('SELECT * FROM agents WHERE id = ?', [currentAgentId]))
    },

    list: (executionId: string): Agent[] => {
      if (rdb.isClosed) return []
      return rdb.query<any>('SELECT * FROM agents WHERE execution_id = ? ORDER BY created_at', [executionId])
        .map(mapAgent)
        .filter((a): a is Agent => a !== null)
    },
  }

  return agents
}
