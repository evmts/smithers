import type { ReactNode } from 'react'
import { useClaude } from '../hooks/useClaude.js'
import { AgentRenderer } from './AgentRenderer.js'
import type { ClaudeProps, AgentResult } from './agents/types.js'

export function Claude(props: ClaudeProps): ReactNode {
  const { status, agentId, executionId, model, result, error, tailLog } = useClaude(props)

  return (
    <AgentRenderer
      tag="claude"
      status={status}
      agentId={agentId}
      executionId={executionId}
      modelOrMode={model}
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

export type { ClaudeProps, AgentResult }
export { executeClaudeCLI } from './agents/ClaudeCodeCLI.js'
