// Tool call tracking module for Smithers DB

import type { ReactiveDatabase } from '../../reactive-sqlite'
import type { ToolCall } from './types.js'
import { uuid, now, parseJson } from './utils.js'

export interface ToolsModule {
  start: (agentId: string, toolName: string, input: Record<string, any>) => string
  complete: (id: string, output: string, summary?: string) => void
  fail: (id: string, error: string) => void
  list: (agentId: string) => ToolCall[]
  getOutput: (id: string) => string | null
}

export interface ToolsModuleContext {
  rdb: ReactiveDatabase
  getCurrentExecutionId: () => string | null
}

// Helper to map row to typed object with JSON parsing
const mapToolCall = (row: any): ToolCall | null => {
  if (!row) return null
  return {
    ...row,
    input: parseJson(row.input, {}),
  }
}

export function createToolsModule(ctx: ToolsModuleContext): ToolsModule {
  const { rdb, getCurrentExecutionId } = ctx

  const tools: ToolsModule = {
    start: (agentId: string, toolName: string, input: Record<string, any>): string => {
      const currentExecutionId = getCurrentExecutionId()
      if (!currentExecutionId) throw new Error('No active execution')
      const id = uuid()
      rdb.run(
        `INSERT INTO tool_calls (id, agent_id, execution_id, tool_name, input, status, started_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`,
        [id, agentId, currentExecutionId, toolName, JSON.stringify(input), now(), now()]
      )
      rdb.run('UPDATE executions SET total_tool_calls = total_tool_calls + 1 WHERE id = ?', [currentExecutionId])
      rdb.run('UPDATE agents SET tool_calls_count = tool_calls_count + 1 WHERE id = ?', [agentId])
      return id
    },

    complete: (id: string, output: string, summary?: string) => {
      const startRow = rdb.queryOne<{ started_at: string }>('SELECT started_at FROM tool_calls WHERE id = ?', [id])
      const durationMs = startRow ? Date.now() - new Date(startRow.started_at).getTime() : null
      const outputSize = Buffer.byteLength(output, 'utf8')

      if (outputSize < 1024) {
        rdb.run(
          `UPDATE tool_calls SET status = 'completed', output_inline = ?, output_summary = ?, output_size_bytes = ?, completed_at = ?, duration_ms = ? WHERE id = ?`,
          [output, summary ?? null, outputSize, now(), durationMs, id]
        )
      } else {
        rdb.run(
          `UPDATE tool_calls SET status = 'completed', output_summary = ?, output_size_bytes = ?, completed_at = ?, duration_ms = ? WHERE id = ?`,
          [summary ?? output.slice(0, 200), outputSize, now(), durationMs, id]
        )
      }
    },

    fail: (id: string, error: string) => {
      rdb.run(`UPDATE tool_calls SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`, [error, now(), id])
    },

    list: (agentId: string): ToolCall[] => {
      return rdb.query<any>('SELECT * FROM tool_calls WHERE agent_id = ? ORDER BY created_at', [agentId])
        .map(mapToolCall)
        .filter((t): t is ToolCall => t !== null)
    },

    getOutput: (id: string): string | null => {
      const row = rdb.queryOne<{ output_inline: string | null }>('SELECT output_inline FROM tool_calls WHERE id = ?', [id])
      return row?.output_inline ?? null
    },
  }

  return tools
}
