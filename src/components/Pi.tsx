import type { ReactNode } from 'react'
import { useAgentRunner } from '../hooks/useAgentRunner.js'
import { PiAdapter } from '../hooks/adapters/pi.js'
import { AgentRenderer } from './AgentRenderer.js'
import type { PiProps } from './agents/types/pi.js'
import type { AgentResult } from './agents/types/execution.js'

export function Pi(props: PiProps): ReactNode {
  const { status, agentId, executionId, result, error, tailLog } = useAgentRunner(props, PiAdapter)
  const label = props.model ?? 'pi'

  return (
    <AgentRenderer
      tag="pi"
      status={status}
      agentId={agentId}
      executionId={executionId}
      modelOrMode={label}
      modelAttrName="model"
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

export type { PiProps, AgentResult }
export { executePiCLI } from './agents/pi-cli/executor.js'
