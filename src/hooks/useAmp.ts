import { useAgentRunner, type UseAgentResult } from './useAgentRunner.js'
import { AmpAdapter } from './adapters/amp.js'
import type { AmpProps } from '../components/agents/types/amp.js'

export interface UseAmpResult extends UseAgentResult {
  mode: string
}

export function useAmp(props: AmpProps): UseAmpResult {
  const baseResult: UseAgentResult = useAgentRunner(props, AmpAdapter)
  return { ...baseResult, mode: props.mode ?? 'smart' }
}
