import type { ReactNode } from 'react'

export interface PhaseProps {
  name?: string
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Phase component - groups steps semantically.
 * Provides semantic structure to agent workflows.
 */
export function Phase(props: PhaseProps): ReactNode {
  const { children, ...rest } = props
  return (
    <phase {...rest}>
      {children}
    </phase>
  )
}
