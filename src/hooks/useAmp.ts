import { useAgentRunner, type UseAgentResult } from './useAgentRunner.js'
import { AmpAdapter } from './adapters/amp.js'
import type { AmpProps } from '../components/agents/types/amp.js'
import type { AgentResult } from '../components/agents/types/execution.js'
import type { TailLogEntry } from '../components/agents/claude-cli/message-parser.js'

export interface UseAmpResult {
  status: 'pending' | 'running' | 'complete' | 'error'
  agentId: string | null
  executionId: string | null
  mode: string
  result: AgentResult | null
  error: Error | null
  tailLog: TailLogEntry[]
}

export function useAmp(props: AmpProps): UseAmpResult {
  const baseResult: UseAgentResult = useAgentRunner(props, AmpAdapter)
  return { ...baseResult, mode: props.mode ?? 'smart' }
}
