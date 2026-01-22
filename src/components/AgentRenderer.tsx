import type { ReactNode } from 'react'
import { truncateToLastLines } from './agents/claude-cli/message-parser.js'

export type AgentStatus = 'idle' | 'pending' | 'running' | 'complete' | 'error'

export interface LogEntry {
  type: 'message' | 'tool-call'
  index: number
  content: string
  toolName?: string
}

export interface AgentResult {
  tokensUsed?: { input?: number; output?: number }
  turnsUsed?: number
  durationMs?: number
}

export interface AgentRendererProps {
  tag: string
  status: AgentStatus
  agentId: string | null
  executionId?: string | null
  modelOrMode?: string
  modelAttrName: 'model' | 'mode'
  result?: AgentResult | null
  error?: Error | null
  tailLog: LogEntry[]
  tailLogCount?: number
  tailLogLines?: number
  children?: ReactNode
}

export function AgentRenderer({
  tag,
  status,
  agentId,
  executionId,
  modelOrMode,
  modelAttrName,
  result,
  error,
  tailLog,
  tailLogCount = 10,
  tailLogLines = 10,
  children,
}: AgentRendererProps): ReactNode {
  const displayEntries = status === 'complete'
    ? tailLog.slice(-1)
    : tailLog.slice(-tailLogCount)

  const baseProps = {
    status,
    agentId,
    executionId,
    [modelAttrName]: modelOrMode,
    ...(error?.message ? { error: error.message } : {}),
    ...(result?.tokensUsed?.input !== undefined ? { tokensInput: result.tokensUsed.input } : {}),
    ...(result?.tokensUsed?.output !== undefined ? { tokensOutput: result.tokensUsed.output } : {}),
    ...(result?.turnsUsed !== undefined ? { turnsUsed: result.turnsUsed } : {}),
    ...(result?.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
  }

  const messagesContent = displayEntries.length > 0 && (
    <messages count={displayEntries.length}>
      {displayEntries.map(entry =>
        entry.type === 'message' ? (
          <message key={entry.index} index={entry.index}>
            {truncateToLastLines(entry.content, tailLogLines)}
          </message>
        ) : (
          <tool-call key={entry.index} name={entry.toolName} index={entry.index}>
            {truncateToLastLines(entry.content, tailLogLines)}
          </tool-call>
        )
      )}
    </messages>
  )

  switch (tag) {
    case 'amp':
      return <amp {...baseProps}>{messagesContent}{children}</amp>
    case 'claude':
      return <claude {...baseProps}>{messagesContent}{children}</claude>
    case 'codex':
      return <codex {...baseProps}>{messagesContent}{children}</codex>
    default:
      return <agent {...baseProps} type={tag}>{messagesContent}{children}</agent>
  }
}
