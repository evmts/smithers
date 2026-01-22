import { useAgentRunner, type UseAgentResult } from './useAgentRunner.js'
import { ClaudeAdapter } from './adapters/claude.js'
import type { ClaudeProps } from '../components/agents/types.js'

export interface UseClaudeResult extends UseAgentResult {
  model: string
}

export function useClaude(props: ClaudeProps): UseClaudeResult {
  const baseResult: UseAgentResult = useAgentRunner(props, ClaudeAdapter)
  return { ...baseResult, model: props.model ?? 'sonnet' }
}
