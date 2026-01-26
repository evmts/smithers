import { useAgentRunner, type UseAgentResult } from './useAgentRunner.js'
import { CodexAdapter } from './adapters/codex.js'
import type { CodexProps } from '../components/agents/types/codex.js'

export interface UseCodexResult extends UseAgentResult {
  model: string
}

export function useCodex(props: CodexProps): UseCodexResult {
  const baseResult: UseAgentResult = useAgentRunner(props, CodexAdapter)
  return { ...baseResult, model: props.model ?? 'gpt-5.2-codex' }
}
