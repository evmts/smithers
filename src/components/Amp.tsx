import type { ReactNode } from 'react'
import { useAmp } from '../hooks/useAmp.js'
import { AgentRenderer } from './AgentRenderer.js'
import type { AmpProps } from './agents/types/amp.js'

export function Amp(props: AmpProps): ReactNode {
  const { status, agentId, executionId, mode, result, error, tailLog } = useAmp(props)

  return (
    <AgentRenderer
      tag="amp"
      status={status}
      agentId={agentId}
      executionId={executionId}
      modelOrMode={mode}
      modelAttrName="mode"
      result={result}
      error={error}
      tailLog={tailLog}
      tailLogCount={props.tailLogCount}
      tailLogLines={props.tailLogLines}
    >
      {props.children}
    </AgentRenderer>
  )
}

export type { AmpProps }
export { executeAmpCLI } from './agents/amp-cli/executor.js'
