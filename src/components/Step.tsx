import type { ReactNode } from 'react'

export interface StepProps {
  name?: string
  children?: ReactNode
  [key: string]: unknown
}

/**
 * Step component - represents a single step within a phase.
 * Provides semantic structure to agent workflows.
 */
export function Step(props: StepProps): ReactNode {
  return (
    <step name={props.name}>
      {props.children}
    </step>
  )
}
