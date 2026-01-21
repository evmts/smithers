// Codex agent hook - thin wrapper around useAgentRunner
import { useAgentRunner, type UseAgentResult } from './useAgentRunner.js'
import { CodexAdapter } from './adapters/codex.js'
import type { CodexProps } from '../components/agents/types/codex.js'
import type { AgentResult } from '../components/agents/types/execution.js'
import type { TailLogEntry } from '../components/agents/claude-cli/message-parser.js'

export interface UseCodexResult {
  status: 'pending' | 'running' | 'complete' | 'error'
  agentId: string | null
  executionId: string | null
  model: string
  result: AgentResult | null
  error: Error | null
  tailLog: TailLogEntry[]
}

export function useCodex(props: CodexProps): UseCodexResult {
  const baseResult: UseAgentResult = useAgentRunner(props, CodexAdapter)
  return { ...baseResult, model: props.model ?? 'o4-mini' }
}
