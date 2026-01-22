import type { ReactNode } from 'react'
import { useCodex } from '../hooks/useCodex.js'
import { AgentRenderer } from './AgentRenderer.js'
import type { CodexProps } from './agents/types/codex.js'

export function Codex(props: CodexProps): ReactNode {
  const { status, agentId, executionId, model, result, error, tailLog } = useCodex(props)

  return (
    <AgentRenderer
      tag="codex"
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

export type { CodexProps }
export { executeCodexCLI } from './agents/codex-cli/index.js'
