import { useAgentRunner, type UseAgentResult } from './useAgentRunner.js'
import { OpenCodeAdapter } from './adapters/opencode.js'
import type { OpenCodeProps } from '../components/agents/types/opencode.js'

export interface UseOpenCodeResult extends UseAgentResult {
  model: string
}

export function useOpenCode(props: OpenCodeProps): UseOpenCodeResult {
  const baseResult: UseAgentResult = useAgentRunner(props, OpenCodeAdapter)
  return { ...baseResult, model: props.model ?? 'opencode/big-pickle' }
}
