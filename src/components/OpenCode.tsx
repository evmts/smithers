import type { ReactNode } from 'react'
import { useOpenCode } from '../hooks/useOpenCode.js'
import { AgentRenderer } from './AgentRenderer.js'
import type { OpenCodeProps } from './agents/types/opencode.js'
import type { AgentResult } from './agents/types/execution.js'

/**
 * OpenCode agent component that runs prompts via the OpenCode SDK.
 *
 * Supports 75+ LLM providers including OpenCode Zen models like Big Pickle,
 * GPT-5.2, Claude Sonnet 4.5, Gemini 3 Pro, and more.
 *
 * @example
 * ```tsx
 * // Use Big Pickle (free stealth model)
 * <OpenCode model="opencode/big-pickle">
 *   Analyze this codebase and suggest improvements
 * </OpenCode>
 *
 * // Use GPT-5.2 via OpenCode Zen
 * <OpenCode model="opencode/gpt-5.2-codex" agent="coder">
 *   Implement the feature described in the task
 * </OpenCode>
 *
 * // Use Claude directly
 * <OpenCode model="anthropic/claude-sonnet-4-5">
 *   Review this pull request
 * </OpenCode>
 * ```
 */
export function OpenCode(props: OpenCodeProps): ReactNode {
  const { status, agentId, executionId, model, result, error, tailLog } = useOpenCode(props)

  return (
    <AgentRenderer
      tag="opencode"
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

export type { OpenCodeProps, AgentResult }
export { executeOpenCode } from './agents/OpenCodeSDK.js'
