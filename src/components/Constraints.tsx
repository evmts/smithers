import type { ReactNode } from 'react'
import { PlanNodeProvider, usePlanNodeProps } from './PlanNodeContext.js'

export interface ConstraintsProps {
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Constraints component - defines constraints for Claude's responses.
 *
 * Constraints are added to the prompt to guide Claude's behavior.
 *
 * @example
 * ```tsx
 * <Claude>
 *   <Constraints>
 *     - Keep responses concise
 *     - Focus on security
 *     - Cite sources
 *   </Constraints>
 *   Analyze this code
 * </Claude>
 * ```
 */
export function Constraints(props: ConstraintsProps): ReactNode {
  const { nodeId, planNodeProps } = usePlanNodeProps()
  return (
    <PlanNodeProvider nodeId={nodeId}>
      <constraints {...planNodeProps}>
        {props.children}
      </constraints>
    </PlanNodeProvider>
  )
}
