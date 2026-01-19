import type { ReactNode } from 'react'
import { PlanNodeProvider, usePlanNodeProps } from './PlanNodeContext.js'

export interface PersonaProps {
  role?: string
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Persona component - defines a persona/role for Claude.
 *
 * Personas are typically rendered as part of the system message
 * when executing a Claude component.
 *
 * @example
 * ```tsx
 * <Claude>
 *   <Persona role="security expert">
 *     You specialize in application security and code review.
 *   </Persona>
 *   Review this code for vulnerabilities.
 * </Claude>
 * ```
 */
export function Persona(props: PersonaProps): ReactNode {
  const { nodeId, planNodeProps } = usePlanNodeProps()
  return (
    <PlanNodeProvider nodeId={nodeId}>
      <persona {...(props.role ? { role: props.role } : {})} {...planNodeProps}>
        {props.children}
      </persona>
    </PlanNodeProvider>
  )
}
