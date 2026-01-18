import type { ReactNode } from 'react'

export interface SubagentProps {
  name?: string
  parallel?: boolean
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Subagent component - wraps child components in a named execution boundary.
 *
 * Subagents provide:
 * - Named execution scopes for better debugging
 * - Optional parallel execution when parallel=true
 * - Grouping of related Claude calls
 *
 * @example
 * ```tsx
 * <Subagent name="researcher" parallel={true}>
 *   <Claude>Research topic A</Claude>
 *   <Claude>Research topic B</Claude>
 * </Subagent>
 * ```
 */
export function Subagent(props: SubagentProps): ReactNode {
  return (
    <subagent name={props.name} parallel={props.parallel}>
      {props.children}
    </subagent>
  )
}
