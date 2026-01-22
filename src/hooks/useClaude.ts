import { useAgentRunner, type UseAgentResult } from './useAgentRunner.js'
import { ClaudeAdapter } from './adapters/claude.js'
import type { ClaudeProps } from '../components/agents/types.js'
import type { AgentResult } from '../components/agents/types/execution.js'
import type { TailLogEntry } from '../components/agents/claude-cli/message-parser.js'

export interface UseClaudeResult {
  status: 'pending' | 'running' | 'complete' | 'error'
  agentId: string | null
  executionId: string | null
  model: string
  result: AgentResult | null
  error: Error | null
  tailLog: TailLogEntry[]
}

export function useClaude(props: ClaudeProps): UseClaudeResult {
  const baseResult: UseAgentResult = useAgentRunner(props, ClaudeAdapter)
  return { ...baseResult, model: props.model ?? 'sonnet' }
}
