import type { ReactNode } from 'react'
import { PlanNodeProvider, usePlanNodeProps } from './PlanNodeContext.js'

export interface ClaudeApiProps {
  children?: ReactNode
  model?: string
  maxTurns?: number
  tools?: string[]
  systemPrompt?: string
  onFinished?: (result: unknown) => void
  onError?: (error: Error) => void
  [key: string]: unknown
}

/**
 * ClaudeApi component - alternative executor using the Anthropic API directly.
 *
 * @experimental This component is not yet implemented. It currently renders
 * a placeholder element. Use the Claude component for working agent execution.
 *
 * Unlike the standard Claude component which uses Claude Code CLI,
 * ClaudeApi will use the Anthropic SDK directly for API calls (when implemented).
 *
 * @example
 * ```tsx
 * <ClaudeApi model="claude-sonnet-4">
 *   Generate a haiku about programming
 * </ClaudeApi>
 * ```
 */
export function ClaudeApi(props: ClaudeApiProps): ReactNode {
  const { nodeId, planNodeProps } = usePlanNodeProps()
  return (
    <PlanNodeProvider nodeId={nodeId}>
      <claude-api model={props.model} {...planNodeProps}>
        {props.children}
      </claude-api>
    </PlanNodeProvider>
  )
}
