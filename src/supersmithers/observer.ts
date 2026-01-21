import type { SmithersDB } from '../db/index.js'
import type { SuperSmithersMetrics, SuperSmithersErrorEvent } from './types.js'

export function collectMetrics(
  db: SmithersDB,
  executionId: string,
  _currentIteration: number
): SuperSmithersMetrics {
  const tokenStats = db.db.queryOne<{ input: number; output: number; count: number }>(
    `SELECT 
      COALESCE(SUM(tokens_input), 0) as input,
      COALESCE(SUM(tokens_output), 0) as output,
      COUNT(*) as count
    FROM agents WHERE execution_id = ?`,
    [executionId]
  ) ?? { input: 0, output: 0, count: 0 }

  const errorCount = db.db.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM agents 
     WHERE execution_id = ? AND status = 'failed'`,
    [executionId]
  )?.count ?? 0

  const toolErrorCount = db.db.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM tool_calls 
     WHERE execution_id = ? AND status = 'failed'`,
    [executionId]
  )?.count ?? 0

  const phaseTiming = db.db.query<{ duration_ms: number }>(
    `SELECT duration_ms FROM phases 
     WHERE execution_id = ? AND duration_ms IS NOT NULL`,
    [executionId]
  )
  const avgIterationTimeMs = phaseTiming.length > 0
    ? phaseTiming.reduce((sum, p) => sum + p.duration_ms, 0) / phaseTiming.length
    : 0

  const stallCount = detectStallCount(db, executionId)
  const isStalled = detectStall(db, executionId)

  return {
    tokensInput: tokenStats.input,
    tokensOutput: tokenStats.output,
    agentCount: tokenStats.count,
    errorCount: errorCount + toolErrorCount,
    stallCount,
    isStalled,
    avgIterationTimeMs,
  }
}

export function collectErrors(
  db: SmithersDB,
  executionId: string
): SuperSmithersErrorEvent[] {
  const errors: SuperSmithersErrorEvent[] = []

  const failedAgents = db.db.query<{ error: string; created_at: string; prompt: string }>(
    `SELECT error, created_at, prompt FROM agents 
     WHERE execution_id = ? AND status = 'failed' AND error IS NOT NULL
     ORDER BY created_at DESC LIMIT 10`,
    [executionId]
  )
  for (const agent of failedAgents) {
    errors.push({
      at: agent.created_at,
      kind: 'agent',
      message: agent.error,
      signature: hashSignature(`agent:${agent.error.slice(0, 100)}`),
    })
  }

  const failedTools = db.db.query<{ error: string; created_at: string; tool_name: string }>(
    `SELECT error, created_at, tool_name FROM tool_calls 
     WHERE execution_id = ? AND status = 'failed' AND error IS NOT NULL
     ORDER BY created_at DESC LIMIT 10`,
    [executionId]
  )
  for (const tool of failedTools) {
    errors.push({
      at: tool.created_at,
      kind: 'tool',
      message: tool.error,
      signature: hashSignature(`tool:${tool.tool_name}:${tool.error.slice(0, 50)}`),
    })
  }

  return errors.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10)
}

export function detectStall(
  db: SmithersDB,
  executionId: string,
  threshold: number = 3
): boolean {
  const recentFrames = db.db.query<{ tree_xml: string }>(
    `SELECT tree_xml FROM render_frames 
     WHERE execution_id = ? 
     ORDER BY sequence_number DESC LIMIT ?`,
    [executionId, threshold]
  )

  if (recentFrames.length < threshold) {
    return false
  }

  const firstXml = recentFrames[0]?.tree_xml
  const allSame = recentFrames.every(f => f.tree_xml === firstXml)
  if (allSame) {
    return true
  }

  const recentAgentActivity = db.db.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM agents 
     WHERE execution_id = ? 
     AND created_at > datetime('now', '-5 minutes')`,
    [executionId]
  )?.count ?? 0

  return recentAgentActivity === 0
}

function detectStallCount(
  db: SmithersDB,
  executionId: string
): number {
  const frames = db.db.query<{ tree_xml: string; sequence_number: number }>(
    `SELECT tree_xml, sequence_number FROM render_frames 
     WHERE execution_id = ? 
     ORDER BY sequence_number ASC`,
    [executionId]
  )

  let stallCount = 0
  let consecutiveSame = 1

  for (let i = 1; i < frames.length; i++) {
    if (frames[i]?.tree_xml === frames[i - 1]?.tree_xml) {
      consecutiveSame++
      if (consecutiveSame >= 3) {
        stallCount++
        consecutiveSame = 1
      }
    } else {
      consecutiveSame = 1
    }
  }

  return stallCount
}

function hashSignature(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `sig_${Math.abs(hash).toString(16).padStart(8, '0')}`
}
